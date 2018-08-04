/**
 * @author yawenxu
 * @date 2018/7/23
 */

const utils = require('../common/utils');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');

const STORAGE_PATH = path.join(__dirname, '../../files');

const STATUS = {
    ready: 1,
    start: 2,
    transfer: 3,
    transferSuccess: 4,
    composeStart: 5,
    compose: 6,
    composeSuccess: 7,
    composeError: 8,
    removePackagePartStart: 9,
    removePackagePart: 10,
    removePackageSuccess: 11,
    removePackageError: 12,
    stop: 13,
    success: 999,
    error: 1000,
};

class FileIO {
    constructor(io) {
        const fileIO = io.of('/file');

        fileIO.on('connection', (socket) => {
            console.log('file connection ', socket.id);
            const me = this;
            socket.emit('connected', 'ok'); // 通知client已经连接成功
            socket.passedLength = 0;
            socket.isConnect = true;
            socket.transferStartTime = 0;

            socket.on('headerPackage', (data) => {
                utils.console('accept header package', data);
                socket.info = {};
                socket.info._id = data._id;


                utils.console('accept header package', data);
                data.type = 'create';
                const now = new Date();
                const relativePath = path.join(`${now.getFullYear()}`, `${now.getMonth() + 1}`, `${now.getDate()}`, data._id);

                const mainTaskInfo = {
                    data,
                    relativePath,
                    targetDir: path.join(STORAGE_PATH, relativePath),
                    status: STATUS.start,
                    acceptPackagePart: {},
                    filePath: '',
                    error: '',
                    socketId: socket.id,
                };

                fse.ensureDirSync(mainTaskInfo.targetDir);

                socket.task = Object.assign({}, mainTaskInfo);
                socket.emit('transfer_start');      // 通知客户端开始传输文件内容
                socket.transferStartTime = Date.now();
                socket.status = STATUS.transfer;
                me.showProgress(socket);           // 计算进度和速度
            })

            socket.on('fileBuffer', (buffer, data) => {
                const task = socket.task;
                const filename = path.join(task.targetDir, data._id);
                const writeStream = fs.createWriteStream(filename);
                writeStream.write(buffer);
                writeStream.on('finish', () => {
                    if (data.status === STATUS.error) {
                        fs.unlinkSync(filename);
                        socket.status = STATUS.error;
                        socket.emit('transfer_package_error', data);
                        return false;
                    }

                    socket.passedLength += data.size;
                    socket.task.acceptPackagePart[data._id] = data;

                    socket.emit('transfer_package_success', data);
                    socket.emit('transfer_package_finish', data);

                    if (me.isGetAllPackage(socket.task)) {
                        // get all package and compose file

                        utils.console('compose file');
                        me.composeFile(socket, () => {
                            me.removePackageParts(socket, () => {
                                const totalSize = socket.task.data.size;
                                const totalTime = Date.now() - socket.transferStartTime;
                                const speed = totalTime ? `${utils.formatSize(totalSize * 1000 / totalTime)}/s` : '';
                                const postData = {
                                    progress: '100',
                                    speed,
                                    receiveSize: socket.passedLength,
                                    totalSize,
                                };

                                const task = socket.task;
                                task.status = STATUS.success;
                                socket.emit('complete', postData);
                                socket.disconnect();
                            });
                        });
                    }
                });

                writeStream.on('error', (err) => {
                    data.status = STATUS.error;
                    data.error = err;
                    socket.status = STATUS.error;
                    socket.emit('error', err)
                });
                writeStream.end();
            })

            socket.on('error', (err) => {
                utils.console(`socket error socket id: ${socket.id}`, err);
                socket.emit('transfer_error', err);
                me.removePackageParts(socket, () => {
                    console.log('remove all parts');
                })
                socket.disconnect();
                socket.status = STATUS.error;
            });

            socket.on('disconnect', () => {
                socket.isConnect = false;
                me.removePackageParts(socket, () => {
                    console.log('remove all parts');
                });
                utils.console(`disconnect with client :${socket.id}`);
            });

            socket.on('stop', (data) => {
                socket.status = STATUS.stop;
            });

            socket.on('restart', () => {
                socket.status = STATUS.transfer;
                socket.emit('transfer_package_finish', '');
            });

        })
    }

    showProgress(socket) {
        const taskData = socket.task.data;
        const totalSize = taskData.size;
        const startTime = Date.now();
        const interval = 2000;
        let lastSize = 0;

        const show = function () {
            let percent = Math.ceil((socket.passedLength / totalSize) * 100);
            const averageSpeed = (socket.passedLength - lastSize) / interval * 1000;

            if (percent > 100) {
                percent = 100;
            }

            lastSize = socket.passedLength;

            utils.console(`任务(${taskData.name} - ${taskData._id})已接收${utils.formatSize(socket.passedLength)}, ${percent}%, 平均速度：${utils.formatSize(averageSpeed)}/s`);

            const avs = socket.passedLength >= totalSize ? totalSize / ((Date.now() - startTime) / 1000) : averageSpeed;
            const postData = {
                progress: percent,
                speed: `${utils.formatSize(avs)}/s`,
                receiveSize: socket.passedLength,
                totalSize,
            };

            socket.emit('transfer_progress', postData);

            if (socket.passedLength >= totalSize) {
                console.log(`共用时：${(Date.now() - startTime) / 1000}秒`);
            } else {
                if (!socket.isConnect) {
                    utils.console('---- disconnect ----');
                    return false;
                }
                setTimeout(() => {
                    show();
                }, interval);
            }
        };

        show();
    }

    isGetAllPackage (task) {
        if (!task) {
            throw new Error('task is not exist.');
        }

        const order = task.data.order;
        const acceptPackagePart = task.acceptPackagePart;
        let flag = true;

        for (let i = 0, len = order.length; i < len; i++) {
            if (!acceptPackagePart[order[i]]) {
                flag = false;
                break;
            }
        }

        return flag;
    }

    composeFile (socket, cb) {
        const task = socket.task;

        if (!task) {
            throw new Error('task is not exist.');
        }

        const order = task.data.order;
        const name = task.data.name.replace(/[\\\/:*?"<>|”]/img, '_');
        // const filePath = path.join(STORAGE_PATH, taskId, name);
        const filePath = path.join(task.targetDir, name);
        const len = order.length;

        // updateStatus(socket, STATUS.composeStart);

        const writeFile = function (index, start) {
            const packagePartId = order[index];
            const packageInfo = task.acceptPackagePart[packagePartId];
            const ws = fs.createWriteStream(filePath, { start, flags: start > 0 ? 'r+' : 'w', encoding: 'binary' });
            const fp = path.join(task.targetDir, packagePartId);
            const rs = fs.createReadStream(fp);

            ws.on('error', (err) => {
                utils.console('write file to storage fail', err);
                socket.emit('transfer_error', err);
                socket.status = STATUS.composeError;
            });

            ws.on('finish', () => {
                if (index < len - 1) {
                    // updateStatus(socket, STATUS.compose);
                    writeFile(index + 1, start + packageInfo.size);
                } else {
                    task.filePath = filePath;
                    // updateStatus(socket, STATUS.composeSuccess);
                    utils.console('compose file success');
                    cb && cb();
                }
            });

            rs.pipe(ws);
        };

        writeFile(0, 0);
    }

    removePackageParts (socket, cb) {
        const task = socket.task;

        if (!task) {
            throw new Error('task is not exist.');
        }

        const order = task.data.order;
        const del = function (index) {
            const partId = order[index];

            if (!partId) {
                utils.console('remove package parts success');
                cb && cb();
                return false;
            }

            const fp = path.join(task.targetDir, partId);

            if (fs.existsSync(fp)) {
                fs.unlinkSync(fp);
            }

            del(index + 1);
        };

        del(0);
    }
}

module.exports = FileIO;
/**
 * @author yawenxu
 * @date 2018/7/25
 */

class ChatIO {
    constructor (io) {
        const chatIO = io.of('/chat');
        const socketIdList = [];
        const userNameList = [];

        chatIO.on('connection', (socket) => {
            console.log('chat connection ', socket.id);

            socket.emit('connected', 'ok');

            socket.on('add user', (username) => {
                const index = userNameList.indexOf(username);
                if (index !== -1) {
                    socket.emit('add user error', `username(${username}) has been registered!`);
                } else {
                    socket.username = username;
                    userNameList.push(username);
                    socketIdList.push(socket.id);
                    socket.emit('add user success', userNameList.length, username);
                    socket.broadcast.emit('user entered', userNameList.length, username, socket.id);
                }
            })

            socket.on('typing', () => {
                socket.broadcast.emit('typing', socket.username);
            })

            socket.on('stop typing', () => {
                console.log('stop typing');
                socket.broadcast.emit('stop typing', socket.username);
            })

            socket.on('new message', (message) => {
                socket.broadcast.emit('new message', message, socket.username, socket.id);
            })

            socket.on('disconnect', () => {
                console.log('chat disconnected ', socket.id, socket.username);
                const index = userNameList.indexOf(socket.id);
                if (index) {
                    socketIdList.splice(index, 1);
                    userNameList.splice(index, 1);
                }
                socket.broadcast.emit('user left', userNameList.length, socket.username);
            })

        });
    }
}

module.exports = ChatIO;
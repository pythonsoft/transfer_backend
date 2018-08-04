/**
 * @author yawenxu
 * @date 2018/7/23
 */

const utils = {};

utils.formatSize = function (size, isNeedUnit) {
    let str = '';
    let unit = 'B';
    if (size < 1000) {
        str = Math.round(size);
    } else if (size < 1000 * 1000) {
        str = Math.round(100 * (size / 1024)) / 100;
        unit = 'KB';
    } else if (size < 1000 * 1000 * 1000) {
        str = Math.round(100 * (size / (1024 * 1024))) / 100;
        unit = 'MB';
    } else {
        str = Math.round(100 * (size / (1024 * 1024 * 1024))) / 100;
        unit = 'GB';
    }
    return isNeedUnit ? { size: str, unit } : (`${str} ${unit}`);
};

utils.console = function (content) {
    console.log(content);
};

module.exports = utils;
/**
 * @author yawenxu
 * @date 2018/7/17
 */

const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const FileIO = require('./socket/fileIO');
const ChatIO = require('./socket/chatIO');

app.get('/', (req, res) => {
    res.sendfile(__dirname + '/index.html');
})

new FileIO(io);
new ChatIO(io);


server.listen(4000);
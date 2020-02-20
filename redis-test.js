const redisServer = require('./redis-server')

redisServer(3000, (socket,command,args) => {
    switch (command.toLowerCase()) {
        case 'command':
            //状态回复 +(state)\r\n
            socket.writeOK()
            break;
        case 'bool':
            socket.writeBoolean(true)
            break;
        case 'get':
            //批量回复 $(contentLength)\r\n(content)\r\n
            //多条时增加 *(contentRows)\r\n$(contentLength)\r\n(content)\r\n
            socket.writeBulk('hello')
            break;
        case 'hgetall':
        case 'lrange':
            //socket.writeRaw('*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n')
            socket.writeMultiBulk(['foo', '', null])
            break;
        case 'err':
        case 'error':
            //错误回复 -(error)\r\n
            socket.writeError('error!!!')
            break;
        case 'number':
            //整数回复 :(number)\r\n
            socket.writeNumber(123)
            break;
        default:
            socket.writeError('unknown command')
            break;
    }
})

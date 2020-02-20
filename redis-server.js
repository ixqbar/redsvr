const net = require('net')
const redisLog = require('debug')('redis')
const RedisSocketHandler = require('./redis-handler')
let redisCommandHandler = null
const server = net.createServer((socket) => {
    let clientAddress = `${socket.remoteAddress}:${socket.remotePort}`
    redisLog(`client ${clientAddress} connected`)

    socket.setEncoding('utf8')
    socket.setKeepAlive(true)
    socket.setTimeout(30000)

    socket.on('error', (err) => {
        redisLog(err)
    })

    socket.on('timeout', () => {
        redisLog(`client ${clientAddress} timeout`)
        socket.destroy()
    })

    socket.on('close', () => {
        redisLog(`client ${clientAddress} closed`)
    })

    new RedisSocketHandler(socket, (socket, command, args) => {
        redisLog(`command: ${command}, args:${args.join(',')}`)
        redisCommandHandler && redisCommandHandler(socket, command, args)
    })
})

function redisServer(port, callback) {
    redisCommandHandler = callback
    server.listen(port, () => {
        redisLog(`server running at ${port}`)
    })
}

module.exports = redisServer

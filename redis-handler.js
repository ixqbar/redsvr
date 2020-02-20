const redisLog = require('debug')('redis')

function RedisSocketHandler(socket, callback) {
    this.socket = socket
    this.callback = callback

    this._process = false
    this._bufferedBytes = 0
    this.queue = []

    this._state = 'PARSE'
    this.command = ''
    this.args = []

    this.socket.on('data', data => {
        this._bufferedBytes += data.length
        this.queue.push(data)

        this._process = true
        this._doData()
    })
}

RedisSocketHandler.prototype._doData = function () {
    while (this._process) {
        switch (this._state) {
            case 'PARSE':
                this._parseData()
                break;
            case 'EXECUTE':
                this.callback(new RedisSocket(this.socket), this.command, this.args)
                this._state = 'PARSE'
                this.command = ''
                this.args = []
                if (this.queue.length == 0) {
                    this._process = false
                }
                break;
        }
    }
}

RedisSocketHandler.prototype._parseData = function () {
    if (!this._hashEnough(4)) {
        this._process = false
        return
    }

    if (this.queue[0][0] != '*') {
        this.socket.destroy()
        this._process = false
        return
    }

    let buf = this.queue.join('')
    let commandMatch = /\*(\d+)\r\n/.exec(buf)
    if (commandMatch === null || commandMatch.length < 2) {
        this.socket.destroy()
        this._process = false
        return
    }

    redisLog(commandMatch)

    let commandLen = parseInt(commandMatch[1])
    redisLog(`got command len: ${commandLen}`)

    if (!this._hashEnough(commandMatch[1].length + 3)) {
        this._process = false
        return
    }

    //丢弃 *(命令个数)\r\n
    this._readBytes(commandMatch[1].length + 3)
    buf = buf.slice(commandMatch[1].length + 3)

    let parsedCommand = 0
    let doReadHeader = true
    let contentLen = 0
    while (parsedCommand < commandLen) {
        if (doReadHeader) {
            if (!this._hashEnough(4)) {
                this._process = false
                return
            }

            if (this.queue[0][0] != '$') {
                this.socket.destroy()
                this._process = false
                return
            }

            let contentMatch = /\$(\d+)\r\n/.exec(buf)
            if (contentMatch === null || contentMatch.length < 2) {
                this.socket.destroy()
                this._process = false
                return
            }

            redisLog(contentMatch)
            contentLen = parseInt(contentMatch[1])

            //丢弃 $(内容长度)\r\n
            this._readBytes(commandMatch[1].length + 3)
            buf = buf.slice(commandMatch[1].length + 3)

            redisLog(`contentLen:${contentLen}`)
            redisLog(`buf:${buf}`)

            doReadHeader = false
        } else {
            if (!this._hashEnough(contentLen + 2)) {
                this._process = false
                return
            }

            let content = this._readBytes(contentLen + 2).slice(0, -2)
            buf = buf.slice(contentLen + 2)

            if (this.command == '') {
                this.command = content
            } else {
                this.args.push(content)
            }

            parsedCommand++
            doReadHeader = true
        }
    }

    redisLog(`left buf length:${this.queue.join('').length}`)

    this._process = true
    this._state = 'EXECUTE'
}

RedisSocketHandler.prototype._hashEnough = function (size) {
    if (this._bufferedBytes >= size) {
        return true
    }
    return false
}

RedisSocketHandler.prototype._readBytes = function (size) {
    let result
    this._bufferedBytes -= size

    if (size == this.queue[0].length) {
        return this.queue.shift()
    }

    if (size < this.queue[0].length) {
        //api str.slice(beginIndex[, endIndex])
        result = this.queue[0].slice(0, size)
        this.queue[0] = this.queue[0].slice(size)
        return result
    }

    result = Buffer.alloc(size)
    let offset = 0
    let length

    while (size > 0) {
        length = this.queue[0].length
        if (size >= length) {
            //api buf.copy(target[, targetStart[, sourceStart[, sourceEnd]]])
            this.queue[0].copy(result, offset)
            offset += length
            this.queue.shift()
        } else {
            this.queue[0].copy(result, offset, 0, size)
            this.queue[0] = this.queue[0].slice(size)
        }

        size -= length
    }

    return result
}

function RedisSocket(socket) {
    this.socket = socket
}

RedisSocket.prototype.writeRaw = function (data) {
    redisLog(`response:${data}`)
    this.socket.write(data, 'utf8')
}

RedisSocket.prototype.writeOK = function () {
    this.writeState('OK')
}

RedisSocket.prototype.writePONG = function (number) {
    this.writeState('PONG')
}

RedisSocket.prototype.writeState = function (state) {
    this.writeRaw('+${state}\r\n')
}

RedisSocket.prototype.writeError = function (data) {
    this.writeRaw(`-${data}\r\n`)
}

RedisSocket.prototype.writeBoolean = function (ok) {
    ok ? this.writeNumber(1) : this.writeNumber(0)
}

RedisSocket.prototype.writeNumber = function (number) {
    this.writeRaw(`:${number}\r\n`)
}

RedisSocket.prototype.writeBulk = function (data) {
    if (data.length) {
        this.writeRaw(`$${data.length}\r\n${data}\r\n`)
    } else {
        this.writeRaw(`$-1\r\n`)
    }
}

RedisSocket.prototype.writeMultiBulk = function (data) {
    if (!Array.isArray(data)) {
        this.writeRaw(`*-1\r\n`)
    } else {
        let buf = []
        buf.push(`*${data.length}`)
        for (let i in data) {
            if (data[i] !== null) {
                let l = `${data[i]}`.length
                buf.push(`$${l}`)
                buf.push(`${data[i]}`)
            } else {
                buf.push(`$-1`)
            }
        }
        this.writeRaw(buf.join('\r\n') + '\r\n')
    }
}

module.exports = RedisSocketHandler

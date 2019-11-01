console.log('> Script started')
const express = require('express')
const webApp = express()
const webServer = require('http').createServer(webApp)
const io = require('socket.io')(webServer)

const port = process.env.PORT || 3000
const adminUri = process.env.ADMIN_URI || 'admin31ecc0596d72f84e5ee49e6dc2ecfdfdbabae49a3e3'

const game = createGame()
let maxConcurrentConnections = 30

webApp.get('/', function(req, res) {
    res.sendFile(__dirname + '/game.html')
})

// Coisas que só uma POC vai conhecer
webApp.get(`/${adminUri}`, function(req, res) {
    res.sendFile(__dirname + '/game-admin.html')
})

webApp.get('/collect.mp3', function(req, res) {
    res.sendFile(__dirname + '/collect.mp3')
})

webApp.get('/100-collect.mp3', function(req, res) {
    res.sendFile(__dirname + '/100-collect.mp3')
})

webApp.use('/assets', express.static(__dirname + '/assets'));

setInterval(() => {
    io.emit('concurrent-connections', io.engine.clientsCount)
}, 5000)

io.on('connection', function(socket) {
    const admin = socket.handshake.query.admin

    const player_icon = socket.handshake.query.player_icon

    if (io.engine.clientsCount > maxConcurrentConnections && !admin) {
        socket.emit('show-max-concurrent-connections-message')
        socket.conn.close()
        return
    } else {
        socket.emit('hide-max-concurrent-connections-message')
    }

    const playerState = game.addPlayer(socket.id, player_icon)
    socket.emit('bootstrap', game)

    socket.broadcast.emit('player-update', {
        socketId: socket.id,
        newState: playerState
    })

    socket.on('player-move', (direction) => {
        game.movePlayer(socket.id, direction)

        const fruitColisionIds = game.checkForFruitColision()

        socket.broadcast.emit('player-update', {
            socketId: socket.id,
            newState: game.players[socket.id]
        })

        if (fruitColisionIds) {
            io.emit('fruit-remove', {
                fruitId: fruitColisionIds.fruitId,
                score: game.players[socket.id].score,
                socket_id_score: socket.id
            })
            socket.emit('update-player-score', game.players[socket.id].score)
        }

    })

    socket.on('disconnect', () => {
        game.removePlayer(socket.id)
        socket.broadcast.emit('player-remove', socket.id)
    })


    let fruitGameInterval
    socket.on('admin-start-fruit-game', (interval) => {
        console.log('> Fruit Game start')
        clearInterval(fruitGameInterval)

        fruitGameInterval = setInterval(() => {
            const fruitData = game.addFruit()

            if (fruitData) {
                io.emit('fruit-add', fruitData)
            }
        }, interval)
    })

    socket.on('admin-stop-fruit-game', () => {
        console.log('> Fruit Game stop')
        clearInterval(fruitGameInterval)
    })

    socket.on('admin-start-crazy-mode', () => {
        io.emit('start-crazy-mode')
    })

    socket.on('admin-stop-crazy-mode', () => {
        io.emit('stop-crazy-mode')
    })

    socket.on('admin-clear-scores', () => {
        game.clearScores()
        io.emit('bootstrap', game)
    })

    socket.on('admin-concurrent-connections', (newConcurrentConnections) => {
        maxConcurrentConnections = newConcurrentConnections
    })

});

webServer.listen(port, function() {
    console.log('> Server listening on port:', port)
});

function createGame() {
    console.log('> Starting new game')
    let fruitGameInterval

    const game = {
        canvasWidth: 1000,
        canvasHeight: 1000,
        playerW: 25,
        playerH: 25,
        players: {},
        fruits: {},
        addPlayer,
        removePlayer,
        movePlayer,
        addFruit,
        removeFruit,
        checkForFruitColision,
        clearScores,
        velocity: 2,
    }

    function addPlayer(socketId, player_icon) {
        return game.players[socketId] = {
            x: Math.floor(Math.random() * game.canvasWidth),
            y: Math.floor(Math.random() * game.canvasHeight),
            w: game.playerW,
            h: game.playerH,
            player_icon,
            score: 0
        }
    }

    function removePlayer(socketId) {
        delete game.players[socketId]
    }

    function movePlayer(socketId, direction) {
        const player = game.players[socketId]

        if (direction === 'left' && player.x - game.velocity >= 0) {
            player.x = player.x - game.velocity
        }

        if (direction === 'up' && player.y - game.velocity >= 0) {
            player.y = player.y - game.velocity
        }

        if (direction === 'right' && player.x + game.velocity < game.canvasWidth) {
            player.x = player.x + game.velocity
        }

        if (direction === 'down' && player.y + game.velocity < game.canvasHeight) {
            player.y = player.y + game.velocity
        }

        return player
    }

    function addFruit() {
        const fruitRandomId = Math.floor(Math.random() * 10000000)
        const fruitRandomX = Math.floor(Math.random() * game.canvasWidth)
        const fruitRandomY = Math.floor(Math.random() * game.canvasHeight)

        for (fruitId in game.fruits) {
            const fruit = game.fruits[fruitId]

            if (fruit.x === fruitRandomX && fruit.y === fruitRandomY) {
                return false
            }

        }

        game.fruits[fruitRandomId] = {
            x: fruitRandomX,
            y: fruitRandomY,
            width: game.playerW,
            height: game.playerH,
        }

        return {
            fruitId: fruitRandomId,
            x: fruitRandomX,
            y: fruitRandomY,
            width: game.playerW,
            height: game.playerH,
        }

    }

    function removeFruit(fruitId) {
        delete game.fruits[fruitId]
    }

    function checkForFruitColision() {
        for (fruitId in game.fruits) {
            const fruit = game.fruits[fruitId]

            for (socketId in game.players) {
                const player = game.players[socketId]

                if (
                    player.x < fruit.x + fruit.width &&
                    player.x + player.w > fruit.x &&
                    player.y < fruit.y + fruit.height &&
                    player.y + player.h > fruit.y
                )
                {
                    player.score = player.score + 1
                    game.removeFruit(fruitId)

                    return {
                        socketId: socketId,
                        fruitId: fruitId
                    }
                }
            }
        }
    }

    function clearScores() {
        for (socketId in game.players) {
            game.players[socketId].score = 0
        }
    }

    return game
}
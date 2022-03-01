const express = require('express');
const app = express();
const serv = require('http').Server(app);
const router = express.Router();

const path = require('path');

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/client/index.html');
});
app.use('/client', express.static(__dirname + '/client'));

class Player {
    constructor(id, name, isReady, score, move, room) {
        this.id = id;
        this.name = name;
        this.isReady = isReady;
        this.score = score;
        this.move = move;
        this.room = room;
    }
}

class Room {
    constructor(p1_id, p2_id, compared) {
        this.compared = compared;
        this.p1_id = p1_id || -1;
        this.p2_id = p2_id || -1;
    }
    isfull() {
        return this.p2_id != -1 && this.p1_id != -1
    }
    removePlayerID(p_id) {
        if (p_id === this.p1_id) {
            this.p1_id = this.p2_id;
            this.p2_id = -1;
        }
        else if (p_id === this.p2_id) {
            this.p2_id = -1;
        }
        if (this.p1_id >= 0) {
            SOCKET_LIST[this.p1_id].emit('player2left')
        }
    }
    otherRoom(p_id) {
        if (p_id == this.p1_id) {
            return this.p2_id
        }
        else {
            return this.p1_id
        }
    }
}

let server = app.listen(3000,function(){
  console.log("server running on port 3000");
})
var SOCKET_LIST = {};
var ROOM_LIST = {};

var nextid = 0
var io = require('socket.io')(serv, {});
io.sockets.on('connection', function (socket) {
    socket.on('signIn', function (data) {
        if (typeof (data.roomid) == "undefined") {
            socket.emit('signInResponse', { success: false })
        }
        if (typeof (ROOM_LIST[data.roomid]) == "undefined") {
            ROOM_LIST[data.roomid] = new Room(-1, -1, false)
        }
        var roominquestion = ROOM_LIST[data.roomid];
        if (!roominquestion.isfull()) {
            socket.id = nextid;
            if (roominquestion.p1_id < 0) {
                roominquestion.p1_id = socket.id
            }
            else {
                roominquestion.p2_id = socket.id
                SOCKET_LIST[roominquestion.p1_id].emit('player2found', {
                    name: data.playername
                })
                socket.emit('player2found', {
                    name: SOCKET_LIST[roominquestion.p1_id].p.name
                })
            }
            nextid++;
            socket.p = new Player(socket.id, data.playername, false, 0, -1, data.roomid);
            SOCKET_LIST[socket.id] = socket
            socket.emit('signInResponse', { success: true, roomid: data.roomid })
        }
        else {
            socket.emit('signInResponse', { success: false })
        }
    })

    socket.on('snd-msg', function (data) {
        console.log(data.chat);
        var curroom = ROOM_LIST[data.room];
        let date_now = new Date();
        if (curroom.isfull()) {
            p1socket = SOCKET_LIST[curroom.p1_id]
            p2socket = SOCKET_LIST[curroom.p2_id]
            p1socket.emit('rcv-msg', {
                sender: data.sender,
                message: data.chat,
                time: date_now.getHours() + ":" + date_now.getMinutes()
            })
            p2socket.emit('rcv-msg', {
                sender: data.sender,
                message: data.chat,
                time: date_now.getHours() + ":" + date_now.getMinutes()
            })
        }
        else {
            p1socket = SOCKET_LIST[curroom.p1_id]
            p1socket.emit('rcv-msg', {
                sender: data.sender,
                message: data.chat,
                time: date_now.getHours() + ":" + date_now.getMinutes()
            })
        }
    })

    socket.on('noready', function () {
        console.log("no")
        socket.p.isReady = false;
        socket.p.move = -1;
        ROOM_LIST[socket.p.room].compared = false
    })

    socket.on('disconnect', function () {
        if (typeof (SOCKET_LIST[socket.id]) != "undefined") {
            console.log(socket.id.toString() + " has disconnected")

            var leaving = SOCKET_LIST[socket.id].p
            ROOM_LIST[leaving.room].removePlayerID(socket.id)
            delete SOCKET_LIST[socket.id]
        }
    })
});

setInterval(function () {
    for (var i in ROOM_LIST) {
        currentRoom = ROOM_LIST[i]
        if (currentRoom.isfull()) {
            p1socket = SOCKET_LIST[currentRoom.p1_id]
            p2socket = SOCKET_LIST[currentRoom.p2_id]
            if (p1socket.p.isReady && p2socket.p.isReady) {
                if (!currentRoom.compared) {
                    var compareMoves = (p1socket.p.move - p2socket.p.move + 3) % 3
                    console.log(compareMoves)

                    if (compareMoves == 1) {
                        p2socket.p.score++;
                    }
                    else if (compareMoves == 2) {
                        p1socket.p.score++;
                    }
                    currentRoom.compared = true
                }
                p1socket.emit('move', {
                    result: compareMoves,
                    move: p1socket.p.move,
                    score: p1socket.p.score,
                    p2move: p2socket.p.move,
                    p2score: p2socket.p.score,
                })
                p2socket.emit('move', {
                    result: 3 - compareMoves,
                    move: p2socket.p.move,
                    score: p2socket.p.score,
                    p2move: p1socket.p.move,
                    p2score: p1socket.p.score,
                })
            }
            else {
                p1socket.emit('stop')
                p2socket.emit('stop')
            }
        }
    }
}, 40)

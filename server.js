const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {};

io.on('connection', (socket) => {
    console.log('Racer joined: ' + socket.id);

    // Initial data for new player
    players[socket.id] = {
        id: socket.id,
        x: 0, z: 0, ry: 0, // Position & Rotation
        speed: 0,
        steering: 0,
        drift: false, // Is the player drifting?
        color: Math.random() * 0xffffff,
        name: "Racer " + Math.floor(Math.random() * 1000)
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            const p = players[socket.id];
            p.x = data.x;
            p.z = data.z;
            p.ry = data.ry;
            p.speed = data.speed;
            p.steering = data.steering;
            p.drift = data.drift;
            
            // Broadcast highly optimized packet
            socket.broadcast.emit('playerMoved', p);
        }
    });

    socket.on('setDetails', (data) => {
        if(players[socket.id]) {
            players[socket.id].name = data.name;
            players[socket.id].color = data.color;
            io.emit('updateDetails', players[socket.id]);
        }
    });

    socket.on('disconnect', () => {
        console.log('Racer left: ' + socket.id);
        delete players[socket.id];
        io.emit('disconnect', socket.id);
    });
});

const port = process.env.PORT || 3000;
http.listen(port, () => {
    console.log(`🏎️  High-Performance Server running on port ${port}`);
});

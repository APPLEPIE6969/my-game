const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {};

io.on('connection', (socket) => {
    console.log('New player: ' + socket.id);

    // Create a new player
    players[socket.id] = {
        x: Math.floor(Math.random() * 700) + 50,
        y: Math.floor(Math.random() * 500) + 50,
        color: 'hsl(' + Math.random() * 360 + ', 100%, 50%)',
        id: socket.id
    };

    // Send data
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Handle Movement
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
        console.log('Player left: ' + socket.id);
        delete players[socket.id];
        io.emit('disconnect', socket.id);
    });
});

// --- THIS IS THE PART I FIXED FOR YOU ---
const port = process.env.PORT || 3000;
http.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
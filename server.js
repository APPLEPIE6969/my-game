const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

// --- GAME STATE ---
let players = {};
let race = {
    active: false,
    startTime: 0,
    laps: 3,
    winner: null,
    participants: []
};

// --- SHOP DATA ---
const CATALOG = {
    0: { name: "Rookie Kart", price: 0, speed: 1.0, grip: 0.94 },
    1: { name: "Street Tuner", price: 500, speed: 1.3, grip: 0.91 },
    2: { name: "Rally Beast", price: 1500, speed: 1.5, grip: 0.88 },
    3: { name: "F1 Prototype", price: 5000, speed: 2.1, grip: 0.98 }
};

io.on('connection', (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    // Initialize Player Data
    players[socket.id] = {
        id: socket.id,
        x: 0, y: 0, z: 0,
        qx: 0, qy: 0, qz: 0, qw: 1, // Quaternion rotation (smooth 3D)
        speed: 0,
        steering: 0,
        name: "Racer " + socket.id.substr(0,4),
        color: Math.random() * 0xffffff,
        money: 100,
        carId: 0,
        owned: [0],
        lap: 0,
        checkpoint: 0
    };

    // Send Initial State
    socket.emit('welcome', { id: socket.id, list: players, shop: CATALOG, race: race });
    socket.broadcast.emit('playerJoin', players[socket.id]);

    // 1. Movement Handler (High Frequency)
    socket.on('move', (data) => {
        if(players[socket.id]) {
            const p = players[socket.id];
            p.x = data.x; p.y = data.y; p.z = data.z;
            p.qx = data.qx; p.qy = data.qy; p.qz = data.qz; p.qw = data.qw;
            p.speed = data.s;
            p.steering = data.st;
            // Relay to others (Optimized)
            socket.broadcast.emit('playerUpdate', {
                id: socket.id,
                x: p.x, y: p.y, z: p.z,
                qx: p.qx, qy: p.qy, qz: p.qz, qw: p.qw,
                s: p.speed,
                st: p.steering
            });
        }
    });

    // 2. Shop Logic
    socket.on('buy', (id) => {
        const p = players[socket.id];
        const item = CATALOG[id];
        if(p && item && !p.owned.includes(id) && p.money >= item.price) {
            p.money -= item.price;
            p.owned.push(id);
            p.carId = id;
            io.to(socket.id).emit('economyUpdate', { money: p.money, owned: p.owned, car: id });
        }
    });

    socket.on('equip', (id) => {
        const p = players[socket.id];
        if(p && p.owned.includes(id)) {
            p.carId = id;
            io.emit('carChanged', { id: socket.id, car: id });
        }
    });

    // 3. Race Logic
    socket.on('joinRace', () => {
        if(race.active) return;
        if(!race.participants.includes(socket.id)) {
            race.participants.push(socket.id);
            io.emit('raceStatus', { count: race.participants.length, active: false });
            
            // Auto start if 2+ players or debug
            if(race.participants.length >= 1) { 
                startRaceCountdown(); 
            }
        }
    });

    socket.on('finishLap', (lapNum) => {
        const p = players[socket.id];
        if(p && race.active) {
            p.lap = lapNum;
            if(p.lap > race.laps) {
                // WINNER
                p.money += 500; // Big payout
                io.to(socket.id).emit('economyUpdate', { money: p.money, owned: p.owned, car: p.carId });
                io.emit('raceOver', { winner: p.name });
                resetRace();
            }
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        race.participants = race.participants.filter(x => x !== socket.id);
        io.emit('playerLeave', socket.id);
    });
});

let raceTimer = null;
function startRaceCountdown() {
    if(raceTimer) return;
    io.emit('msg', "RACE STARTING IN 5...");
    raceTimer = setTimeout(() => {
        race.active = true;
        race.startTime = Date.now();
        io.emit('raceStart', race);
        raceTimer = null;
    }, 5000);
}

function resetRace() {
    race.active = false;
    race.participants = [];
    race.winner = null;
    io.emit('raceStatus', { count: 0, active: false });
}

const port = process.env.PORT || 3000;
http.listen(port, () => console.log(`Server running on ${port}`));

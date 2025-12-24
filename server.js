const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {};
let race = { status: 'idle', laps: 3, entrants: [], finished: [] };

const CATALOG = {
    0: { name: "Rookie Kart", price: 0, speed: 1.0, grip: 0.94 },
    1: { name: "Street Tuner", price: 500, speed: 1.3, grip: 0.91 },
    2: { name: "Rally Beast", price: 1500, speed: 1.5, grip: 0.88 },
    3: { name: "F1 Prototype", price: 5000, speed: 2.1, grip: 0.98 }
};

io.on('connection', (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    players[socket.id] = {
        id: socket.id,
        money: 100,
        carId: 0,
        owned: [0],
        // Physics State
        x:0, y:0, z:0, qx:0, qy:0, qz:0, qw:1,
        speed: 0,
        // Race State
        lap: 0,
        finished: false,
        name: "Racer " + socket.id.substr(0,4),
        color: Math.random() * 0xffffff
    };

    socket.emit('welcome', { id: socket.id, list: players, shop: CATALOG, race: race });
    socket.broadcast.emit('playerJoin', players[socket.id]);
    io.emit('countUpdate', Object.keys(players).length);

    socket.on('move', (data) => {
        if(players[socket.id]) {
            Object.assign(players[socket.id], data);
            socket.broadcast.emit('playerUpdate', { id: socket.id, ...data });
        }
    });

    socket.on('buy', (id) => {
        const p = players[socket.id];
        const item = CATALOG[id];
        if(p && !p.owned.includes(id) && p.money >= item.price) {
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

    // --- RACE LOGIC ---
    socket.on('joinRace', () => {
        if(race.status !== 'idle') return;
        if(!race.entrants.includes(socket.id)) {
            race.entrants.push(socket.id);
            io.emit('raceStatus', { count: race.entrants.length, status: 'waiting' });
            
            // Start if 2+ players
            if(race.entrants.length >= 2) startRaceSequence();
            else io.emit('serverMsg', "Waiting for opponent...");
        }
    });

    socket.on('lapComplete', (lap) => {
        const p = players[socket.id];
        // Only accept lap updates if race is active and player hasn't finished yet
        if(p && race.status === 'racing' && !p.finished) {
            p.lap = lap;
            if(p.lap > race.laps) {
                p.finished = true;
                race.finished.push(socket.id);
                
                // Payout
                let prize = race.finished.length === 1 ? 300 : 150;
                p.money += prize;
                
                io.to(socket.id).emit('economyUpdate', { money: p.money, owned: p.owned, car: p.carId });
                io.emit('serverMsg', `${p.name} Finished #${race.finished.length} (+$${prize})`);
                
                // End race if everyone finished
                if(race.finished.length === race.entrants.length) {
                    setTimeout(endRace, 3000);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        race.entrants = race.entrants.filter(x => x !== socket.id);
        io.emit('playerLeave', socket.id);
        io.emit('countUpdate', Object.keys(players).length);
        // Cancel race if everyone left
        if(race.entrants.length < 2 && race.status !== 'idle') endRace();
    });
});

function startRaceSequence() {
    race.status = 'countdown';
    io.emit('raceStatus', { count: race.entrants.length, status: 'countdown' });
    io.emit('serverMsg', "RACE STARTING IN 5 SECONDS!");
    
    setTimeout(() => {
        race.status = 'racing';
        race.finished = [];
        
        // RESET PLAYERS FOR NEW RACE
        Object.values(players).forEach(p => {
            p.finished = false;
            p.lap = 1;
        });

        const grid = {};
        race.entrants.forEach((id, index) => {
            grid[id] = { x: 110 - (index * 10), z: (index % 2 === 0 ? -5 : 5) }; 
        });
        io.emit('raceStart', { grid: grid });
    }, 5000);
}

function endRace() {
    race.status = 'idle';
    race.entrants = [];
    race.finished = [];
    io.emit('raceStatus', { count: 0, status: 'idle' });
    io.emit('serverMsg', "Race Over. Lobby Open.");
}

const port = process.env.PORT || 3000;
http.listen(port, () => console.log(`Server running on ${port}`));

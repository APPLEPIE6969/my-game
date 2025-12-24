const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

// GAME STATE
let players = {};
let raceState = {
    active: false,
    startTime: 0,
    laps: 3,
    entrants: []
};

// SHOP CATALOG
const CAR_Stats = {
    0: { name: "Rookie Kart", speed: 1.0, grip: 0.95, cost: 0 },
    1: { name: "Street Tuner", speed: 1.3, grip: 0.92, cost: 500 },
    2: { name: "Muscle Car", speed: 1.6, grip: 0.85, cost: 1500 },
    3: { name: "F1 Prototype", speed: 2.0, grip: 0.99, cost: 5000 }
};

io.on('connection', (socket) => {
    console.log('Racer connected: ' + socket.id);

    // Init Player
    players[socket.id] = {
        id: socket.id,
        x: 0, z: 0, ry: 0,
        money: 100, // Starting Cash
        carType: 0,
        ownedCars: [0],
        name: "Racer " + Math.floor(Math.random()*100),
        color: Math.random() * 0xffffff,
        isRacing: false,
        lap: 0
    };

    socket.emit('initData', { id: socket.id, players: players, shop: CAR_Stats, race: raceState });
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // MOVEMENT
    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            const p = players[socket.id];
            p.x = data.x;
            p.y = data.y; // New: Height
            p.z = data.z;
            p.ry = data.ry;
            p.tilt = data.tilt; // New: Body Roll
            p.drift = data.drift;
            
            socket.broadcast.emit('playerMoved', p);
        }
    });

    // BUY CAR
    socket.on('buyCar', (carId) => {
        const p = players[socket.id];
        const car = CAR_Stats[carId];
        if(p && !p.ownedCars.includes(carId) && p.money >= car.cost) {
            p.money -= car.cost;
            p.ownedCars.push(carId);
            p.carType = carId;
            io.to(socket.id).emit('updateEconomy', { money: p.money, owned: p.ownedCars, current: carId });
        }
    });

    // EQUIP CAR
    socket.on('equipCar', (carId) => {
        const p = players[socket.id];
        if(p && p.ownedCars.includes(carId)) {
            p.carType = carId;
            io.emit('playerSwitchedCar', { id: socket.id, carType: carId });
        }
    });

    // RACE LOGIC
    socket.on('joinRace', () => {
        if(raceState.active) return;
        if(!raceState.entrants.includes(socket.id)) {
            raceState.entrants.push(socket.id);
            io.emit('raceUpdate', raceState);
            
            // Start Timer if 2+ players or forced
            if(raceState.entrants.length >= 1) { // 1 for testing, change to 2 later
                setTimeout(startRace, 5000); // 5 sec countdown
            }
        }
    });

    socket.on('lapFinished', () => {
        const p = players[socket.id];
        if(!p) return;
        p.lap++;
        if(p.lap > raceState.laps) {
            // WINNER
            p.money += 300; // Prize
            io.to(socket.id).emit('updateEconomy', { money: p.money, owned: p.ownedCars, current: p.carType });
            io.emit('raceMessage', `${p.name} Finished!`);
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        raceState.entrants = raceState.entrants.filter(id => id !== socket.id);
        io.emit('disconnect', socket.id);
    });
});

function startRace() {
    raceState.active = true;
    raceState.startTime = Date.now();
    io.emit('raceStart', raceState);
    
    // Reset Race after 2 mins
    setTimeout(() => {
        raceState.active = false;
        raceState.entrants = [];
        io.emit('raceEnd');
    }, 120000);
}

const port = process.env.PORT || 3000;
http.listen(port, () => {
    console.log(`Economy Server on port ${port}`);
});

// ========================================================
// 🔊 AUDIO ENGINE
// ========================================================
class AudioController {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createDynamicsCompressor();
        this.master.connect(this.ctx.destination);
        this.init = false;
    }
    start() {
        if(this.init) return;
        this.ctx.resume();
        const bufSize = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for(let i=0; i<bufSize; i++) data[i] = (Math.random()*2-1) * 0.5;
        
        this.src = this.ctx.createBufferSource();
        this.src.buffer = buf;
        this.src.loop = true;
        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.gain = this.ctx.createGain();
        
        this.src.connect(this.filter);
        this.filter.connect(this.gain);
        this.gain.connect(this.master);
        this.src.start();
        this.init = true;
    }
    update(speed) {
        if(!this.init) return;
        this.src.playbackRate.setTargetAtTime(0.5 + (speed*1.5), this.ctx.currentTime, 0.1);
        this.filter.frequency.setTargetAtTime(100 + (speed*1000), this.ctx.currentTime, 0.1);
        this.gain.gain.setTargetAtTime(0.3 + (speed*0.4), this.ctx.currentTime, 0.1);
    }
}

// ========================================================
// 🏎️ CAR FACTORY (Visuals)
// ========================================================
class CarFactory {
    static create(color) {
        const car = new THREE.Group();
        
        // BEAUTIFY: More reflective, shiny materials
        const mainColor = new THREE.MeshStandardMaterial({ 
            color: color, 
            roughness: 0.1,  // Very smooth
            metalness: 0.6,  // Metallic look
            emissive: 0x111111,
            emissiveIntensity: 0.2
        });
        const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
        const glassMat = new THREE.MeshStandardMaterial({ 
            color: 0x000000, 
            roughness: 0.0, 
            metalness: 0.9,
            opacity: 0.7,
            transparent: true
        });
        const glowRed = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const glowWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // Chassis
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.6, 4.6), mainColor);
        chassis.position.y = 0.6;
        chassis.castShadow = true;
        car.add(chassis);

        // Cabin
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), glassMat);
        cabin.position.set(0, 1.15, -0.2);
        car.add(cabin);

        // Fenders
        const fenderGeo = new THREE.BoxGeometry(2.3, 0.4, 1.2);
        const frontFender = new THREE.Mesh(fenderGeo, mainColor);
        frontFender.position.set(0, 0.6, -1.4);
        car.add(frontFender);
        const rearFender = new THREE.Mesh(fenderGeo, mainColor);
        rearFender.position.set(0, 0.6, 1.3);
        car.add(rearFender);

        // Spoiler
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.5), blackMat);
        wing.position.set(0, 1.3, 2.1);
        const poleL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.2), blackMat);
        poleL.position.set(0.8, 1.1, 2.1);
        const poleR = poleL.clone();
        poleR.position.set(-0.8, 1.1, 2.1);
        car.add(wing); car.add(poleL); car.add(poleR);

        // Lights
        const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), glowRed);
        tailL.position.set(0.6, 0.7, 2.31);
        const tailR = tailL.clone();
        tailR.position.set(-0.6, 0.7, 2.31);
        car.add(tailL); car.add(tailR);

        const headL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), glowWhite);
        headL.position.set(0.6, 0.6, -2.31);
        const headR = headL.clone();
        headR.position.set(-0.6, 0.6, -2.31);
        car.add(headL); car.add(headR);

        // Wheels
        const wheelGroup = new THREE.Group();
        const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 32); // Smoother wheels
        const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.36, 16);
        const tireMat = new THREE.MeshStandardMaterial({color:0x111111, roughness: 0.8});
        const rimMat = new THREE.MeshStandardMaterial({color:0x888888, metalness:0.9, roughness: 0.2});

        [{x:1.1, z:1.3}, {x:-1.1, z:1.3}, {x:1.1, z:-1.4}, {x:-1.1, z:-1.4}].forEach(p => {
            const w = new THREE.Group();
            const t = new THREE.Mesh(tireGeo, tireMat); t.rotation.z = Math.PI/2;
            const r = new THREE.Mesh(rimGeo, rimMat); r.rotation.z = Math.PI/2;
            w.add(t); w.add(r);
            w.position.set(p.x, 0.42, p.z);
            w.castShadow = true;
            wheelGroup.add(w);
        });
        car.userData.wheels = wheelGroup;
        car.add(wheelGroup);

        return car;
    }
}

// ========================================================
// 🏎️ PHYSICS (Arcade Style - No Slowdown)
// ========================================================
class CarPhysics {
    constructor(stats, color) {
        this.stats = stats;
        this.mesh = CarFactory.create(color);
        this.pos = new THREE.Vector3(0, 10, 0); 
        this.velocity = new THREE.Vector3();
        this.quat = new THREE.Quaternion();
        this.speed = 0;
        this.rotVel = 0;
        this.checkpoint = 0;
        this.lap = 1;
    }

    update(inputs, dt, terrainFn) {
        const h = terrainFn(this.pos.x, this.pos.z);
        
        let accel = 0;
        // Increased acceleration multiplier for punchier feel
        if(inputs.ArrowUp) accel = -this.stats.accel * 1.5;
        if(inputs.ArrowDown) accel = this.stats.accel * 1.5;
        
        // PHYSICS FIX: Removed the "OffRoad" penalty code completely.
        // You now have max grip and speed everywhere.
        
        this.speed += accel;
        
        // PHYSICS FIX: Reduced Drag (0.98 -> 0.99) allows significantly higher top speed
        this.speed *= 0.99; 

        if(Math.abs(this.speed) > 0.1) {
            const dir = this.speed > 0 ? 1 : -1;
            // Snappier turning
            const turnForce = this.stats.turn * 3.5; 
            if(inputs.ArrowLeft) this.rotVel += turnForce * dt * dir;
            if(inputs.ArrowRight) this.rotVel -= turnForce * dt * dir;
        }
        
        // Damping rotation
        this.rotVel *= 0.85;

        const q = new THREE.Quaternion();
        q.setFromAxisAngle(new THREE.Vector3(0,1,0), this.rotVel);
        this.quat.multiply(q).normalize();

        const fwd = new THREE.Vector3(0,0,1).applyQuaternion(this.quat);
        // Drifting Logic: Grip is slightly reduced when holding shift, but speed remains high
        const grip = inputs.Shift ? 0.02 : 0.2; 
        const targetVel = fwd.clone().multiplyScalar(this.speed);
        this.velocity.lerp(targetVel, grip);

        this.pos.add(this.velocity);
        this.pos.y = h + 0.5;

        this.mesh.position.copy(this.pos);
        this.mesh.quaternion.copy(this.quat);
        
        // Visuals
        this.mesh.userData.wheels.children.forEach(w => w.rotation.x += this.speed);
        this.mesh.children[0].rotation.z = -this.rotVel * 5; // Banking
        this.mesh.children[0].rotation.x = this.speed * 0.03; // Pitch

        // Smoke particles if drifting or high speed turning
        if((inputs.Shift && Math.abs(this.speed) > 0.5) || (Math.abs(this.rotVel) > 0.05 && Math.abs(this.speed) > 1.0)) {
            Game.emitSmoke(this.pos);
        }
    }
}

// ========================================================
// 🌍 GAME MANAGER
// ========================================================
const Game = {
    socket: null, scene: null, camera: null, renderer: null, audio: new AudioController(),
    input: { ArrowUp:false, ArrowDown:false, ArrowLeft:false, ArrowRight:false, Shift:false },
    players: {}, myCar: null, racing: false, camIndex: 0,
    currentLevel: 0, levelData: null, simplex: new SimplexNoise(),

    init() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 5000); // Increased Far Clip
        
        // Initial "Spectator" Camera
        this.camera.position.set(0, 50, 100);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer, prettier shadows
        document.body.appendChild(this.renderer.domElement);

        // BEAUTIFY: Lighting Setup
        // 1. Hemisphere Light (Sky vs Ground color) - removes pitch black shadows
        const hemiLight = new THREE.HemisphereLight(0x00f3ff, 0xeb4034, 0.6);
        this.scene.add(hemiLight);

        // 2. Main Sun
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(100, 200, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 4096; // Higher resolution shadows
        sun.shadow.mapSize.height = 4096;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 500;
        this.scene.add(sun);
        this.sun = sun;

        this.setupInputs();
        this.connect();
        this.loadLevel(0);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth/window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        window.addEventListener('click', () => this.audio.start(), {once:true});
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    },

    loadLevel(id) {
        if(this.terrainMesh) this.scene.remove(this.terrainMesh);
        if(this.trackMesh) { this.scene.remove(this.trackMesh); this.scene.remove(this.trackBorder); }
        if(this.scenery) this.scene.remove(this.scenery);

        this.currentLevel = id;
        this.scenery = new THREE.Group();
        this.scene.add(this.scenery);

        let points = [];
        let fogColor;
        let ambientColor;
        
        if(id === 0) { // SERPENT (Day)
            fogColor = 0x87CEEB;
            ambientColor = 0x2d6e32;
            this.scene.background = new THREE.Color(fogColor);
            this.scene.fog = new THREE.FogExp2(fogColor, 0.0015);
            points = [
                new THREE.Vector3(0,10,0), new THREE.Vector3(200,10,-100), new THREE.Vector3(400,10,0),
                new THREE.Vector3(300,10,300), new THREE.Vector3(0,10,200), new THREE.Vector3(-200,10,100)
            ];
        } 
        else if (id === 1) { // CITY (Night)
            fogColor = 0x050510;
            ambientColor = 0x111111;
            this.scene.background = new THREE.Color(fogColor);
            this.scene.fog = new THREE.FogExp2(fogColor, 0.003);
            points = [
                new THREE.Vector3(0,10,0), new THREE.Vector3(0,10,-400), new THREE.Vector3(400,10,-400),
                new THREE.Vector3(400,10,0), new THREE.Vector3(200,10,200), new THREE.Vector3(-200,10,200)
            ];
            this.spawnBuildings();
        }
        else { // RALLY (Sunset)
            fogColor = 0xdcae96;
            ambientColor = 0x8B4513;
            this.scene.background = new THREE.Color(fogColor);
            this.scene.fog = new THREE.FogExp2(fogColor, 0.002);
            points = [
                new THREE.Vector3(0,10,0), new THREE.Vector3(300,30,-300), new THREE.Vector3(600,0,0),
                new THREE.Vector3(300,40,400), new THREE.Vector3(-200,20,200)
            ];
        }

        // BEAUTIFY: Track Material
        const curve = new THREE.CatmullRomCurve3(points);
        curve.closed = true;
        const tube = new THREE.TubeGeometry(curve, 100, 15, 5, true); // Higher detail (5 radial segments -> 3)
        const trackMat = new THREE.MeshStandardMaterial({
            color: 0x333333, 
            roughness: 0.8,
            metalness: 0.1
        });
        this.trackMesh = new THREE.Mesh(tube, trackMat);
        this.trackMesh.rotation.x = Math.PI; 
        this.trackMesh.position.y = 0.2; 
        this.trackMesh.receiveShadow = true;
        this.scene.add(this.trackMesh);

        // BEAUTIFY: Glowing Border
        const wire = new THREE.TubeGeometry(curve, 100, 16, 3, true);
        const borderMat = new THREE.MeshBasicMaterial({
            color: id===1 ? 0x00f3ff : 0xffffff, // Cyan in city, White elsewhere
            wireframe: true,
            transparent: true,
            opacity: 0.5
        });
        this.trackBorder = new THREE.Mesh(wire, borderMat);
        this.trackBorder.position.y = 1;
        this.scene.add(this.trackBorder);

        // Terrain
        const geo = new THREE.PlaneGeometry(3000, 3000, 128, 128); // Bigger terrain
        const pos = geo.attributes.position;
        for(let i=0; i<pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            let h = this.getTerrainHeight(x, y);
            pos.setZ(i, h);
        }
        geo.computeVertexNormals();
        this.terrainMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color: ambientColor, roughness: 0.9}));
        this.terrainMesh.rotation.x = -Math.PI/2;
        this.terrainMesh.receiveShadow = true;
        this.scene.add(this.terrainMesh);

        this.levelData = { curve: curve, checkpoints: curve.getSpacedPoints(40), spawn: points[0] };

        if(this.myCar) {
            this.myCar.pos.copy(points[0]);
            this.myCar.pos.y += 2; 
            this.myCar.velocity.set(0,0,0);
            this.myCar.speed = 0;
            this.racing = false;
            this.myCar.lap = 1; 
            this.myCar.checkpoint = 0;
        }
    },

    spawnBuildings() {
        const geo = new THREE.BoxGeometry(20, 100, 20);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x111111, 
            emissive: 0x001133, 
            roughness: 0.2
        });
        
        for(let i=0; i<80; i++) {
            const b = new THREE.Mesh(geo, mat);
            const x = (Math.random()-0.5)*1200;
            const z = (Math.random()-0.5)*1200;
            if(Math.sqrt(x*x+z*z) > 120) {
                b.position.set(x, 50, z);
                b.scale.set(Math.random()*2+1, Math.random()*3+1, Math.random()*2+1);
                this.scenery.add(b);
            }
        }
    },

    getTerrainHeight(x, z) {
        if (x*x + z*z < 3600) return 10; 
        let h = this.simplex.noise2D(x*0.003, -z*0.003) * (this.currentLevel===2 ? 40 : 15);
        if(this.currentLevel === 2 && x > 200) h += 20;
        return Math.max(0, h);
    },

    // Lap Counting Check (Physics penalty removed, but we still need this for laps)
    checkLapLogic() {
        if(!this.myCar || !this.racing) return;
        const cps = this.levelData.checkpoints;
        const nextIdx = (this.myCar.checkpoint + 1) % cps.length;
        // Increased distance check to 60 units so you don't miss checkpoints easily
        if(this.myCar.pos.distanceTo(cps[nextIdx]) < 60) {
            this.myCar.checkpoint = nextIdx;
            if(nextIdx === 0) {
                this.myCar.lap++;
                document.getElementById('lap-val').innerText = Math.min(this.myCar.lap, 5);
                this.socket.emit('lapComplete', {lap: this.myCar.lap});
                if(this.myCar.lap > 5) { this.racing = false; this.notify("FINISHED!"); }
            }
        }
    },

    spawnMe(carId) {
        if(this.myCar) this.scene.remove(this.myCar.mesh);
        const colors = [0x3366ff, 0xff3333, 0xffaa00, 0xcc00ff];
        // Increased stats slightly
        const stats = [{accel:0.025, turn:0.06}, {accel:0.035, turn:0.065}, {accel:0.045, turn:0.06}, {accel:0.07, turn:0.08}];
        this.myCar = new CarPhysics(stats[carId], colors[carId]);
        this.scene.add(this.myCar.mesh);
        this.loadLevel(this.currentLevel);
    },

    connect() {
        if(typeof io === 'undefined') return;
        this.socket = io();
        this.socket.on('welcome', d => {
            this.myId = d.id;
            this.economy = {money:d.list[this.myId].money, owned:d.list[this.myId].owned};
            this.shopData = d.shop;
            document.getElementById('cash').innerText = this.economy.money;
            this.spawnMe(d.list[this.myId].carId);
            Object.values(d.list).forEach(p => { if(p.id!==this.myId) this.spawnOther(p); });
        });
        this.socket.on('playerJoin', p => this.spawnOther(p));
        this.socket.on('countUpdate', c => document.getElementById('p-count').innerText = c);
        this.socket.on('playerUpdate', p => {
            if(this.players[p.id]) {
                const m = this.players[p.id].mesh;
                m.position.lerp(new THREE.Vector3(p.x, p.y, p.z), 0.3);
                m.quaternion.slerp(new THREE.Quaternion(p.qx, p.qy, p.qz, p.qw), 0.3);
            }
        });
        this.socket.on('playerLeave', id => { if(this.players[id]) { this.scene.remove(this.players[id].mesh); delete this.players[id]; } });
        this.socket.on('serverMsg', msg => this.notify(msg));
        this.socket.on('economyUpdate', d => {
            this.economy.money = d.money;
            this.economy.owned = d.owned;
            document.getElementById('cash').innerText = d.money;
            if(d.car !== undefined) this.spawnMe(d.car);
        });
        this.socket.on('raceStart', () => {
            this.racing = true;
            this.myCar.lap = 1;
            this.myCar.speed = 0;
            const start = this.levelData.spawn;
            this.myCar.pos.copy(start);
            this.myCar.pos.y += 2;
            this.myCar.mesh.lookAt(this.levelData.checkpoints[1]);
            this.myCar.quat.copy(this.myCar.mesh.quaternion);
            document.getElementById('join-btn').style.display = 'none';
            document.getElementById('lap-counter').style.display = 'block';
            this.notify("🟢 GO!");
        });
    },

    spawnOther(p) {
        const mesh = CarFactory.create(p.color||0xffffff);
        mesh.position.set(p.x, p.y, p.z);
        this.scene.add(mesh);
        this.players[p.id] = {mesh:mesh};
    },

    setupInputs() {
        document.addEventListener('keydown', e => {
            this.input[e.key] = true;
            if(e.key === "Shift") this.input.Shift = true;
        });
        document.addEventListener('keyup', e => {
            this.input[e.key] = false;
            if(e.key === "Shift") this.input.Shift = false;
            if(e.key.toLowerCase() === 'r') this.respawn();
            if(e.key.toLowerCase() === 'c') this.camIndex = (this.camIndex + 1) % 3;
        });
    },

    respawn() {
        const cps = this.levelData.checkpoints;
        const idx = this.myCar.checkpoint; 
        const safe = cps[idx];
        this.myCar.pos.copy(safe);
        this.myCar.pos.y += 2; 
        this.myCar.speed = 0;
        this.myCar.velocity.set(0,0,0);
        this.myCar.mesh.lookAt(cps[(idx+1)%cps.length]);
        this.myCar.quat.copy(this.myCar.mesh.quaternion);
    },

    joinRace() { this.socket.emit('joinRace'); },

    updateCam() {
        let offset;
        if(this.camIndex === 0) offset = new THREE.Vector3(0, 7, 16);
        else if(this.camIndex === 1) offset = new THREE.Vector3(0, 20, 35);
        else offset = new THREE.Vector3(0, 80, 0);
        offset.applyQuaternion(this.myCar.quat);
        const target = this.myCar.pos.clone().add(offset);
        this.camera.position.lerp(target, 0.1);
        this.camera.lookAt(this.myCar.pos);
    },

    drawMinimap() {
        const cvs = document.getElementById('minimap-canvas');
        const ctx = cvs.getContext('2d');
        ctx.clearRect(0,0,220,220);
        if(!this.myCar) return;
        ctx.save();
        ctx.translate(110, 110);
        const rot = new THREE.Euler().setFromQuaternion(this.myCar.quat).y;
        ctx.rotate(rot - Math.PI); 
        const scale = 0.5;
        const px = this.myCar.pos.x;
        const pz = this.myCar.pos.z;
        const cps = this.levelData.checkpoints;
        ctx.strokeStyle = "#555"; ctx.lineWidth = 15; ctx.lineCap = "round";
        ctx.beginPath();
        cps.forEach((p, i) => {
            const rx = (p.x - px) * scale;
            const rz = (p.z - pz) * scale;
            if(i===0) ctx.moveTo(rx, rz); else ctx.lineTo(rx, rz);
        });
        ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
        Object.values(this.players).forEach(p => {
            const m = p.mesh;
            const rx = (m.position.x - px) * scale;
            const rz = (m.position.z - pz) * scale;
            ctx.fillStyle = "#ff0055";
            ctx.beginPath(); ctx.arc(rx, rz, 5, 0, Math.PI*2); ctx.fill();
        });
        ctx.restore();
        ctx.fillStyle = "#00f3ff";
        ctx.beginPath(); ctx.arc(110, 110, 6, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(110,110);
        ctx.lineTo(100, 80); ctx.lineTo(120, 80);
        ctx.fillStyle = "rgba(0, 243, 255, 0.3)"; ctx.fill();
    },

    emitSmoke(pos) {
        if(!this.smoke) this.smoke = [];
        const g = new THREE.BoxGeometry(0.3,0.3,0.3);
        const m = new THREE.MeshBasicMaterial({color:0xaaaaaa, transparent:true, opacity:0.6});
        const mesh = new THREE.Mesh(g,m);
        mesh.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5),0,(Math.random()-0.5)));
        this.scene.add(mesh);
        this.smoke.push({m:mesh, life:1.0});
    },
    notify(msg) {
        const d = document.createElement('div');
        d.className = 'msg'; d.innerText = msg;
        document.getElementById('msg-area').appendChild(d);
        setTimeout(() => d.remove(), 4000);
    },
    toggleShop() {
        const s = document.getElementById('shop');
        s.style.display = s.style.display==='flex'?'none':'flex';
        if(s.style.display==='flex') {
            const g = document.getElementById('shop-grid');
            g.innerHTML = '';
            Object.values(this.shopData).forEach((item, id) => {
                const div = document.createElement('div');
                div.className = 'item';
                const owned = this.economy.owned.includes(parseInt(id));
                div.innerHTML = `<h3>${item.name}</h3><p>Price: $${item.price}</p><button onclick="Game.socket.emit('${owned?'equip':'buy'}', ${id})">${owned?'EQUIP':'BUY'}</button>`;
                g.appendChild(div);
            });
        }
    },

    animate() {
        requestAnimationFrame(this.animate);
        
        if(this.myCar) {
            const hFn = (x,z) => this.getTerrainHeight(x,z);
            // No longer checking "onRoad" for physics
            this.myCar.update(this.input, 0.016, hFn);
            this.checkLapLogic(); // Still check laps
            this.updateCam(); 
            this.audio.update(Math.abs(this.myCar.speed) / 2.5);
            this.drawMinimap();
            document.getElementById('speed').innerText = Math.floor(Math.abs(this.myCar.speed) * 120);
            document.getElementById('rpm').style.width = Math.min(100, Math.abs(this.myCar.speed)*60) + "%";

            this.socket.emit('move', {
                x: this.myCar.pos.x, y: this.myCar.pos.y, z: this.myCar.pos.z,
                qx: this.myCar.quat.x, qy: this.myCar.quat.y, qz: this.myCar.quat.z, qw: this.myCar.quat.w
            });
        } else {
            // Rotating cam while waiting
            if(this.camera && this.levelData) {
                const time = Date.now() * 0.0005;
                this.camera.position.x = Math.sin(time) * 200;
                this.camera.position.z = Math.cos(time) * 200;
                this.camera.position.y = 100;
                this.camera.lookAt(0, 10, 0);
            }
        }
        
        if(this.smoke) {
            for(let i=this.smoke.length-1; i>=0; i--) {
                let p = this.smoke[i];
                p.life -= 0.03;
                p.m.position.y += 0.05;
                p.m.material.opacity = p.life * 0.5;
                if(p.life <= 0) { this.scene.remove(p.m); this.smoke.splice(i,1); }
            }
        }
        this.renderer.render(this.scene, this.camera);
    }
};

window.onload = () => Game.init();

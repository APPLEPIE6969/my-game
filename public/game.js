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
// 🏎️ CAR FACTORY
// ========================================================
class CarFactory {
    static create(color) {
        const car = new THREE.Group();
        
        const mainColor = new THREE.MeshStandardMaterial({ 
            color: color, 
            roughness: 0.1,  
            metalness: 0.6,
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

        const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.6, 4.6), mainColor);
        chassis.position.y = 0.6;
        chassis.castShadow = true;
        car.add(chassis);

        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), glassMat);
        cabin.position.set(0, 1.15, -0.2);
        car.add(cabin);

        const fenderGeo = new THREE.BoxGeometry(2.3, 0.4, 1.2);
        const frontFender = new THREE.Mesh(fenderGeo, mainColor);
        frontFender.position.set(0, 0.6, -1.4);
        car.add(frontFender);
        const rearFender = new THREE.Mesh(fenderGeo, mainColor);
        rearFender.position.set(0, 0.6, 1.3);
        car.add(rearFender);

        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.5), blackMat);
        wing.position.set(0, 1.3, 2.1);
        const poleL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.2), blackMat);
        poleL.position.set(0.8, 1.1, 2.1);
        const poleR = poleL.clone();
        poleR.position.set(-0.8, 1.1, 2.1);
        car.add(wing); car.add(poleL); car.add(poleR);

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

        const wheelGroup = new THREE.Group();
        const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 32); 
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
// 🏎️ PHYSICS
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
        this.drag = 0.985;
        this.vy = 0;
        this.onGround = false;
    }

    update(inputs, dt, terrainFn) {
        const groundHeight = terrainFn(this.pos.x, this.pos.z);
        this.vy -= 0.02; // Gravity
        this.pos.y += this.vy;

        if(this.pos.y <= groundHeight) {
            this.pos.y = groundHeight;
            this.vy = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }

        let accel = 0;
        if(inputs.ArrowUp) accel = -this.stats.accel;
        if(inputs.ArrowDown) accel = this.stats.accel;

        if(this.onGround) {
            this.speed += accel;
            this.speed *= this.drag;
            if(Math.abs(this.speed) > 0.1) {
                const dir = this.speed > 0 ? 1 : -1;
                const turnForce = this.stats.turn * 3.5; 
                if(inputs.ArrowLeft) this.rotVel -= turnForce * dt * dir;
                if(inputs.ArrowRight) this.rotVel += turnForce * dt * dir;
            }
        } else {
            this.speed *= 0.995; 
            if(Math.abs(this.speed) > 0.1) {
                 const dir = this.speed > 0 ? 1 : -1;
                 if(inputs.ArrowLeft) this.rotVel -= (this.stats.turn * 0.5) * dt * dir;
                 if(inputs.ArrowRight) this.rotVel += (this.stats.turn * 0.5) * dt * dir;
            }
        }

        this.rotVel *= 0.85;

        const q = new THREE.Quaternion();
        q.setFromAxisAngle(new THREE.Vector3(0,1,0), this.rotVel);
        this.quat.multiply(q).normalize();

        const fwd = new THREE.Vector3(0,0,1).applyQuaternion(this.quat);
        const targetVel = fwd.clone().multiplyScalar(this.speed);
        
        this.pos.x += targetVel.x;
        this.pos.z += targetVel.z;

        // Slope alignment
        let upVector = new THREE.Vector3(0, 1, 0);
        if (this.onGround) {
            const d = 1.5;
            const hF = terrainFn(this.pos.x + fwd.x * d, this.pos.z + fwd.z * d); 
            const hB = terrainFn(this.pos.x - fwd.x * d, this.pos.z - fwd.z * d); 
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat);
            const hL = terrainFn(this.pos.x - right.x * d, this.pos.z - right.z * d); 
            const hR = terrainFn(this.pos.x + right.x * d, this.pos.z + right.z * d); 

            const vec1 = new THREE.Vector3(fwd.x * 2 * d, hF - hB, fwd.z * 2 * d).normalize();
            const vec2 = new THREE.Vector3(right.x * 2 * d, hR - hL, right.z * 2 * d).normalize();
            upVector.crossVectors(vec1, vec2).normalize();
            
            const slopeRise = (hF - groundHeight);
            if(slopeRise > 0.5 && this.speed < -0.5) { 
                this.vy += Math.abs(this.speed) * 0.1; 
            }
        }

        const targetQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), upVector);
        const finalQ = targetQ.multiply(this.quat);
        
        this.mesh.quaternion.slerp(finalQ, 0.2); 
        this.mesh.position.copy(this.pos);

        this.mesh.userData.wheels.children.forEach(w => w.rotation.x += this.speed);
        
        if((inputs.Shift && Math.abs(this.speed) > 0.5 && this.onGround) || (Math.abs(this.rotVel) > 0.05 && Math.abs(this.speed) > 1.0 && this.onGround)) {
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
    
    // INFINITE TERRAIN CONFIG
    chunkSize: 500, 
    renderDist: 2,  
    chunks: {},     

    // CHECKPOINT MARKER
    checkpointMesh: null,

    init() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 8000);
        this.camera.position.set(0, 50, 100);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
        document.body.appendChild(this.renderer.domElement);

        const hemiLight = new THREE.HemisphereLight(0x00f3ff, 0xeb4034, 0.6);
        this.scene.add(hemiLight);

        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(100, 200, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 4096;
        sun.shadow.mapSize.height = 4096;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 1500;
        sun.shadow.camera.left = -500;
        sun.shadow.camera.right = 500;
        sun.shadow.camera.top = 500;
        sun.shadow.camera.bottom = -500;
        this.scene.add(sun);
        this.sun = sun;

        // Create the Checkpoint Visual (Glowing Ring)
        const cpGeo = new THREE.TorusGeometry(10, 1, 16, 32);
        const cpMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 });
        this.checkpointMesh = new THREE.Mesh(cpGeo, cpMat);
        this.checkpointMesh.rotation.x = Math.PI/2;
        this.checkpointMesh.visible = false; // Hide until race starts
        this.scene.add(this.checkpointMesh);

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
        if(this.trackMesh) { this.scene.remove(this.trackMesh); this.scene.remove(this.trackBorder); }
        if(this.scenery) this.scene.remove(this.scenery);
        
        Object.values(this.chunks).forEach(m => this.scene.remove(m));
        this.chunks = {};

        this.currentLevel = id;
        this.scenery = new THREE.Group();
        this.scene.add(this.scenery);

        let points = [];
        let fogColor;
        
        if(id === 0) { // SERPENT
            fogColor = 0x87CEEB;
            this.groundColor = 0x2d6e32;
            this.scene.background = new THREE.Color(fogColor);
            this.scene.fog = new THREE.FogExp2(fogColor, 0.001);
            points = [
                new THREE.Vector3(0,10,0), new THREE.Vector3(200,10,-100), new THREE.Vector3(400,10,0),
                new THREE.Vector3(300,10,300), new THREE.Vector3(0,10,200), new THREE.Vector3(-200,10,100)
            ];
        } 
        else if (id === 1) { // CITY
            fogColor = 0x050510;
            this.groundColor = 0x111111;
            this.scene.background = new THREE.Color(fogColor);
            this.scene.fog = new THREE.FogExp2(fogColor, 0.003);
            points = [
                new THREE.Vector3(0,10,0), new THREE.Vector3(0,10,-400), new THREE.Vector3(400,10,-400),
                new THREE.Vector3(400,10,0), new THREE.Vector3(200,10,200), new THREE.Vector3(-200,10,200)
            ];
        }
        else { // RALLY
            fogColor = 0xdcae96;
            this.groundColor = 0x8B4513;
            this.scene.background = new THREE.Color(fogColor);
            this.scene.fog = new THREE.FogExp2(fogColor, 0.002);
            points = [
                new THREE.Vector3(0,10,0), new THREE.Vector3(300,30,-300), new THREE.Vector3(600,0,0),
                new THREE.Vector3(300,40,400), new THREE.Vector3(-200,20,200)
            ];
        }

        const curve = new THREE.CatmullRomCurve3(points);
        curve.closed = true;
        const tube = new THREE.TubeGeometry(curve, 100, 15, 5, true);
        const trackMat = new THREE.MeshStandardMaterial({color: 0x333333, roughness: 0.8});
        this.trackMesh = new THREE.Mesh(tube, trackMat);
        this.trackMesh.rotation.x = Math.PI; 
        this.trackMesh.position.y = 0.2; 
        this.trackMesh.receiveShadow = true;
        this.scene.add(this.trackMesh);

        const wire = new THREE.TubeGeometry(curve, 100, 16, 3, true);
        const borderMat = new THREE.MeshBasicMaterial({color: id===1?0x00f3ff:0xffffff, wireframe:true, transparent:true, opacity:0.5});
        this.trackBorder = new THREE.Mesh(wire, borderMat);
        this.trackBorder.position.y = 1;
        this.scene.add(this.trackBorder);

        this.levelData = { curve: curve, checkpoints: curve.getSpacedPoints(40), spawn: points[0] };

        if(this.myCar) {
            this.myCar.pos.copy(points[0]);
            this.myCar.pos.y += 2; 
            this.myCar.velocity.set(0,0,0);
            this.myCar.speed = 0;
            this.myCar.vy = 0;
            this.racing = false;
            this.myCar.lap = 1; 
            this.myCar.checkpoint = 0;
            this.checkpointMesh.visible = false;
        }

        this.updateChunks(new THREE.Vector3(0,0,0));
    },

    updateChunks(pos) {
        const cx = Math.floor(pos.x / this.chunkSize);
        const cz = Math.floor(pos.z / this.chunkSize);
        const activeKeys = new Set();

        for(let x = -this.renderDist; x <= this.renderDist; x++) {
            for(let z = -this.renderDist; z <= this.renderDist; z++) {
                const key = `${cx+x},${cz+z}`;
                activeKeys.add(key);
                if(!this.chunks[key]) this.createChunk(cx+x, cz+z);
            }
        }

        Object.keys(this.chunks).forEach(key => {
            if(!activeKeys.has(key)) {
                this.scene.remove(this.chunks[key]);
                this.chunks[key].geometry.dispose();
                delete this.chunks[key];
            }
        });
    },

    createChunk(cx, cz) {
        const geo = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize, 32, 32);
        const pos = geo.attributes.position;
        const offsetX = cx * this.chunkSize;
        const offsetZ = cz * this.chunkSize;

        for(let i=0; i<pos.count; i++) {
            const px = pos.getX(i) + offsetX;
            const py = -pos.getY(i) + offsetZ; 
            let h = this.getTerrainHeight(px, py);
            pos.setZ(i, h);
        }
        geo.computeVertexNormals();
        
        const mat = new THREE.MeshStandardMaterial({color: this.groundColor, roughness: 0.9});
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI/2;
        mesh.position.set(offsetX, 0, offsetZ);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.chunks[`${cx},${cz}`] = mesh;
    },

    getTerrainHeight(x, z) {
        if (x*x + z*z < 40000) return 10; 
        let h = this.simplex.noise2D(x*0.003, -z*0.003) * (this.currentLevel===2 ? 40 : 15);
        if(this.currentLevel === 2) h += this.simplex.noise2D(x*0.01, z*0.01) * 5;
        return Math.max(0, h);
    },

    checkLapLogic() {
        if(!this.myCar || !this.racing) return;
        const cps = this.levelData.checkpoints;
        const nextIdx = (this.myCar.checkpoint + 1) % cps.length;
        const nextPos = cps[nextIdx];
        
        // Show Checkpoint
        this.checkpointMesh.visible = true;
        this.checkpointMesh.position.copy(nextPos);
        this.checkpointMesh.position.y += 5; // Float
        
        // Color logic (Yellow = Normal, Green = Finish)
        if(nextIdx === 0) this.checkpointMesh.material.color.setHex(0x00ff00);
        else this.checkpointMesh.material.color.setHex(0xffff00);
        
        // Rotate Visual
        this.checkpointMesh.rotation.y += 0.05;
        this.checkpointMesh.rotation.x = Math.PI/2 + Math.sin(Date.now()*0.005)*0.2;

        // Check Collision with Checkpoint (Increased Radius to 80)
        if(this.myCar.pos.distanceTo(nextPos) < 80) {
            this.myCar.checkpoint = nextIdx;
            
            // Pulse Effect (Visual Feedback)
            this.checkpointMesh.scale.set(1.5, 1.5, 1.5);
            
            if(nextIdx === 0) {
                this.myCar.lap++;
                document.getElementById('lap-val').innerText = Math.min(this.myCar.lap, 5);
                this.socket.emit('lapComplete', {lap: this.myCar.lap});
                if(this.myCar.lap > 5) { 
                    this.racing = false; 
                    this.checkpointMesh.visible = false;
                    this.notify("FINISHED!"); 
                }
            }
        }
        
        // Scale animation back to normal
        this.checkpointMesh.scale.lerp(new THREE.Vector3(1,1,1), 0.1);
    },

    spawnMe(carId) {
        if(this.myCar) this.scene.remove(this.myCar.mesh);
        const colors = [0x3366ff, 0xff3333, 0xffaa00, 0xcc00ff];
        
        // TUNED SPEED STATS
        const stats = [
            {accel:0.0146, turn:0.06}, // Rookie (117)
            {accel:0.0212, turn:0.065}, // Street (170)
            {accel:0.0300, turn:0.07}, // Rally (240)
            {accel:0.0400, turn:0.08}  // F1 (320)
        ];
        
        this.myCar = new CarPhysics(stats[carId], colors[carId]);
        this.scene.add(this.myCar.mesh);
        this.myCar.pos.copy(this.levelData.spawn);
        this.myCar.pos.y = 12;
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
            this.myCar.vy = 0;
            const start = this.levelData.spawn;
            this.myCar.pos.copy(start);
            this.myCar.pos.y += 2;
            this.myCar.mesh.lookAt(this.levelData.checkpoints[1]);
            this.myCar.quat.copy(this.myCar.mesh.quaternion);
            document.getElementById('join-btn').style.display = 'none';
            document.getElementById('lap-counter').style.display = 'block';
            
            // Initial Checkpoint
            this.myCar.checkpoint = 0;
            this.checkpointMesh.visible = true;
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
        this.myCar.vy = 0;
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
        
        // Draw Checkpoint on Minimap
        if(this.racing && this.checkpointMesh.visible) {
             const cpPos = this.checkpointMesh.position;
             const cpx = (cpPos.x - px) * scale;
             const cpz = (cpPos.z - pz) * scale;
             ctx.fillStyle = "#ffff00";
             ctx.beginPath(); ctx.arc(cpx, cpz, 8, 0, Math.PI*2); ctx.fill();
        }

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
            // Infinite Terrain Update
            this.updateChunks(this.myCar.pos);

            const hFn = (x,z) => this.getTerrainHeight(x,z);
            this.myCar.update(this.input, 0.016, hFn);
            this.checkLapLogic(); 
            this.updateCam(); 
            this.audio.update(Math.abs(this.myCar.speed) / 2.5);
            this.drawMinimap();
            document.getElementById('speed').innerText = Math.floor(Math.abs(this.myCar.speed) * 120);
            document.getElementById('rpm').style.width = Math.min(100, Math.abs(this.myCar.speed)*60) + "%";

            this.socket.emit('move', {
                x: this.myCar.pos.x, y: this.myCar.pos.y, z: this.myCar.pos.z,
                qx: this.myCar.quat.x, qy: this.myCar.quat.y, qz: this.myCar.quat.z, qw: this.myCar.quat.w
            });
            
            this.sun.position.set(this.myCar.pos.x + 100, 200, this.myCar.pos.z + 50);
            this.sun.target.position.copy(this.myCar.pos);
            this.sun.target.updateMatrixWorld();
        } else {
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

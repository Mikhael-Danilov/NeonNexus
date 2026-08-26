// THREE.JS SETUP
// ============================================
let aspect = window.innerWidth / window.innerHeight;
let scene, camera, renderer, composer, bloomPass;

function initThree() {
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-CONFIG.VIEW_SIZE * aspect, CONFIG.VIEW_SIZE * aspect, CONFIG.VIEW_SIZE, -CONFIG.VIEW_SIZE, 0.1, 1000);
    camera.position.z = 10;
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight); 
    renderer.setClearColor(0x000000);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.1);
    composer.addPass(bloomPass);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

// ============================================
// ASSET CREATION (2D Shapes)
// ============================================
function createPlayerShape() { const s = new THREE.Shape(); s.moveTo(1.2, 0); s.lineTo(-0.5, 0.8); s.lineTo(-0.2, 0); s.lineTo(-0.5, -0.8); s.closePath(); return new THREE.ShapeGeometry(s); }
function createChaserShape() { const s = new THREE.Shape(); s.moveTo(1.0, 0); s.lineTo(-0.6, 0.6); s.lineTo(-0.6, -0.6); s.closePath(); return new THREE.ShapeGeometry(s); }
function createZigzagShape() { const s = new THREE.Shape(); s.moveTo(1.0, 0); s.lineTo(-0.8, 1.0); s.lineTo(0.2, 0); s.lineTo(-0.8, -1.0); s.closePath(); return new THREE.ShapeGeometry(s); }
function createShooterShape() { const s = new THREE.Shape(); s.moveTo(1.4, 0); s.lineTo(0.5, -0.7); s.lineTo(-0.7, -0.7); s.lineTo(-0.7, 0.7); s.lineTo(0.5, 0.7); s.closePath(); return new THREE.ShapeGeometry(s); }
function createTankShape() { 
    const s = new THREE.Shape(); 
    s.moveTo(1.8, 0); s.lineTo(0.5, -1.0); s.lineTo(-1.0, -1.0); s.lineTo(-1.0, 1.0); s.lineTo(0.5, 1.0); s.closePath(); 
    const hole = new THREE.Path(); hole.moveTo(0.8, 0); hole.lineTo(0, 0.5); hole.lineTo(-0.5, 0.5); hole.lineTo(-0.5, -0.5); hole.lineTo(0, -0.5); hole.closePath();
    s.holes.push(hole);
    return new THREE.ShapeGeometry(s); 
}
function createSplitterShape() { const s = new THREE.Shape(); s.moveTo(1.0, 0); s.lineTo(0.5, 0.8); s.lineTo(-0.5, 0.8); s.lineTo(-1.0, 0); s.lineTo(-0.5, -0.8); s.lineTo(0.5, -0.8); s.closePath(); return new THREE.ShapeGeometry(s); }
function createSwarmShape() { const s = new THREE.Shape(); s.moveTo(0.6, 0); s.lineTo(-0.4, 0.4); s.lineTo(-0.4, -0.4); s.closePath(); return new THREE.ShapeGeometry(s); }
function createOrbiterShape() { 
    const s = new THREE.Shape(); 
    s.moveTo(0.4, 1.2); s.lineTo(-0.4, 1.2); s.lineTo(-0.4, 0.4); s.lineTo(-1.2, 0.4); s.lineTo(-1.2, -0.4); 
    s.lineTo(-0.4, -0.4); s.lineTo(-0.4, -1.2); s.lineTo(0.4, -1.2); s.lineTo(0.4, -0.4); 
    s.lineTo(1.2, -0.4); s.lineTo(1.2, 0.4); s.lineTo(0.4, 0.4); s.closePath(); 
    return new THREE.ShapeGeometry(s); 
}
function createBomberShape() { 
    const s = new THREE.Shape(); 
    s.moveTo(1.2, 0); s.lineTo(0.85, 0.85); s.lineTo(0, 1.2); s.lineTo(-0.85, 0.85); s.lineTo(-1.2, 0); 
    s.lineTo(-0.85, -0.85); s.lineTo(0, -1.2); s.lineTo(0.85, -0.85); s.closePath(); 
    return new THREE.ShapeGeometry(s); 
}
function createTurretShape() { const s = new THREE.Shape(); s.moveTo(1.5, 0); s.lineTo(0, 0.7); s.lineTo(-0.8, 0.7); s.lineTo(-0.8, -0.7); s.lineTo(0, -0.7); s.closePath(); return new THREE.ShapeGeometry(s); }
function createTriangleGeometry(size = 1) { const s = new THREE.Shape(); s.moveTo(size, 0); s.lineTo(-size, size * 0.8); s.lineTo(-size, -size * 0.8); s.closePath(); return new THREE.ShapeGeometry(s); }

let SHAPES = {};
let ENEMY_TYPES = {};
let starLayers = [];
let boundaryMesh;
let mothershipGroup, mOuterRing, mMidRing, mCore, mGlow, mShieldMesh;
let turrets = [];
let playerEntity, playerMesh, playerGlow, playerShieldMesh, modeRing, crosshair;

function initAssets() {
    SHAPES = {
        player: createPlayerShape(), chaser: createChaserShape(), zigzag: createZigzagShape(),
        shooter: createShooterShape(), tank: createTankShape(), splitter: createSplitterShape(),
        swarm: createSwarmShape(), orbiter: createOrbiterShape(), bomber: createBomberShape(),
        turret: createTurretShape(), bullet: createTriangleGeometry(0.4)
    };

    ENEMY_TYPES = {
        chaser: { geometry: SHAPES.chaser, color: 0xff0044, hp: 1, speed: 0.03, points: 10 },
        zigzag: { geometry: SHAPES.zigzag, color: 0xff8800, hp: 1, speed: 0.04, points: 15 },
        shooter: { geometry: SHAPES.shooter, color: 0xaa00ff, hp: 2, speed: 0.02, points: 25 },
        tank: { geometry: SHAPES.tank, color: 0x00ff44, hp: 6, speed: 0.015, points: 60 }, 
        splitter: { geometry: SHAPES.splitter, color: 0xffee00, hp: 3, speed: 0.02, points: 30 },
        swarm: { geometry: SHAPES.swarm, color: 0xff00ff, hp: 1, speed: 0.08, points: 5 },
        orbiter: { geometry: SHAPES.orbiter, color: 0x00aaff, hp: 2, speed: 0.04, points: 25 },
        bomber: { geometry: SHAPES.bomber, color: 0xff6600, hp: 2, speed: 0.025, points: 40 } 
    };

    const createStarLayer = (count, radius, size, color, parallaxFactor) => {
        const geometry = new THREE.BufferGeometry(); const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) { const r = radius * Math.sqrt(Math.random()); const theta = Math.random() * Math.PI * 2; positions[i * 3] = Math.cos(theta) * r; positions[i * 3 + 1] = Math.sin(theta) * r; positions[i * 3 + 2] = -10; }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({ color: color, size: size, sizeAttenuation: false, transparent: true, opacity: 0.8 });
        const points = new THREE.Points(geometry, material); points.userData.parallaxFactor = parallaxFactor; return points;
    };
    starLayers = [createStarLayer(2000, 400, 1, 0x333366, 0.1), createStarLayer(1000, 300, 2, 0x666699, 0.3), createStarLayer(500, 200, 3, 0x9999cc, 0.6)];
    starLayers.forEach(layer => scene.add(layer));

    const boundaryGeometry = new THREE.RingGeometry(CONFIG.MAP_RADIUS - 0.5, CONFIG.MAP_RADIUS, 64);
    const boundaryMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
    boundaryMesh = new THREE.Mesh(boundaryGeometry, boundaryMaterial); boundaryMesh.position.z = -5; scene.add(boundaryMesh);

    mothershipGroup = new THREE.Group(); scene.add(mothershipGroup);
    mOuterRing = new THREE.Mesh(new THREE.RingGeometry(CONFIG.MOTHERSHIP_SIZE * 1.2, CONFIG.MOTHERSHIP_SIZE * 1.4, 6), new THREE.MeshBasicMaterial({ color: 0xff4400, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    mothershipGroup.add(mOuterRing);
    mMidRing = new THREE.Mesh(new THREE.RingGeometry(CONFIG.MOTHERSHIP_SIZE * 0.9, CONFIG.MOTHERSHIP_SIZE * 1.0, 32), new THREE.MeshBasicMaterial({ color: 0xff8800, side: THREE.DoubleSide }));
    mothershipGroup.add(mMidRing);
    mCore = new THREE.Mesh(new THREE.CircleGeometry(CONFIG.MOTHERSHIP_SIZE * 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
    mothershipGroup.add(mCore);
    mGlow = new THREE.Mesh(new THREE.CircleGeometry(CONFIG.MOTHERSHIP_SIZE * 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.4 }));
    mothershipGroup.add(mGlow);
    mShieldMesh = new THREE.Mesh(new THREE.RingGeometry(CONFIG.MOTHERSHIP_SIZE * 1.5, CONFIG.MOTHERSHIP_SIZE * 1.7, 32), new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0 }));
    mothershipGroup.add(mShieldMesh);

    playerEntity = EntityManager.createEntity();
    EntityManager.addComponent(playerEntity, 'Position', { x: 0, y: 15 });
    EntityManager.addComponent(playerEntity, 'Velocity', { x: 0, y: 0 });
    EntityManager.addComponent(playerEntity, 'Rotation', { z: 0 });
    EntityManager.addComponent(playerEntity, 'Player', { fireCooldown: 0, blinkCooldown: 0 });
    playerMesh = new THREE.Mesh(SHAPES.player, new THREE.MeshBasicMaterial({ color: CONFIG.PLAYER_COLOR_MOVE }));
    scene.add(playerMesh);
    EntityManager.addComponent(playerEntity, 'Renderable', { mesh: playerMesh });
    playerGlow = new THREE.Mesh(SHAPES.player, new THREE.MeshBasicMaterial({ color: CONFIG.PLAYER_COLOR_MOVE, transparent: true, opacity: 0.3 }));
    playerGlow.scale.set(1.5, 1.5, 1); scene.add(playerGlow);
    EntityManager.addComponent(playerEntity, 'Glow', { mesh: playerGlow });

    playerShieldMesh = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.8, 8), new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.5, wireframe: true }));
    playerShieldMesh.visible = false; scene.add(playerShieldMesh);
    modeRing = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.0, 32), new THREE.MeshBasicMaterial({ color: 0xff4400, side: THREE.DoubleSide, transparent: true, opacity: 0 }));
    scene.add(modeRing);
    crosshair = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    scene.add(crosshair);
    
    addTurret();
}

function addTurret() {
    if (turrets.length >= CONFIG.MAX_TURRETS) return;
    const turretMesh = new THREE.Mesh(SHAPES.turret, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    turrets.push({ mesh: turretMesh, cooldown: Math.random() * CONFIG.TURRET_COOLDOWN });
    mothershipGroup.add(turretMesh);
    recalculateTurretPositions();
    turretMesh.scale.set(0, 0, 1);
    new TWEEN.Tween(turretMesh.scale).to({ x: 1, y: 1 }, 300).easing(TWEEN.Easing.Back.Out).start();
}
function recalculateTurretPositions() {
    const count = turrets.length;
    for(let i=0; i<count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.PI / 2);
        turrets[i].mesh.position.set(Math.cos(angle) * CONFIG.MOTHERSHIP_SIZE * 1.1, Math.sin(angle) * CONFIG.MOTHERSHIP_SIZE * 1.1, 0.1);
    }
}

// ============================================

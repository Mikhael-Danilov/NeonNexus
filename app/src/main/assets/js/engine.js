// LOADING & DEBUG UTILITIES
// ============================================
const loadingScreen = document.getElementById('loading-screen');
const loadingBar = document.getElementById('loading-bar');
const debugLog = document.getElementById('debug-log');
const startScreen = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');
const playAgainButton = document.getElementById('play-again-button');
let loadProgress = 0;
let gameStarted = false;

function debug(msg) {
    console.log(msg);
    debugLog.innerHTML += msg + '<br>';
}

function updateProgress(amount, msg) {
    loadProgress = Math.min(100, loadProgress + amount);
    loadingBar.style.width = `${loadProgress}%`;
    if (msg) debug(msg);
}

// ============================================
// 1. PRAGMATIC ECS (Entity Component System)
// ============================================
const EntityManager = {
    entities: [],
    nextId: 0,
    createEntity() { const e = { id: this.nextId++, active: true }; this.entities.push(e); return e; },
    addComponent(e, n, d) { e[n] = d; },
    removeEntity(e) { e.active = false; if (e.Renderable && e.Renderable.mesh) scene.remove(e.Renderable.mesh); },
    cleanup() { this.entities = this.entities.filter(e => e.active); },
    getEntitiesWith(...c) { return this.entities.filter(e => e.active && c.every(comp => e[comp] !== undefined)); }
};

// ============================================
// 2. SPATIAL HASH GRID
// ============================================
class SpatialHashGrid {
    constructor(cs) { this.cs = cs; this.grid = new Map(); }
    _key(x, y) { return `${Math.floor(x / this.cs)},${Math.floor(y / this.cs)}`; }
    insert(e) { if (!e.Position) return; const k = this._key(e.Position.x, e.Position.y); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(e); }
    query(x, y, r) {
        const res = []; const cells = Math.ceil(r / this.cs);
        const sx = Math.floor(x / this.cs) - cells, ex = Math.floor(x / this.cs) + cells;
        const sy = Math.floor(y / this.cs) - cells, ey = Math.floor(y / this.cs) + cells;
        for (let i = sx; i <= ex; i++) for (let j = sy; j <= ey; j++) { const k = `${i},${j}`; if (this.grid.has(k)) res.push(...this.grid.get(k)); }
        return res;
    }
    clear() { this.grid.clear(); }
}
const grid = new SpatialHashGrid(5);

// ============================================
// CONFIG & STATE
// ============================================
const CONFIG = {
    PLAYER_SIZE: 1, PLAYER_COLOR_MOVE: 0x00ffff, PLAYER_COLOR_SHOOT: 0xff8800, PLAYER_SPEED: 0.15, PLAYER_MAX_SPEED: 0.7,
    PLAYER_TURN_SPEED: 0.25,
    ENEMY_SPAWN_RATE: 60, MAX_ENEMIES: 150, COMBO_TIMEOUT: 120,
    AIM_ASSIST_ANGLE: Math.PI / 3.5, AIM_ASSIST_STRENGTH: 0.75, ENEMY_BULLET_SPEED: 0.4,
    POWERUP_DROP_RATE: 0.12, CLEANUP_DISTANCE: 120, VIEW_SIZE: 13, MAP_RADIUS: 30,
    MOTHERSHIP_SIZE: 5, MOTHERSHIP_MAX_HP: 1000, TURRET_RANGE: 25, TURRET_COOLDOWN: 45,
    TURRET_TURN_SPEED: 0.05, MAX_TURRETS: 6, MAX_ZOOM_MULTIPLIER: 8, 
    POWERUP_MAGNET_RANGE: 6.0, POWERUP_PICKUP_RANGE: 1.0,
    POWERUP_LIFE: 180,
    BLINK_COOLDOWN: 1800 
};

const WEAPONS = {
    pulse: { cooldown: 15, color: 0xffff00, size: 0.3, speed: 1.0, unlockKills: 0 },
    laser: { cooldown: 45, color: 0x00ffff, size: 0.4, speed: 2.0, unlockKills: 25 },
    spread: { cooldown: 30, color: 0xff8800, size: 0.25, speed: 1.1, unlockKills: 75 }, // Reverted cooldown to 30
    missile: { cooldown: 45, color: 0xff00ff, size: 0.4, speed: 0.7, unlockKills: 150 }
};

const gameState = {
    score: 0, highScores: JSON.parse(localStorage.getItem('neonNexusHighScores')) || [], 
    combo: 1, comboTimer: 0, isGameOver: false, isMothershipDead: false, isPaused: false,
    difficultyMultiplier: 1, enemiesKilled: 0, totalKills: 0,
    unlockedWeapons: new Set(['pulse']), mode: 'auto', autoAction: 'move', currentWeapon: 'pulse', fireCooldown: 0,
    shield: false, multiplierTimer: 0, overdriveTimer: 0, mothershipHealth: CONFIG.MOTHERSHIP_MAX_HP,
    userZoom: 1.0,
};

// ============================================

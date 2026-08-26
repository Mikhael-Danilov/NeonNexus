// GAME LOGIC & SYSTEMS
// ============================================
const pointer = { x: 0, y: 0 };
const lastGameplayPointer = { x: 0, y: 0 };
const raycaster = new THREE.Raycaster();
const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const targetPoint = new THREE.Vector3();
let activePointers = 0;
let pointerCache = [];
let initialPinchDist = -1;
let initialZoomState = 1.0;

function initInput() {
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    
    document.addEventListener('keydown', (event) => {
        if (!gameStarted || gameState.isPaused) return;
        if (gameState.isGameOver) return;
        const key = event.key;
        if (key === '1') selectWeapon('pulse'); 
        else if (key === '2') selectWeapon('laser');
        else if (key === '3') selectWeapon('spread'); 
        else if (key === '4') selectWeapon('missile');
        else if (key === '5') triggerBlink();
        else if (event.code === 'Space') {
            event.preventDefault();
            toggleMode();
        }
    });
    
    document.querySelectorAll('.weapon-slot').forEach(slot => { 
        if (slot.id !== 'blink-button') {
            slot.addEventListener('pointerdown', (e) => { 
                e.stopPropagation(); 
                if(gameStarted) selectWeapon(slot.dataset.weapon); 
            }); 
        }
    });

    document.getElementById('blink-button').addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        triggerBlink();
    });

    const modeBtn = document.getElementById('mode-toggle-button');
    modeBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (gameStarted && !gameState.isGameOver && !gameState.isPaused) {
            toggleMode();
        }
    });

    document.getElementById('info-button').addEventListener('click', (e) => {
        e.stopPropagation();
        gameState.isPaused = true;
        document.getElementById('info-modal').classList.add('show');
    });
    document.getElementById('close-info').addEventListener('click', (e) => {
        e.stopPropagation();
        gameState.isPaused = false;
        document.getElementById('info-modal').classList.remove('show');
    });
    document.getElementById('info-modal').addEventListener('click', (e) => {
        if (e.target.id === 'info-modal') {
            gameState.isPaused = false;
            document.getElementById('info-modal').classList.remove('show');
        }
    });
}

function updatePointerFromEvent(event) {
    if (pointerCache.length >= 2) return;
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    if (!event.target.closest('button') && !event.target.closest('.weapon-slot') && !event.target.closest('#info-modal') && !event.target.closest('#hud-left') && !event.target.closest('#hud-right')) {
        lastGameplayPointer.x = pointer.x;
        lastGameplayPointer.y = pointer.y;
    }
}

function checkIsShootTarget(target) {
    let nearestDist = Infinity;
    const enemies = EntityManager.getEntitiesWith('Enemy', 'Position');
    if (enemies.length === 0) return false;
    
    const playerPos = new THREE.Vector3(playerEntity.Position.x, playerEntity.Position.y, 0);
    const tapDir = new THREE.Vector3().subVectors(target, playerPos).normalize();
    
    let hasAlignedEnemy = false;
    enemies.forEach(e => {
        const d = Math.hypot(e.Position.x - target.x, e.Position.y - target.y);
        if (d < nearestDist) nearestDist = d;
        
        const enemyVec = new THREE.Vector3(e.Position.x, e.Position.y, 0).sub(playerPos);
        const enemyDist = enemyVec.length();
        if (enemyDist < 28) {
            const enemyDir = enemyVec.clone().normalize();
            if (tapDir.angleTo(enemyDir) < Math.PI / 4) {
                hasAlignedEnemy = true;
            }
        }
    });
    
    // Generous shoot zone: within 8.0 world units of any enemy or aimed in an enemy's cone
    return (nearestDist < 8.0 || hasAlignedEnemy);
}

function onPointerMove(event) {
    if (gameState.isPaused) return;
    
    const index = pointerCache.findIndex(p => p.pointerId === event.pointerId);
    if (index !== -1) {
        pointerCache[index] = event;
    }
    
    if (pointerCache.length === 2) {
        const currentDist = Math.hypot(
            pointerCache[0].clientX - pointerCache[1].clientX,
            pointerCache[0].clientY - pointerCache[1].clientY
        );
        if (initialPinchDist > 0) {
            const ratio = initialPinchDist / currentDist; 
            gameState.userZoom = Math.max(0.4, Math.min(initialZoomState * ratio, 2.5));
        }
        return;
    }
    
    updatePointerFromEvent(event);
    
    if (pointerCache.length === 1 && gameState.mode === 'auto' && gameStarted && !gameState.isGameOver) {
        raycaster.setFromCamera(pointer, camera);
        raycaster.ray.intersectPlane(interactionPlane, targetPoint);
        const shouldShoot = checkIsShootTarget(targetPoint);
        const newAction = shouldShoot ? 'shoot' : 'move';
        if (gameState.autoAction !== newAction) {
            gameState.autoAction = newAction;
            updateModeVisuals();
        }
    }
}

function onPointerDown(event) {
    if(event.target.tagName === 'BUTTON' || event.target.closest('.weapon-slot') || event.target.closest('#info-modal') || event.target.closest('#hud-left') || event.target.closest('#hud-right')) return;
    if (gameState.isPaused) return;
    
    if (!gameStarted || gameState.isGameOver) return;
    
    pointerCache.push(event);
    if (pointerCache.length === 2) {
        initialPinchDist = Math.hypot(
            pointerCache[0].clientX - pointerCache[1].clientX,
            pointerCache[0].clientY - pointerCache[1].clientY
        );
        initialZoomState = gameState.userZoom;
    }
    
    updatePointerFromEvent(event);
    
    if (pointerCache.length >= 2) return;
    
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(playerMesh);
    
    if (intersects.length > 0) {
        toggleMode();
    } else {
        if (gameState.mode === 'auto') {
            raycaster.ray.intersectPlane(interactionPlane, targetPoint);
            if (checkIsShootTarget(targetPoint)) {
                gameState.autoAction = 'shoot';
            } else {
                gameState.autoAction = 'move';
            }
            updateModeVisuals();
        }
        
        if (gameState.mode === 'shoot' || (gameState.mode === 'auto' && gameState.autoAction === 'shoot')) {
            fireWeapon();
        }
    }
}

function onPointerUp(event) {
    const index = pointerCache.findIndex(p => p.pointerId === event.pointerId);
    if (index !== -1) {
        pointerCache.splice(index, 1);
    }
    if (pointerCache.length < 2) {
        initialPinchDist = -1;
    }
}

function triggerBlink() {
    if (!gameStarted || gameState.isGameOver || gameState.isPaused) return;
    if (playerEntity.Player.blinkCooldown > 0) return;
    
    const oldPos = new THREE.Vector3(playerEntity.Position.x, playerEntity.Position.y, 0);
    
    raycaster.setFromCamera(lastGameplayPointer, camera);
    raycaster.ray.intersectPlane(interactionPlane, targetPoint);
    
    playerEntity.Position.x = targetPoint.x;
    playerEntity.Position.y = targetPoint.y;
    
    createExplosion(oldPos.x, oldPos.y, 0x00ffff, 10);
    createExplosion(playerEntity.Position.x, playerEntity.Position.y, 0x00ffff, 10);
    SFX.blink();
    
    playerEntity.Player.blinkCooldown = CONFIG.BLINK_COOLDOWN;
}

function getAimAssistDirection(originalDirection) {
    const maxAngle = CONFIG.AIM_ASSIST_ANGLE; let bestEnemy = null, bestAngle = maxAngle;
    const enemies = EntityManager.getEntitiesWith('Enemy', 'Position');
    const playerPos = new THREE.Vector3(playerEntity.Position.x, playerEntity.Position.y, 0);
    enemies.forEach(e => {
        const enemyDirection = new THREE.Vector3().subVectors(new THREE.Vector3(e.Position.x, e.Position.y, 0), playerPos).normalize();
        const angle = originalDirection.angleTo(enemyDirection);
        if (angle < bestAngle) { bestAngle = angle; bestEnemy = e; }
    });
    if (bestEnemy) {
        const enemyDirection = new THREE.Vector3().subVectors(new THREE.Vector3(bestEnemy.Position.x, bestEnemy.Position.y, 0), playerPos).normalize();
        return originalDirection.clone().lerp(enemyDirection, CONFIG.AIM_ASSIST_STRENGTH);
    }
    return originalDirection;
}

function fireWeapon() {
    if (playerEntity.Player.fireCooldown > 0) return;
    const weapon = WEAPONS[gameState.currentWeapon];
    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(interactionPlane, targetPoint);
    let direction = new THREE.Vector3().subVectors(targetPoint, new THREE.Vector3(playerEntity.Position.x, playerEntity.Position.y, 0)).normalize();
    direction = getAimAssistDirection(direction);
    SFX[gameState.currentWeapon]();

    if (gameState.currentWeapon === 'pulse') fireBullet(playerEntity.Position.x, playerEntity.Position.y, direction, weapon.color, weapon.speed, 1, 'pulse');
    else if (gameState.currentWeapon === 'spread') {
        for (let i = -1; i <= 1; i++) { // Changed to 3 rays
            const angle = i * 0.12; // Narrowed spread angle
            const rotMatrix = new THREE.Matrix4().makeRotationZ(angle);
            const spreadDir = direction.clone().applyMatrix4(rotMatrix);
            fireBullet(playerEntity.Position.x, playerEntity.Position.y, spreadDir, weapon.color, weapon.speed, 1, 'pulse');
        }
    } else if (gameState.currentWeapon === 'laser') fireLaser(direction, weapon.color);
    else if (gameState.currentWeapon === 'missile') fireBullet(playerEntity.Position.x, playerEntity.Position.y, direction, weapon.color, weapon.speed, 2, 'missile');
    
    playerEntity.Player.fireCooldown = gameState.overdriveTimer > 0 ? 0 : weapon.cooldown;
}


function fireBullet(x, y, direction, color, speed, damage, type) {
    const e = EntityManager.createEntity();
    EntityManager.addComponent(e, 'Position', { x: x, y: y });
    EntityManager.addComponent(e, 'Velocity', { x: direction.x * speed, y: direction.y * speed });
    EntityManager.addComponent(e, 'Rotation', { z: Math.atan2(direction.y, direction.x) });
    const mesh = new THREE.Mesh(SHAPES.bullet, new THREE.MeshBasicMaterial({ color: color }));
    scene.add(mesh);
    EntityManager.addComponent(e, 'Renderable', { mesh: mesh });
    EntityManager.addComponent(e, 'Bullet', { life: 100, damage: damage, type: type, color: color, target: null });
}

function fireLaser(direction, color) {
    const hits = [];
    const enemies = EntityManager.getEntitiesWith('Enemy', 'Position');
    const origin = new THREE.Vector3(playerEntity.Position.x, playerEntity.Position.y, 0);
    enemies.forEach(e => {
        const enemyPos = new THREE.Vector3(e.Position.x, e.Position.y, 0).sub(origin);
        const projection = enemyPos.dot(direction);
        if (projection > 0) {
            const closestPoint = origin.clone().add(direction.clone().multiplyScalar(projection));
            const distToRay = closestPoint.distanceTo(new THREE.Vector3(e.Position.x, e.Position.y, 0));
            if (distToRay < 1.2) hits.push({ enemy: e, distance: projection });
        }
    });
    hits.sort((a, b) => a.distance - b.distance);
    hits.forEach(hit => damageEnemy(hit.enemy, 3));

    const laserBeam = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.2), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 }));
    laserBeam.position.copy(origin); laserBeam.rotation.z = Math.atan2(direction.y, direction.x); laserBeam.translateX(20);
    const e = EntityManager.createEntity();
    EntityManager.addComponent(e, 'Renderable', { mesh: laserBeam });
    EntityManager.addComponent(e, 'Laser', { life: 5 });
    scene.add(laserBeam);
}

function damageEnemy(enemy, damage) {
    if (!enemy.Enemy) return;
    enemy.Enemy.hp -= damage;
    
    if (enemy.active) {
        const originalScale = enemy.Renderable.mesh.scale.x;
        new TWEEN.Tween(enemy.Renderable.mesh.scale)
            .to({ x: originalScale * 1.3, y: originalScale * 1.3 }, 50)
            .yoyo(true).repeat(1)
            .start();
    }

    if (enemy.Enemy.hp <= 0) {
        SFX.death();
        createExplosion(enemy.Position.x, enemy.Position.y, enemy.Enemy.color);
        
        if (enemy.Enemy.type === 'bomber') {
            SFX.baseHit(); 
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
                spawnEnemyBullet(enemy.Position.x, enemy.Position.y, dir);
            }
        }

        if (enemy.Enemy.type === 'splitter') {
            for(let i=0; i<3; i++) {
                const angle = (i / 3) * Math.PI * 2 + Math.random() * 0.5;
                const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
                spawnSpecificEnemy('swarm', enemy.Position.x, enemy.Position.y, dir);
            }
        }
        if (Math.random() < CONFIG.POWERUP_DROP_RATE) spawnPowerup(enemy.Position.x, enemy.Position.y);
        const killX = enemy.Position.x, killY = enemy.Position.y;
        EntityManager.removeEntity(enemy);
        updateScore(enemy.Enemy.points, killX, killY);
        gameState.totalKills++;
        localStorage.setItem('neonNexusTotalKills', gameState.totalKills);
        checkWeaponUnlocks();
    } else {
        SFX.hit();
        const scale = 0.8 + (enemy.Enemy.hp / enemy.Enemy.maxHp) * 0.2;
        new TWEEN.Tween(enemy.Renderable.mesh.scale).to({ x: scale, y: scale }, 100).delay(60).start();
    }
}

function damageMothership(amount) {
    if (gameState.isGameOver) return;
    gameState.mothershipHealth -= amount;
    SFX.baseHit();
    updateMothershipUI();
    mShieldMesh.material.opacity = 0.8;
    mCore.material.color.setHex(0xffffff);
    setTimeout(() => { mCore.material.color.setHex(0xffaa00); }, 50);
    const camPos = { x: camera.position.x, y: camera.position.y };
    new TWEEN.Tween(camPos).to({ x: camera.position.x + (Math.random() - 0.5) * amount * 0.1, y: camera.position.y + (Math.random() - 0.5) * amount * 0.1 }, 100).yoyo(true).repeat(1).onUpdate(() => { camera.position.x = camPos.x; camera.position.y = camPos.y; }).start();

    if (gameState.mothershipHealth <= 0) {
        gameState.mothershipHealth = 0; updateMothershipUI(); gameOver(true);
    }
}

function spawnEnemy() {
    let typeKey; const rand = Math.random();
    if (gameState.enemiesKilled < 10) typeKey = 'chaser';
    else if (gameState.enemiesKilled < 25) typeKey = rand < 0.7 ? 'chaser' : 'zigzag';
    else if (gameState.enemiesKilled < 50) { if (rand < 0.5) typeKey = 'chaser'; else if (rand < 0.8) typeKey = 'zigzag'; else typeKey = 'shooter'; }
    else if (gameState.enemiesKilled < 75) { if (rand < 0.3) typeKey = 'chaser'; else if (rand < 0.5) typeKey = 'zigzag'; else if (rand < 0.7) typeKey = 'shooter'; else if (rand < 0.85) typeKey = 'tank'; else if (rand < 0.95) typeKey = 'splitter'; else typeKey = 'bomber'; }
    else { if (rand < 0.2) typeKey = 'chaser'; else if (rand < 0.35) typeKey = 'zigzag'; else if (rand < 0.55) typeKey = 'shooter'; else if (rand < 0.65) typeKey = 'tank'; else if (rand < 0.8) typeKey = 'splitter'; else if (rand < 0.9) typeKey = 'orbiter'; else typeKey = 'bomber'; }
    
    const visibleWidth = (camera.right - camera.left); const visibleHeight = (camera.top - camera.bottom);
    const spawnDist = Math.max(visibleWidth, visibleHeight) / 2 * 1.2;
    const angle = Math.random() * Math.PI * 2;
    const x = playerEntity.Position.x + Math.cos(angle) * spawnDist;
    const y = playerEntity.Position.y + Math.sin(angle) * spawnDist;
    spawnSpecificEnemy(typeKey, x, y, null);
}

function spawnSpecificEnemy(typeKey, x, y, initialVelocity) {
    const typeDef = ENEMY_TYPES[typeKey];
    const e = EntityManager.createEntity();
    EntityManager.addComponent(e, 'Position', { x: x, y: y });
    EntityManager.addComponent(e, 'Velocity', { x: 0, y: 0 });
    EntityManager.addComponent(e, 'Rotation', { z: 0 });
    
    const distToPlayer = Math.hypot(x - playerEntity.Position.x, y - playerEntity.Position.y);
    const distToBase = Math.hypot(x, y);
    const targetType = (distToBase < distToPlayer || Math.random() < 0.3) ? 'mothership' : 'player';
    
    EntityManager.addComponent(e, 'Enemy', {
        type: typeKey, hp: typeDef.hp, maxHp: typeDef.hp, speed: typeDef.speed * gameState.difficultyMultiplier,
        points: typeDef.points, phase: Math.random() * Math.PI * 2, shootTimer: 60 + Math.random() * 60,
        color: typeDef.color, initialVel: initialVelocity || new THREE.Vector3(0,0,0),
        targetType: targetType, retargetTimer: 60 + Math.random() * 60,
        strafeDir: Math.random() < 0.5 ? 1 : -1 
    });

    const mesh = new THREE.Mesh(typeDef.geometry, new THREE.MeshBasicMaterial({ color: typeDef.color }));
    mesh.position.set(x, y, 0); scene.add(mesh);
    EntityManager.addComponent(e, 'Renderable', { mesh: mesh });

    const eyeGeo = new THREE.CircleGeometry(0.2, 8);
    const eyeColor = targetType === 'player' ? 0xff0044 : 0xff8800;
    const eyeMesh = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: eyeColor }));
    eyeMesh.position.set(0.4, 0, 0.1); 
    mesh.add(eyeMesh);
    EntityManager.addComponent(e, 'TargetIndicator', { mesh: eyeMesh });
}

function spawnEnemyBullet(x, y, direction) {
    const e = EntityManager.createEntity();
    EntityManager.addComponent(e, 'Position', { x: x, y: y });
    EntityManager.addComponent(e, 'Velocity', { x: direction.x * CONFIG.ENEMY_BULLET_SPEED, y: direction.y * CONFIG.ENEMY_BULLET_SPEED });
    EntityManager.addComponent(e, 'Rotation', { z: Math.atan2(direction.y, direction.x) });
    const mesh = new THREE.Mesh(SHAPES.bullet, new THREE.MeshBasicMaterial({ color: 0xff00ff }));
    scene.add(mesh);
    EntityManager.addComponent(e, 'Renderable', { mesh: mesh });
    EntityManager.addComponent(e, 'Bullet', { life: 200, damage: 0, type: 'enemy', color: 0xff00ff, target: null });
}

function fireMothershipBullet(turret, targetEnemy) {
    const dir = new THREE.Vector3().subVectors(new THREE.Vector3(targetEnemy.Position.x, targetEnemy.Position.y, 0), turret.mesh.position).normalize();
    const e = EntityManager.createEntity();
    EntityManager.addComponent(e, 'Position', { x: turret.mesh.position.x, y: turret.mesh.position.y });
    EntityManager.addComponent(e, 'Velocity', { x: dir.x * 0.6, y: dir.y * 0.6 });
    EntityManager.addComponent(e, 'Rotation', { z: Math.atan2(dir.y, dir.x) });
    const mesh = new THREE.Mesh(SHAPES.bullet, new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
    scene.add(mesh);
    EntityManager.addComponent(e, 'Renderable', { mesh: mesh });
    EntityManager.addComponent(e, 'Bullet', { life: 100, damage: 1, type: 'mothership', color: 0xffaa00, target: null });
    SFX.turretFire();
}

function spawnPowerup(x, y) {
    const weights = { 'shield': 30, 'multiplier': 30, 'overdrive': 20, 'turret': 10, 'nuke': 10 };
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    let type = 'shield';
    for (const t in weights) {
        if (rand < weights[t]) { type = t; break; }
        rand -= weights[t];
    }

    const colors = { shield: 0x00aaff, multiplier: 0xffaa00, overdrive: 0x00ffff, nuke: 0xff0044, turret: 0x88ff00 };
    
    let geometry;
    if (type === 'shield') geometry = new THREE.CircleGeometry(0.8, 6);
    else if (type === 'multiplier') geometry = new THREE.PlaneGeometry(1.0, 1.0);
    else if (type === 'overdrive') geometry = new THREE.CircleGeometry(1.0, 3);
    else if (type === 'nuke') geometry = new THREE.PlaneGeometry(1.2, 1.2);
    else if (type === 'turret') geometry = SHAPES.turret;

    const e = EntityManager.createEntity();
    EntityManager.addComponent(e, 'Position', { x: x, y: y });
    EntityManager.addComponent(e, 'Velocity', { x: 0, y: 0 }); 
    
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colors[type] }));
    mesh.position.set(x, y, 0); 
    if (type === 'multiplier') mesh.rotation.z = Math.PI / 4; 
    scene.add(mesh);
    
    mesh.scale.set(0, 0, 1);
    new TWEEN.Tween(mesh.scale).to({ x: 1.2, y: 1.2 }, 200).easing(TWEEN.Easing.Back.Out).chain(
        new TWEEN.Tween(mesh.scale).to({ x: 1.0, y: 1.0 }, 100)
    ).start();

    EntityManager.addComponent(e, 'Renderable', { mesh: mesh });
    EntityManager.addComponent(e, 'Powerup', { type: type, rotationSpeed: 0.05, color: colors[type], life: CONFIG.POWERUP_LIFE });
}

function applyPowerup(type) {
    SFX.powerup();
    if (type === 'shield') { gameState.shield = true; document.getElementById('shield-status').style.display = 'block'; }
    else if (type === 'multiplier') { gameState.multiplierTimer = 300; document.getElementById('multiplier-status').style.display = 'block'; }
    else if (type === 'overdrive') { gameState.overdriveTimer = 180; document.getElementById('overdrive-status').style.display = 'block'; }
    else if (type === 'turret') { addTurret(); }
    else if (type === 'nuke') {
        const enemies = EntityManager.getEntitiesWith('Enemy');
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (enemies[i].Enemy.type !== 'tank') damageEnemy(enemies[i], 10);
            else damageEnemy(enemies[i], 2);
        }
    }
}

function createExplosion(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
        const e = EntityManager.createEntity();
        EntityManager.addComponent(e, 'Position', { x: x, y: y });
        const angle = Math.random() * Math.PI * 2; const speed = 0.1 + Math.random() * 0.3;
        EntityManager.addComponent(e, 'Velocity', { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 }));
        scene.add(mesh);
        EntityManager.addComponent(e, 'Renderable', { mesh: mesh });
        EntityManager.addComponent(e, 'Particle', { life: 30 + Math.random() * 30, decay: 0.02, scaleDecay: 0.97, rotationSpeed: 0.1 });
    }
}

function spawnThrust(x, y, rotationZ, color, offset = -0.5) {
    if (EntityManager.getEntitiesWith('Particle').length > 500) return;
    const localOffset = new THREE.Vector3(offset, (Math.random() - 0.5) * 0.2, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), rotationZ);
    const e = EntityManager.createEntity();
    EntityManager.addComponent(e, 'Position', { x: x + localOffset.x, y: y + localOffset.y });
    const vel = localOffset.clone().normalize().multiplyScalar(0.15 + Math.random() * 0.1);
    vel.applyAxisAngle(new THREE.Vector3(0, 0, 1), (Math.random() - 0.5) * 0.5);
    EntityManager.addComponent(e, 'Velocity', { x: vel.x, y: vel.y });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 }));
    mesh.rotation.z = rotationZ + Math.PI; scene.add(mesh);
    EntityManager.addComponent(e, 'Renderable', { mesh: mesh });
    EntityManager.addComponent(e, 'Particle', { life: 15, decay: 0.05, scaleDecay: 0.9, rotationSpeed: 0 });
}

// ============================================

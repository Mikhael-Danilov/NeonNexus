// SYSTEM UPDATES
// ============================================
function updatePlayerSystem() {
    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(interactionPlane, targetPoint);
    
    const delta = new THREE.Vector3().subVectors(targetPoint, new THREE.Vector3(playerEntity.Position.x, playerEntity.Position.y, 0));
    const distanceToMouse = delta.length();
    if (distanceToMouse > 0.1) {
        const targetAngle = Math.atan2(delta.y, delta.x);
        const diff = Math.atan2(Math.sin(targetAngle - playerEntity.Rotation.z), Math.cos(targetAngle - playerEntity.Rotation.z));
        playerEntity.Rotation.z += diff * CONFIG.PLAYER_TURN_SPEED;
    }
    
    const isMoving = gameState.mode === 'move' || (gameState.mode === 'auto' && gameState.autoAction === 'move');
    if (isMoving) {
        const dx = targetPoint.x - playerEntity.Position.x;
        const dy = targetPoint.y - playerEntity.Position.y;
        let moveX = dx * CONFIG.PLAYER_SPEED;
        let moveY = dy * CONFIG.PLAYER_SPEED;
        const moveDist = Math.hypot(moveX, moveY);
        
        if (moveDist > CONFIG.PLAYER_MAX_SPEED) {
            const scale = CONFIG.PLAYER_MAX_SPEED / moveDist;
            moveX *= scale;
            moveY *= scale;
        }
        
        playerEntity.Position.x += moveX;
        playerEntity.Position.y += moveY;
        
        if (distanceToMouse > 0.5 && frameCount % 2 === 0) {
            spawnThrust(playerEntity.Position.x, playerEntity.Position.y, playerEntity.Rotation.z, CONFIG.PLAYER_COLOR_MOVE, -0.6);
        }
    }
    
    const distFromOrigin = Math.hypot(playerEntity.Position.x, playerEntity.Position.y);
    const maxViewSize = CONFIG.VIEW_SIZE * CONFIG.MAX_ZOOM_MULTIPLIER;
    const targetViewSize = Math.min((CONFIG.VIEW_SIZE * gameState.userZoom) + (distFromOrigin * 0.3), maxViewSize);
    const currentViewSize = camera.top;
    const newViewSize = currentViewSize + (targetViewSize - currentViewSize) * 0.05;
    camera.left = -newViewSize * aspect; camera.right = newViewSize * aspect;
    camera.top = newViewSize; camera.bottom = -newViewSize;
    camera.updateProjectionMatrix();
    
    const cameraTargetX = playerEntity.Position.x * 0.7;
    const cameraTargetY = playerEntity.Position.y * 0.7;
    camera.position.x += (cameraTargetX - camera.position.x) * 0.05;
    camera.position.y += (cameraTargetY - camera.position.y) * 0.05;
    
    starLayers.forEach(layer => {
        layer.position.x = camera.position.x * layer.userData.parallaxFactor;
        layer.position.y = camera.position.y * layer.userData.parallaxFactor;
    });
    
    const playerDist = Math.hypot(playerEntity.Position.x, playerEntity.Position.y);
    const edgeProximity = Math.max(0, Math.min(1, (playerDist - (CONFIG.MAP_RADIUS - 6)) / 6));
    const edgePulse = playerDist > CONFIG.MAP_RADIUS ? 0.15 * (0.5 + 0.5 * Math.sin(Date.now() * 0.02)) : 0;
    boundaryMesh.material.opacity = Math.min(1, 0.3 + 0.5 * edgeProximity + edgePulse);
    
    playerMesh.position.set(playerEntity.Position.x, playerEntity.Position.y, 0);
    playerMesh.rotation.z = playerEntity.Rotation.z;
    playerGlow.position.set(playerEntity.Position.x, playerEntity.Position.y, 0);
    playerGlow.rotation.z = playerEntity.Rotation.z;
    playerShieldMesh.position.set(playerEntity.Position.x, playerEntity.Position.y, 0);
    playerShieldMesh.rotation.z += 0.02;
    modeRing.position.set(playerEntity.Position.x, playerEntity.Position.y, 0);
    crosshair.position.copy(targetPoint);
    
    if (playerEntity.Player.fireCooldown > 0) playerEntity.Player.fireCooldown--;
    
    if (pointerCache.length === 1 && !gameState.isPaused && !gameState.isGameOver && gameStarted) {
        if (gameState.mode === 'shoot' || (gameState.mode === 'auto' && gameState.autoAction === 'shoot')) {
            if (playerEntity.Player.fireCooldown <= 0) {
                fireWeapon();
            }
        }
    }
    
    const blinkBtn = document.getElementById('blink-button');
    if (playerEntity.Player.blinkCooldown > 0) {
        playerEntity.Player.blinkCooldown--;
        const progress = 1 - (playerEntity.Player.blinkCooldown / CONFIG.BLINK_COOLDOWN);
        blinkBtn.style.opacity = 0.3 + 0.7 * progress;
        blinkBtn.style.pointerEvents = 'none';
    } else {
        blinkBtn.style.opacity = 1;
        blinkBtn.style.pointerEvents = 'auto';
    }

    if (gameState.multiplierTimer > 0) { gameState.multiplierTimer--; if (gameState.multiplierTimer === 0) document.getElementById('multiplier-status').style.display = 'none'; }
    if (gameState.overdriveTimer > 0) { gameState.overdriveTimer--; if (gameState.overdriveTimer === 0) document.getElementById('overdrive-status').style.display = 'none'; }
}

function updateMothershipSystem() {
    mOuterRing.rotation.z += 0.005; mMidRing.rotation.z -= 0.008;
    const pulse = 1 + Math.sin(frameCount * 0.05) * 0.05;
    mCore.scale.setScalar(pulse); mGlow.scale.setScalar(pulse * 1.2);
    if (mShieldMesh.material.opacity > 0) mShieldMesh.material.opacity -= 0.05;

    turrets.forEach(turret => {
        let nearestEnemy = null; let minDist = CONFIG.TURRET_RANGE;
        const enemies = EntityManager.getEntitiesWith('Enemy', 'Position');
        enemies.forEach(e => {
            const dist = Math.hypot(e.Position.x, e.Position.y);
            if (dist < minDist) { minDist = dist; nearestEnemy = e; }
        });

        if (nearestEnemy) {
            const targetAngle = Math.atan2(nearestEnemy.Position.y - turret.mesh.position.y, nearestEnemy.Position.x - turret.mesh.position.x);
            let diff = targetAngle - turret.mesh.rotation.z;
            while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2;
            turret.mesh.rotation.z += diff * CONFIG.TURRET_TURN_SPEED;
            if (turret.cooldown <= 0 && Math.abs(diff) < 0.2) { fireMothershipBullet(turret, nearestEnemy); turret.cooldown = CONFIG.TURRET_COOLDOWN; }
        }
        turret.cooldown--;
    });
}

function updateEnemySystem() {
    const time = performance.now() * 0.001;
    const enemies = EntityManager.getEntitiesWith('Enemy', 'Position', 'Velocity', 'Rotation');
    
    enemies.forEach(e => {
        const data = e.Enemy;
        
        data.retargetTimer--;
        if (data.retargetTimer <= 0) {
            data.retargetTimer = 60 + Math.random() * 120;
            const distToPlayer = Math.hypot(e.Position.x - playerEntity.Position.x, e.Position.y - playerEntity.Position.y);
            const distToBase = Math.hypot(e.Position.x, e.Position.y);
            if (distToPlayer < 10 && data.targetType !== 'player') {
                data.targetType = 'player';
                e.TargetIndicator.mesh.material.color.setHex(0xff0044); 
            } else if (distToBase < distToPlayer && Math.random() < 0.3) {
                data.targetType = 'mothership';
                e.TargetIndicator.mesh.material.color.setHex(0xff8800); 
            }
        }

        const targetX = data.targetType === 'mothership' ? 0 : playerEntity.Position.x;
        const targetY = data.targetType === 'mothership' ? 0 : playerEntity.Position.y;
        const dx = targetX - e.Position.x; const dy = targetY - e.Position.y;
        const distance = Math.hypot(dx, dy) || 1; 
        const dirX = dx / distance; const dirY = dy / distance;
        
        let targetVelX = 0, targetVelY = 0;
        
        if (data.type === 'chaser' || data.type === 'tank' || data.type === 'splitter' || data.type === 'bomber') { 
            targetVelX = dirX * data.speed;
            targetVelY = dirY * data.speed;
        } else if (data.type === 'zigzag') { 
            const perpX = -dirY; const perpY = dirX;
            const wave = Math.sin(time * 4 + data.phase);
            targetVelX = (dirX + perpX * wave * 1.2) * data.speed;
            targetVelY = (dirY + perpY * wave * 1.2) * data.speed;
        } else if (data.type === 'shooter') {
            if (distance > 12) { 
                targetVelX = dirX * data.speed;
                targetVelY = dirY * data.speed;
            } else if (distance < 8) { 
                targetVelX = -dirX * data.speed * 0.8;
                targetVelY = -dirY * data.speed * 0.8;
            } else { 
                const perpX = -dirY; const perpY = dirX; 
                targetVelX = perpX * data.speed * data.strafeDir; 
                targetVelY = perpY * data.speed * data.strafeDir;
                if (Math.random() < 0.01) data.strafeDir *= -1; 
                data.shootTimer--; 
                if (data.shootTimer <= 0) { spawnEnemyBullet(e.Position.x, e.Position.y, new THREE.Vector3(dirX, dirY, 0)); data.shootTimer = 120; } 
            }
        } else if (data.type === 'swarm') {
            targetVelX = dirX * data.speed + (Math.random() - 0.5) * data.speed * 0.4;
            targetVelY = dirY * data.speed + (Math.random() - 0.5) * data.speed * 0.4;
            
            if (data.initialVel.lengthSq() > 0.01) { 
                targetVelX += data.initialVel.x; 
                targetVelY += data.initialVel.y; 
                data.initialVel.multiplyScalar(0.9); 
            }
        } else if (data.type === 'orbiter') {
            if (distance > 14) { 
                targetVelX = dirX * data.speed;
                targetVelY = dirY * data.speed;
            } else if (distance < 10) { 
                targetVelX = -dirX * data.speed * 0.6;
                targetVelY = -dirY * data.speed * 0.6;
            } else { 
                const perpX = -dirY; const perpY = dirX; 
                targetVelX = perpX * data.speed * data.strafeDir; 
                targetVelY = perpY * data.speed * data.strafeDir;
                if (Math.random() < 0.005) data.strafeDir *= -1; 
                
                data.shootTimer--; 
                if (data.shootTimer <= 0) {
                    spawnEnemyBullet(e.Position.x, e.Position.y, new THREE.Vector3(dirX, dirY, 0));
                    const rotMatrixL = new THREE.Matrix4().makeRotationZ(0.2); const rotMatrixR = new THREE.Matrix4().makeRotationZ(-0.2); 
                    spawnEnemyBullet(e.Position.x, e.Position.y, new THREE.Vector3(dirX, dirY, 0).applyMatrix4(rotMatrixL));
                    spawnEnemyBullet(e.Position.x, e.Position.y, new THREE.Vector3(dirX, dirY, 0).applyMatrix4(rotMatrixR));
                    data.shootTimer = 120;
                }
            }
        }
        
        const steerForce = 0.05; 
        e.Velocity.x += (targetVelX - e.Velocity.x) * steerForce;
        e.Velocity.y += (targetVelY - e.Velocity.y) * steerForce;

        if (e.Velocity.x !== 0 || e.Velocity.y !== 0) {
            e.Rotation.z = Math.atan2(e.Velocity.y, e.Velocity.x);
            if (frameCount % 3 === 0) spawnThrust(e.Position.x, e.Position.y, e.Rotation.z, data.color, -0.5);
        }
    });
}

function updateBulletSystem() {
    const bullets = EntityManager.getEntitiesWith('Bullet', 'Position', 'Velocity');
    bullets.forEach(e => {
        if (e.Bullet.type === 'missile') {
            if (!e.Bullet.target || !e.Bullet.target.active) {
                let bestTarget = null;
                let bestDot = -2;
                const missileDir = new THREE.Vector3(e.Velocity.x, e.Velocity.y, 0).normalize();
                
                const enemies = EntityManager.getEntitiesWith('Enemy', 'Position');
                enemies.forEach(en => {
                    const dirToEnemy = new THREE.Vector3(en.Position.x - e.Position.x, en.Position.y - e.Position.y, 0).normalize();
                    const dot = missileDir.dot(dirToEnemy);
                    if (dot > bestDot) {
                        bestDot = dot;
                        bestTarget = en;
                    }
                });
                e.Bullet.target = bestTarget;
            }
            if (e.Bullet.target) {
                const targetDirX = e.Bullet.target.Position.x - e.Position.x;
                const targetDirY = e.Bullet.target.Position.y - e.Position.y;
                const len = Math.hypot(targetDirX, targetDirY);
                const tdx = targetDirX / len, tdy = targetDirY / len;
                const speed = Math.hypot(e.Velocity.x, e.Velocity.y);
                const cdx = e.Velocity.x / speed, cdy = e.Velocity.y / speed;
                const ndx = cdx + (tdx - cdx) * 0.1, ndy = cdy + (tdy - cdy) * 0.1;
                const nlen = Math.hypot(ndx, ndy);
                e.Velocity.x = (ndx / nlen) * speed; e.Velocity.y = (ndy / nlen) * speed;
                e.Rotation.z = Math.atan2(ndy, ndx);
                if (frameCount % 2 === 0) spawnThrust(e.Position.x, e.Position.y, e.Rotation.z, e.Bullet.color, -0.4);
            }
        }
        e.Bullet.life--;
    });
}

function updateLifetimeSystem() {
    const lifetimes = EntityManager.getEntitiesWith('Bullet', 'Position');
    lifetimes.forEach(e => {
        if (e.Bullet.life <= 0 || Math.hypot(e.Position.x - playerEntity.Position.x, e.Position.y - playerEntity.Position.y) > CONFIG.CLEANUP_DISTANCE) {
            EntityManager.removeEntity(e);
        }
    });
    const lasers = EntityManager.getEntitiesWith('Laser');
    lasers.forEach(e => {
        e.Laser.life--;
        e.Renderable.mesh.material.opacity -= 0.15;
        if (e.Laser.life <= 0) EntityManager.removeEntity(e);
    });
    const particles = EntityManager.getEntitiesWith('Particle');
    particles.forEach(e => {
        e.Particle.life--;
        e.Renderable.mesh.material.opacity -= e.Particle.decay;
        if (e.Particle.scaleDecay) e.Renderable.mesh.scale.multiplyScalar(e.Particle.scaleDecay);
        if (e.Particle.rotationSpeed) e.Renderable.mesh.rotation.z += e.Particle.rotationSpeed;
        if (e.Particle.life <= 0 || e.Renderable.mesh.material.opacity <= 0) EntityManager.removeEntity(e);
    });
}

function updateMovementSystem() {
    const movables = EntityManager.getEntitiesWith('Position', 'Velocity', 'Renderable');
    movables.forEach(e => {
        if (!e.Player) { 
            e.Position.x += e.Velocity.x;
            e.Position.y += e.Velocity.y;
        }
        e.Renderable.mesh.position.set(e.Position.x, e.Position.y, 0);
        if (e.Rotation) e.Renderable.mesh.rotation.z = e.Rotation.z;
    });
}

function updateCollisionSystem() {
    grid.clear();
    const collidables = EntityManager.getEntitiesWith('Position', 'Renderable');
    collidables.forEach(e => grid.insert(e));

    const enemies = EntityManager.getEntitiesWith('Enemy');
    const bullets = EntityManager.getEntitiesWith('Bullet');
    
    bullets.forEach(bullet => {
        if (bullet.Bullet.type === 'enemy') return; 
        const nearby = grid.query(bullet.Position.x, bullet.Position.y, 2);
        nearby.forEach(potential => {
            if (potential.Enemy && potential.active) {
                const dist = Math.hypot(potential.Position.x - bullet.Position.x, potential.Position.y - bullet.Position.y);
                if (dist < 1.0) {
                    damageEnemy(potential, bullet.Bullet.damage);
                    if (bullet.Bullet.type !== 'laser') EntityManager.removeEntity(bullet);
                }
            }
        });
    });

    const nearbyPlayer = grid.query(playerEntity.Position.x, playerEntity.Position.y, 2);
    nearbyPlayer.forEach(potential => {
        if (potential.Enemy && potential.active) {
            const dist = Math.hypot(potential.Position.x - playerEntity.Position.x, potential.Position.y - playerEntity.Position.y);
            if (dist < CONFIG.PLAYER_SIZE + 0.9 && potential.Enemy.targetType === 'player') {
                hitPlayer(); createExplosion(potential.Position.x, potential.Position.y, potential.Enemy.color, 10);
                EntityManager.removeEntity(potential);
            }
        } else if (potential.Bullet && potential.Bullet.type === 'enemy' && potential.active) {
            const dist = Math.hypot(potential.Position.x - playerEntity.Position.x, potential.Position.y - playerEntity.Position.y);
            if (dist < CONFIG.PLAYER_SIZE + 0.25) {
                hitPlayer(); EntityManager.removeEntity(potential);
            }
        }
    });

    const nearbyBase = grid.query(0, 0, CONFIG.MOTHERSHIP_SIZE + 2);
    nearbyBase.forEach(potential => {
        if (potential.Enemy && potential.active) {
            const dist = Math.hypot(potential.Position.x, potential.Position.y);
            if (dist < CONFIG.MOTHERSHIP_SIZE) {
                damageMothership(potential.Enemy.type === 'tank' ? 100 : 50);
                createExplosion(potential.Position.x, potential.Position.y, 0xff8800, 15);
                EntityManager.removeEntity(potential);
            }
        } else if (potential.Bullet && potential.Bullet.type === 'enemy' && potential.active) {
            const dist = Math.hypot(potential.Position.x, potential.Position.y);
            if (dist < CONFIG.MOTHERSHIP_SIZE) {
                damageMothership(10);
                createExplosion(potential.Position.x, potential.Position.y, 0xff8800, 5);
                EntityManager.removeEntity(potential);
            }
        }
    });

    const powerups = EntityManager.getEntitiesWith('Powerup', 'Position');
    powerups.forEach(p => {
        p.Powerup.life--;
        
        if (p.Powerup.life < 60) {
            p.Renderable.mesh.visible = Math.floor(p.Powerup.life / 8) % 2 === 0;
        }
        
        if (p.Powerup.life <= 0) {
            createExplosion(p.Position.x, p.Position.y, p.Powerup.color, 5);
            EntityManager.removeEntity(p);
            return;
        }

        p.Renderable.mesh.rotation.z += p.Powerup.rotationSpeed;
        const dx = playerEntity.Position.x - p.Position.x;
        const dy = playerEntity.Position.y - p.Position.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < CONFIG.POWERUP_MAGNET_RANGE && dist > 0.01) {
            const dirX = dx / dist;
            const dirY = dy / dist;
            p.Position.x += dirX * 0.4;
            p.Position.y += dirY * 0.4;
        }
        
        if (dist < CONFIG.PLAYER_SIZE + CONFIG.POWERUP_PICKUP_RANGE) {
            applyPowerup(p.Powerup.type);
            createExplosion(p.Position.x, p.Position.y, p.Powerup.color, 10);
            EntityManager.removeEntity(p);
        }
    });
}

// ============================================

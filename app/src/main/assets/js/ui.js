// UI & GAME FLOW
// ============================================
function checkWeaponUnlocks() {
    Object.keys(WEAPONS).forEach(weaponKey => {
        if (gameState.totalKills >= WEAPONS[weaponKey].unlockKills && !gameState.unlockedWeapons.has(weaponKey)) {
            gameState.unlockedWeapons.add(weaponKey);
            showUnlockNotification(weaponKey); SFX.unlock(); updateWeaponUI();
        }
    });
}
function showUnlockNotification(weapon) {
    const notif = document.getElementById('unlock-notification');
    const names = { pulse: 'PULSE CANNON', spread: 'SPREAD SHOT', laser: 'LASER BEAM', missile: 'HOMING MISSILES' };
    notif.innerHTML = `WEAPON UNLOCKED<br>${names[weapon]}`;
    notif.style.opacity = 1;
    new TWEEN.Tween(notif).to({ opacity: 0 }, 500).delay(2000).start();
}
function selectWeapon(weaponName) {
    if (gameState.unlockedWeapons.has(weaponName)) { gameState.currentWeapon = weaponName; SFX.modeSwitch(); updateWeaponUI(); }
}
function updateWeaponUI() {
    document.querySelectorAll('.weapon-slot').forEach(slot => {
        if (slot.id === 'blink-button') return; 
        const weapon = slot.dataset.weapon;
        if (gameState.unlockedWeapons.has(weapon)) {
            slot.classList.remove('locked');
            if (gameState.currentWeapon === weapon) slot.classList.add('active'); else slot.classList.remove('active');
        } else { slot.classList.add('locked'); slot.classList.remove('active'); }
    });
}
function updateModeVisuals() {
    const modeBtn = document.getElementById('mode-toggle-button');
    const isShoot = gameState.mode === 'shoot' || (gameState.mode === 'auto' && gameState.autoAction === 'shoot');
    
    if (isShoot) {
        playerMesh.material.color.setHex(CONFIG.PLAYER_COLOR_SHOOT); playerGlow.material.color.setHex(CONFIG.PLAYER_COLOR_SHOOT);
        modeRing.material.opacity = 0.8;
    } else {
        playerMesh.material.color.setHex(CONFIG.PLAYER_COLOR_MOVE); playerGlow.material.color.setHex(CONFIG.PLAYER_COLOR_MOVE);
        modeRing.material.opacity = 0;
    }
    
    if (gameState.mode === 'shoot') {
        modeBtn.classList.add('shoot');
        modeBtn.classList.remove('auto');
        modeBtn.innerHTML = 'MODE<br>SHOOT';
    } else if (gameState.mode === 'auto') {
        modeBtn.classList.remove('shoot');
        modeBtn.classList.add('auto');
        modeBtn.innerHTML = 'MODE<br>AUTO';
    } else {
        modeBtn.classList.remove('shoot');
        modeBtn.classList.remove('auto');
        modeBtn.innerHTML = 'MODE<br>MOVE';
    }
}

function updateMothershipUI() {
    const bar = document.getElementById('mothership-health-bar');
    const percent = Math.max(0, (gameState.mothershipHealth / CONFIG.MOTHERSHIP_MAX_HP) * 100);
    
    const currentHeight = parseFloat(bar.style.height) || 100;
    const tweenObj = { h: currentHeight };
    new TWEEN.Tween(tweenObj)
        .to({ h: percent }, 200)
        .onUpdate(() => { bar.style.height = `${tweenObj.h}%`; })
        .start();
        
    if (percent < 30) bar.style.background = '#ff0044'; 
    else if (percent < 60) bar.style.background = '#ffaa00'; 
    else bar.style.background = '#ff8800';
}

function toggleMode() {
    if (gameState.mode === 'auto') gameState.mode = 'move';
    else if (gameState.mode === 'move') gameState.mode = 'shoot';
    else gameState.mode = 'auto';
    SFX.modeSwitch();
    updateModeVisuals();
}

function addHighScore(score) {
    gameState.highScores.push(score); gameState.highScores.sort((a, b) => b - a);
    gameState.highScores = gameState.highScores.slice(0, 5);
    localStorage.setItem('neonNexusHighScores', JSON.stringify(gameState.highScores));
    updateHighScoreUI();
}
function updateHighScoreUI() {
    const topScore = gameState.highScores.length > 0 ? gameState.highScores[0] : 0;
    const list = document.getElementById('hs-list'); let html = '';
    if (gameState.highScores.length > 0) { gameState.highScores.forEach((s, i) => { html += `<div class="hs-row"><span class="hs-rank">${i+1}.</span> <span class="hs-val">${s}</span></div>`; }); }
    else { html = '<div style="text-align:center; color:#aaa;">No scores yet</div>'; }
    if(list) list.innerHTML = html;
}
function updateScore(points) {
    let pointsToAdd = points * gameState.combo;
    if (gameState.multiplierTimer > 0) pointsToAdd *= 2;
    gameState.score += pointsToAdd; gameState.enemiesKilled++;
    gameState.combo = Math.min(gameState.combo + 1, 10); gameState.comboTimer = CONFIG.COMBO_TIMEOUT;
    if (gameState.enemiesKilled % 10 === 0) gameState.difficultyMultiplier += 0.05;
    updateUI();
}
function updateUI() {
    document.getElementById('score').textContent = `◈ ${gameState.score}`;
    document.getElementById('combo').textContent = `x${gameState.combo}`;
    updateHighScoreUI();
}
function hitPlayer() {
    if (gameState.shield) {
        SFX.shieldHit(); gameState.shield = false; playerShieldMesh.visible = false;
        document.getElementById('shield-status').style.display = 'none';
        createExplosion(playerEntity.Position.x, playerEntity.Position.y, 0x00aaff, 20);
        return;
    }
    gameOver(false);
}
function gameOver(isMothershipDead) {
    SFX.playerHit(); 
    gameState.isGameOver = true;
    addHighScore(gameState.score);
    
    const gameOverText = document.getElementById('game-over-text');
    if (isMothershipDead) {
        gameState.isMothershipDead = true;
        gameOverText.textContent = 'MOTHERSHIP DESTROYED';
        createExplosion(0, 0, 0xff8800, 50); 
        mothershipGroup.visible = false;
    } else {
        gameOverText.textContent = 'CORE DESTROYED';
        createExplosion(playerEntity.Position.x, playerEntity.Position.y, playerMesh.material.color.getHex(), 30);
        playerMesh.visible = false; playerGlow.visible = false; playerShieldMesh.visible = false; modeRing.visible = false;
    }
    
    document.getElementById('game-over').classList.add('show');
    gameState.combo = 1; gameState.comboTimer = 0;
}

function updateCombo() {
    if (gameState.comboTimer > 0) { gameState.comboTimer--; if (gameState.comboTimer === 0) { gameState.combo = 1; updateUI(); } }
}

// ============================================

// GAME LOOP
// ============================================
let frameCount = 0;
function animate() {
    requestAnimationFrame(animate);
    TWEEN.update(); 
    
    if (!gameStarted) {
        composer.render();
        return;
    }

    if (!gameState.isGameOver && !gameState.isPaused) {
        frameCount++;
        if (frameCount % Math.max(10, CONFIG.ENEMY_SPAWN_RATE - Math.floor(gameState.difficultyMultiplier * 5)) === 0) {
            if (EntityManager.getEntitiesWith('Enemy').length < CONFIG.MAX_ENEMIES) spawnEnemy();
        }
        
        updatePlayerSystem();
        updateMothershipSystem();
        updateEnemySystem();
        updateBulletSystem();
        updateMovementSystem();
        updateCollisionSystem(); 
        updateLifetimeSystem();
        
        EntityManager.cleanup(); 
        
        updateCombo();
        playerShieldMesh.visible = gameState.shield;
    }
    
    composer.render();
}

// ============================================
// INITIALIZATION SEQUENCE
// ============================================
async function initializeGame() {
    try {
        updateProgress(10, "Checking libraries...");
        if (typeof THREE === 'undefined') throw new Error("Three.js failed to load.");
        if (typeof Tone === 'undefined') throw new Error("Tone.js failed to load.");
        if (typeof TWEEN === 'undefined') throw new Error("Tween.js failed to load.");
        if (typeof THREE.EffectComposer === 'undefined') throw new Error("Three.js PostProcessing failed to load.");

        updateProgress(30, "Initializing Three.js...");
        initThree();

        updateProgress(60, "Creating Assets...");
        initAssets();

        updateProgress(80, "Setting up Input...");
        initInput();

        updateProgress(90, "Loading Game State...");
        const savedTotalKills = localStorage.getItem('neonNexusTotalKills');
        if (savedTotalKills) {
            gameState.totalKills = parseInt(savedTotalKills);
            Object.keys(WEAPONS).forEach(weaponKey => {
                if (gameState.totalKills >= WEAPONS[weaponKey].unlockKills) gameState.unlockedWeapons.add(weaponKey);
            });
        }
        updateModeVisuals(); updateWeaponUI(); updateHighScoreUI(); updateUI(); updateMothershipUI();

        // VK mini-app layer: wire the noads button, then merge cloud progress
        // (rule 2.3.8) into the freshly loaded local state
        if (window.VKSync) VKSync.init();
        updateSoundButtons();

        updateProgress(100, "Ready to launch.");
        setTimeout(() => {
            loadingScreen.style.opacity = 0;
            setTimeout(() => loadingScreen.style.display = 'none', 500);
            startScreen.classList.add('show');
        }, 500);

        animate();
    } catch (error) {
        console.error(error);
        debug("FATAL ERROR: " + error.message);
        debug("Please check your internet connection or disable ad-blockers and refresh.");
    }
}

startButton.addEventListener('click', () => {
    // AudioContext resume can stall on mobile; start the game first and warm up audio in the background.
    gameStarted = true;
    startScreen.classList.remove('show');
    SFX.respawn();
    initAudio();
});

playAgainButton.addEventListener('click', () => {
    location.reload();
});

// ---------------- sound toggle (rule 2.2.5) ----------------
function toggleSound() {
    SFX.setMuted(!SFX.isMuted());
    updateSoundButtons();
}
function updateSoundButtons() {
    const icon = SFX.isMuted() ? '🔇' : '🔊';
    document.querySelectorAll('.sound-toggle').forEach(b => { b.textContent = icon; });
}
document.querySelectorAll('.sound-toggle').forEach(b => b.addEventListener('click', toggleSound));

// ---------------- in-run menu exit (two-tap confirm, like the quiz's ⌂ pill) ----------------
const menuButton = document.getElementById('menu-button');
if (menuButton) {
    let menuArmTimer = null;
    menuButton.addEventListener('click', () => {
        if (menuButton.classList.contains('armed')) { location.reload(); return; }
        menuButton.classList.add('armed');
        menuButton.textContent = 'EXIT?';
        clearTimeout(menuArmTimer);
        menuArmTimer = setTimeout(() => {
            menuButton.classList.remove('armed');
            menuButton.textContent = '⌂ MENU';
        }, 3000);
    });
}

initializeGame();

window.addEventListener('resize', () => {
    aspect = window.innerWidth / window.innerHeight;
    camera.left = -CONFIG.VIEW_SIZE * aspect;
    camera.right = CONFIG.VIEW_SIZE * aspect;
    camera.top = CONFIG.VIEW_SIZE;
    camera.bottom = -CONFIG.VIEW_SIZE;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth, window.innerHeight);
});

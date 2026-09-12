// Regenerate Neon Nexus Play Store screenshots (1920x1080) with headless Chromium.
// Needs `app/src/main/assets` served at SCREENSHOT_URL (default http://127.0.0.1:8765).
// Run: python3 -m http.server 8765 --directory app/src/main/assets &  then  node scripts/generate-screenshots.js
const path = require('path');
const fs = require('fs');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  // local machine: playwright lives in the sandbox checkout
  ({ chromium } = require('/home/mike/sandbox/node_modules/playwright'));
}

const OUT = process.env.SHOT_OUT || path.resolve(__dirname, '..', 'store-assets', 'screenshots');
const URL = process.env.SCREENSHOT_URL || 'http://127.0.0.1:8765/index.html';
const W = parseInt(process.env.SHOT_W || '1920', 10);
const H = parseInt(process.env.SHOT_H || '1080', 10);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  // Seed a believable high-score table for the game-over shot
  await ctx.addInitScript(() => {
    localStorage.setItem('neonNexusHighScores', JSON.stringify([12345, 10415, 10290, 7415, 7155]));
    localStorage.setItem('neonNexusTotalKills', '0');
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#start-screen.show', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // 01 — start screen
  await page.screenshot({ path: path.join(OUT, '01_start_screen.png'), clip: { x: 0, y: 0, width: W, height: H } });
  console.log('01 ok');

  // helpers for staging the world
  const stage = (fn) => page.evaluate(fn);

  // 02 — early gameplay: a few enemies approaching, player cruising toward mothership
  await page.click('#start-button');
  await page.waitForTimeout(2000);
  await stage(() => {
    const px = playerEntity.Position.x, py = playerEntity.Position.y;
    spawnSpecificEnemy('chaser', px + 8, py + 2, null);
    spawnSpecificEnemy('zigzag', px + 5, py + 6, null);
    spawnSpecificEnemy('swarm', px + 9, py - 3, null);
    spawnSpecificEnemy('swarm', px + 7, py - 6, null);
    gameState.score = 850; updateUI();
    gameState.mothershipHealth = CONFIG.MOTHERSHIP_MAX_HP * 0.96; updateMothershipUI();
  });
  // drive toward the enemies with a real drag
  await page.mouse.move(1550, 620);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) { await page.mouse.move(1550 + i * 12, 620 + i * 6); await page.waitForTimeout(40); }
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, '02_gameplay_early.png'), clip: { x: 0, y: 0, width: W, height: H } });
  console.log('02 ok');

  // 03 — combat: lasers and pulse fire, explosions mid-action
  await stage(() => {
    ['laser', 'spread', 'missile'].forEach(w => gameState.unlockedWeapons.add(w));
    selectWeapon('laser');
    const px = playerEntity.Position.x, py = playerEntity.Position.y;
    spawnSpecificEnemy('chaser', px + 6, py - 2, null);
    spawnSpecificEnemy('chaser', px + 8, py + 4, null);
    spawnSpecificEnemy('splitter', px + 4, py + 7, null);
    spawnSpecificEnemy('orbiter', px - 6, py + 5, null);
    gameState.multiplierTimer = 250; document.getElementById('multiplier-status').style.display = 'block'; setPowerupTimer('multiplier-status', 0.8);
    gameState.score = 2450; updateUI();
  });
  // aim right of the ship and fire the laser along the pack
  await page.mouse.move(1500, 540);
  await page.mouse.down();
  await page.mouse.move(1620, 560);
  await page.waitForTimeout(120);
  await stage(() => { fireWeapon(); });
  await page.waitForTimeout(60);
  await stage(() => {
    const px = playerEntity.Position.x, py = playerEntity.Position.y;
    createExplosion(px + 7, py - 1, 0xff0044, 12);
    createExplosion(px + 5, py + 5, 0xffee00, 10);
  });
  await page.screenshot({ path: path.join(OUT, '03_combat.png'), clip: { x: 0, y: 0, width: W, height: H } });
  console.log('03 ok');

  // 04 — late combat: heavy wave, turret online, bullets and blasts everywhere
  await page.mouse.up();
  await stage(() => {
    selectWeapon('missile');
    const px = playerEntity.Position.x, py = playerEntity.Position.y;
    const types = ['chaser', 'zigzag', 'shooter', 'splitter', 'orbiter', 'bomber', 'tank'];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const t = types[i % types.length];
      spawnSpecificEnemy(t, px + Math.cos(a) * (7 + (i % 4) * 2), py + Math.sin(a) * (6 + (i % 3) * 2), null);
    }
    if (turrets.length < CONFIG.MAX_TURRETS) addTurret();
    gameState.overdriveTimer = 120; document.getElementById('overdrive-status').style.display = 'block'; setPowerupTimer('overdrive-status', 0.66);
    gameState.score = 6780; updateUI();
    gameState.mothershipHealth = CONFIG.MOTHERSHIP_MAX_HP * 0.62; updateMothershipUI();
  });
  // spread fire into the wave
  await page.mouse.move(1650, 520);
  await page.mouse.down();
  await stage(() => { playerEntity.Player.fireCooldown = 0; fireWeapon(); });
  await page.waitForTimeout(150);
  await stage(() => {
    playerEntity.Player.fireCooldown = 0; fireWeapon();
    const px = playerEntity.Position.x, py = playerEntity.Position.y;
    createExplosion(px + 8, py + 2, 0xff8800, 14);
    createExplosion(px - 7, py - 4, 0x00ffff, 12);
    spawnWorldCombo(px + 6, py + 3, 4);
    spawnWorldCombo(px - 5, py + 6, 3);
  });
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(OUT, '04_combat_late.png'), clip: { x: 0, y: 0, width: W, height: H } });
  console.log('04 ok');

  // 05 — game over
  await stage(() => {
    gameState.mothershipHealth = 1;
    damageMothership(5);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, '05_game_over.png'), clip: { x: 0, y: 0, width: W, height: H } });
  console.log('05 ok');

  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });

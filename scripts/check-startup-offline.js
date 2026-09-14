// Startup regression guard: loads the game over file:// exactly like the Android
// WebView does, then asserts the page makes ZERO external (http/https) requests
// and reaches the start screen quickly. Guards the v1.0.1 cold-start fix: a
// render-blocking Google Fonts link once black-screened the app for 30s+ on
// RKN-affected networks — this fails if anything like that creeps back in.
//
// Run: node scripts/check-startup-offline.js  (uses local playwright, or the
// sandbox checkout copy, mirroring scripts/generate-screenshots.js)
const path = require('path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/home/mike/sandbox/node_modules/playwright'));
}

const ASSETS = path.resolve(__dirname, '..', 'app', 'src', 'main', 'assets');
const URL = process.env.STARTUP_CHECK_URL || 'file://' + ASSETS + '/index.html';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const external = [];
  page.on('request', r => { if (/^https?:/.test(r.url())) external.push(r.url()); });

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'commit', timeout: 8000 });
  await page.waitForSelector('#start-screen.show', { timeout: 20000 });
  const readyMs = Date.now() - t0;

  // Fonts: force-load both bundled faces and verify they resolve — VT323 is only
  // a fallback in the font stack, so it loads lazily unless explicitly requested.
  const fonts = await page.evaluate(async () => {
    await document.fonts.load('16px "Share Tech Mono"');
    await document.fonts.load('16px "VT323"');
    await document.fonts.ready;
    return {
      shareTechMono: [...document.fonts].some(f => f.family === 'Share Tech Mono' && f.status === 'loaded'),
      vt323: [...document.fonts].some(f => f.family === 'VT323' && f.status === 'loaded'),
    };
  });
  await browser.close();

  console.log(JSON.stringify({ url: URL, readyMs, externalRequests: external, fonts }, null, 1));
  if (external.length) {
    console.error(`FAIL: ${external.length} external request(s) at startup — will hang on RKN-affected networks`);
    process.exit(1);
  }
  if (!fonts.shareTechMono || !fonts.vt323) {
    console.error('FAIL: bundled fonts did not load');
    process.exit(1);
  }
  console.log(`OK: offline startup, ready in ${readyMs}ms`);
})().catch(e => { console.error(e); process.exit(1); });

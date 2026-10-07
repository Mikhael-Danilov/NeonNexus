// VK MINI-APP LAYER
// ============================================
// Everything here is gated on the vk_app_id launch param and no-ops on the
// plain web / VK Play builds of the same static site:
//   - VKWebAppInit on launch (platform spinner never clears without it)
//   - progress sync via VKWebAppStorage, merged by maximum on every load
//     (catalog rule 2.3.8 — progress must follow the user across platforms)
//   - interstitial ad after every finished game (VKWebAppShowNativeAds)
//   - "disable ads" votes purchase (VKWebAppShowOrderBox, good `noads`),
//     granted by the backend order callback, reconciled via /api/vk/entitled
// Server side: backend/app.py + deploy/VK-MINIAPP-CATALOG.md.

// var, not const: callers guard with `window.VKSync`, and only a top-level
// var becomes a window property
var VKSync = (function () {
    const inVk = /vk_app_id/.test(location.search);
    const bridge = (inVk && window.vkBridge) ? window.vkBridge : null;
    const API = 'api/';                       // same-origin entitlement service
    // VK storage keys (≤25 chars); values ≤2048 chars
    const KEY_SCORES = 'nn-scores', KEY_KILLS = 'nn-kills',
          KEY_NOADS = 'nn-noads', KEY_SOUND = 'nn-sound';

    let noads = false;
    try { noads = localStorage.getItem('neonNexusNoAds') === '1'; } catch (e) {}
    let pushTimer = null;

    function send(method, params) {
        if (!bridge || !bridge.send) return Promise.reject(new Error('not in vk'));
        return bridge.send(method, params || {});
    }

    // tell the platform we're up so its spinner clears
    if (inVk && bridge && bridge.send) {
        try { bridge.send('VKWebAppInit').catch(function () {}); } catch (e) {}
    }

    // ---------------- progress sync (rule 2.3.8) ----------------

    function storageValues(keys) {
        return send('VKWebAppStorageGet', { keys: keys }).then(function (res) {
            const out = {};
            (res && res.keys || []).forEach(function (kv) {
                if (kv && kv.key) out[kv.key] = kv.value;
            });
            return out;
        });
    }

    function unlockWeaponsFromKills() {
        Object.keys(WEAPONS).forEach(function (weaponKey) {
            if (gameState.totalKills >= WEAPONS[weaponKey].unlockKills) gameState.unlockedWeapons.add(weaponKey);
        });
    }

    function writeBack(scores, kills) {
        // write the merged state back so another device starts from the max
        storageSet(KEY_SCORES, JSON.stringify(scores));
        storageSet(KEY_KILLS, String(kills));
    }

    function storageSet(key, value) {
        send('VKWebAppStorageSet', { key: key, value: String(value) }).catch(function () {});
    }

    // debounced push from in-game save points (kills tick every 10 kills)
    function pushSoon() {
        if (!inVk) return;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(pushNow, 3000);
    }

    function pushNow() {
        if (!inVk) return;
        clearTimeout(pushTimer);
        let scores = [];
        try { scores = JSON.parse(localStorage.getItem('neonNexusHighScores')) || gameState.highScores; } catch (e) { scores = gameState.highScores; }
        writeBack(scores, gameState.totalKills);
        const sound = localStorage.getItem('neonNexusSound');
        if (sound !== null) storageSet(KEY_SOUND, sound);
        if (noads) storageSet(KEY_NOADS, '1');
    }

    function syncFromCloud() {
        if (!inVk) return;
        storageValues([KEY_SCORES, KEY_KILLS, KEY_NOADS, KEY_SOUND]).then(function (cloud) {
            let changed = false;
            let scores = null, kills = gameState.totalKills;
            try { scores = JSON.parse(cloud[KEY_SCORES]); } catch (e) {}
            if (Array.isArray(scores)) {
                gameState.highScores = gameState.highScores.concat(scores)
                    .sort(function (a, b) { return b - a; }).slice(0, 5);
                localStorage.setItem('neonNexusHighScores', JSON.stringify(gameState.highScores));
                changed = true;
            }
            const cloudKills = parseInt(cloud[KEY_KILLS], 10);
            if (cloudKills > kills) {
                kills = cloudKills;
                gameState.totalKills = kills;
                localStorage.setItem('neonNexusTotalKills', String(kills));
                unlockWeaponsFromKills();
                changed = true;
            }
            if (cloud[KEY_NOADS] === '1') setNoAds(true, false);
            if (cloud[KEY_SOUND] === '0' || cloud[KEY_SOUND] === '1') {
                if (localStorage.getItem('neonNexusSound') === null) {
                    localStorage.setItem('neonNexusSound', cloud[KEY_SOUND]);
                    if (typeof SFX !== 'undefined') SFX.setMuted(cloud[KEY_SOUND] === '1', true);
                    if (window.updateSoundButtons) updateSoundButtons();
                }
            }
            writeBack(gameState.highScores, kills);
            if (changed) { updateHighScoreUI(); updateWeaponUI(); }
        }).catch(function () {});
    }

    // ---------------- interstitial ads (VK only) ----------------

    function maybeInterstitial() {
        if (!inVk || noads) return;
        // an interstitial after every finished game; no-fill before catalog
        // approval is expected and silent (VK may frequency-cap on its side)
        setTimeout(function () {
            send('VKWebAppShowNativeAds', { ad_format: 'interstitial' }).catch(function () {});
        }, 800);
    }

    // ---------------- noads purchase (votes IAP) ----------------

    function setNoAds(value, persist) {
        noads = value;
        try { localStorage.setItem('neonNexusNoAds', value ? '1' : '0'); } catch (e) {}
        if (value && persist !== false && inVk) storageSet(KEY_NOADS, '1');
        updateNoAdsUi();
    }

    function reconcileEntitlement() {
        // best-effort check that the backend recorded the grant; a lagging
        // order callback simply means this reports noads a moment later
        try {
            fetch(API + 'vk/entitled', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lp: location.search.slice(1) })
            }).then(function (r) { return r.ok ? r.json() : null; })
              .then(function (d) { if (d && d.noads) setNoAds(true); })
              .catch(function () {});
        } catch (e) {}
    }

    function buyNoAds() {
        if (!inVk) return Promise.reject(new Error('not in vk'));
        return send('VKWebAppShowOrderBox', { type: 'item', item: 'noads' }).then(function (r) {
            if (r && r.success === false) throw new Error('canceled');
            // the box only closes on success after VK accepted the payment;
            // the server grant lands via the order callback — set locally now,
            // confirm against the backend for good measure
            setNoAds(true);
            reconcileEntitlement();
            return true;
        });
    }

    // ---------------- noads button UI ----------------

    function updateNoAdsUi() {
        const btn = document.getElementById('noads-button');
        if (!btn) return;
        btn.style.display = (inVk && !noads) ? '' : 'none';
    }

    function wireNoAdsButton() {
        const btn = document.getElementById('noads-button');
        if (!btn) return;
        btn.addEventListener('click', function () {
            if (btn.disabled) return;
            btn.disabled = true;
            const label = btn.textContent;
            btn.textContent = '...';
            buyNoAds().then(function () {
                updateNoAdsUi();
            }).catch(function () {
                btn.textContent = label;
            }).finally(function () {
                btn.disabled = false;
            });
        });
        updateNoAdsUi();
    }

    // called from main.js initializeGame — game state is loaded by then
    function init() {
        wireNoAdsButton();
        syncFromCloud();
    }

    return {
        init: init,
        pushSoon: pushSoon,
        pushNow: pushNow,
        maybeInterstitial: maybeInterstitial,
        setNoAds: setNoAds,
        isNoAds: function () { return noads; },
        inVk: function () { return inVk; }
    };
})();

// ============================================

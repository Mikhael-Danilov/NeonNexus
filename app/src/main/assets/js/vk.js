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
//   - RU localization: T() for strings set from JS, applyRuUi() swaps the
//     static index.html text once at load (see NNRU below)
// Server side: backend/app.py + deploy/VK-MINIAPP-CATALOG.md.

// var, not const: callers guard with `window.VKSync`, and only a top-level
// var becomes a window property
var NN_IN_VK = /vk_app_id/.test(location.search);

// ---------------- RU localization (VK flavor only) ----------------
// The VK audience is Russian; every user-facing string goes through this
// table (dynamic strings via T(), static index.html text via applyRuUi).
// Outside VK T() is the identity, so the EN web / VK Play builds are
// untouched.
var NNRU = {
    // loading screen / init errors
    'INITIALIZING NEON NEXUS...': 'ИНИЦИАЛИЗАЦИЯ NEON NEXUS...',
    'Checking libraries...': 'Проверка библиотек...',
    'Initializing Three.js...': 'Инициализация Three.js...',
    'Creating Assets...': 'Создание ресурсов...',
    'Setting up Input...': 'Настройка управления...',
    'Loading Game State...': 'Загрузка прогресса...',
    'Ready to launch.': 'Готов к запуску.',
    'Three.js failed to load.': 'Не загрузился Three.js.',
    'Tone.js failed to load.': 'Не загрузился Tone.js.',
    'Tween.js failed to load.': 'Не загрузился Tween.js.',
    'Three.js PostProcessing failed to load.': 'Не загрузилась постобработка Three.js.',
    'FATAL ERROR: ': 'КРИТИЧЕСКАЯ ОШИБКА: ',
    'Please check your internet connection or disable ad-blockers and refresh.':
        'Проверьте подключение к интернету или отключите блокировщик рекламы и обновите страницу.',
    // start screen
    'START GAME': 'НАЧАТЬ ИГРУ',
    '✕ DISABLE ADS': '✕ ОТКЛЮЧИТЬ РЕКЛАМУ',
    'NEON NEXUS<br>DEFEND THE MOTHERSHIP': 'NEON NEXUS<br>ЗАЩИТИ ФЛАГМАН',
    // in-game HUD
    '⌂ MENU': '⌂ МЕНЮ',
    'EXIT?': 'ВЫЙТИ?',
    'MODE<br>AUTO': 'РЕЖИМ<br>АВТО',
    'MODE<br>MOVE': 'РЕЖИМ<br>ДВИЖЕНИЕ',
    'MODE<br>SHOOT': 'РЕЖИМ<br>ОГОНЬ',
    'SHIELD': 'ЩИТ',
    'OVERDRIVE': 'ОВЕРДРАЙВ',
    // game over
    'CORE DESTROYED': 'ЯДРО УНИЧТОЖЕНО',
    'MOTHERSHIP DESTROYED': 'ФЛАГМАН УНИЧТОЖЕН',
    'TOP RUNS': 'РЕКОРДЫ',
    'PLAY AGAIN': 'ИГРАТЬ СНОВА',
    'No scores yet': 'Пока нет рекордов',
    // unlock toast
    'WEAPON UNLOCKED': 'ОРУЖИЕ ОТКРЫТО',
    'PULSE CANNON': 'ПУЛЬС-ПУШКА',
    'SPREAD SHOT': 'ВЕЕРНЫЙ ЗАЛП',
    'LASER BEAM': 'ЛАЗЕРНЫЙ ЛУЧ',
    'HOMING MISSILES': 'САМОНАВОДЯЩИЕСЯ РАКЕТЫ',
};

function T(s) { return (NN_IN_VK && NNRU[s]) || s; }

// static index.html text: one swap at script load — this file is loaded at
// the end of <body> before ui/main, so the elements already exist and any
// later JS-set text goes through T()
(function applyRuUi() {
    if (!NN_IN_VK) return;
    document.documentElement.lang = 'ru';
    document.title = 'Neon Nexus — Защитник Флагмана';

    const markup = {
        // values that include tags must go through innerHTML
        'start-title': T('NEON NEXUS<br>DEFEND THE MOTHERSHIP'),
        'noads-button': T('✕ DISABLE ADS'),
        'mode-toggle-button': T('MODE<br>AUTO'),
        'multiplier-status': 'ОЧКИ x2<div class="powerup-timer"></div>',
        'overdrive-status': T('OVERDRIVE') + '<div class="powerup-timer"></div>',
    };
    const plain = {
        'loading-text': T('INITIALIZING NEON NEXUS...'),
        'start-button': T('START GAME'),
        'menu-button': T('⌂ MENU'),
        'shield-status': T('SHIELD'),
        'game-over-text': T('CORE DESTROYED'),
        'play-again-button': T('PLAY AGAIN'),
    };
    Object.keys(markup).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = markup[id];
    });
    Object.keys(plain).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.textContent = plain[id];
    });

    // vertical MOTHERSHIP label -> ФЛАГМАН
    const msLabel = document.getElementById('mothership-label');
    if (msLabel) msLabel.innerHTML = '<span>Ф</span><span>Л</span><span>А</span><span>Г</span><span>М</span><span>А</span><span>Н</span>';
    const hsTitle = document.querySelector('#highscore-table h3');
    if (hsTitle) hsTitle.textContent = T('TOP RUNS');

    // control hints, applied row by row ([tag, description])
    const hints = [
        ['ТАП / ВЕДИ', 'АВТО-ДВИЖЕНИЕ ИЛИ ОГОНЬ'],
        ['КНОПКА РЕЖИМА', 'АВТО / ДВИЖЕНИЕ / ОГОНЬ'],
        ['ЩИПОК', 'МАСШТАБ КАМЕРЫ'],
        ['СЛОТ 5', 'ВАРП-БЛИНК'],
    ];
    document.querySelectorAll('#start-instructions .inst-row').forEach(function (row, i) {
        if (!hints[i] || row.children.length < 2) return;
        row.children[0].textContent = hints[i][0];
        row.children[1].textContent = hints[i][1];
    });

    // enemy / powerup legend (colors kept from the EN original)
    const legend = document.getElementById('enemy-legend');
    if (legend) legend.innerHTML =
        '<div style="color:#ff0044">► Преследователь</div><div style="color:#ff8800">► Зигзаг</div><div style="color:#aa00ff">► Стрелок</div>' +
        '<div style="color:#00ff44">► Танк (6 хп)</div><div style="color:#ffee00">► Сплиттер</div><div style="color:#ff00ff">► Роевик</div>' +
        '<div style="color:#00aaff">► Орбитер</div><div style="color:#ff6600">► Бомбер (взрывается!)</div>' +
        '<hr style="margin: 8px 0; border-color: #333;">' +
        '<div style="color:#ff0044">● Красный глаз = охотится на тебя</div>' +
        '<div style="color:#ff8800">● Оранжевый глаз = атакует базу</div>' +
        '<hr style="margin: 8px 0; border-color: #333;">' +
        '<div style="color:#00aaff">⬢ Щит</div><div style="color:#ffaa00">◆ Очки x2</div><div style="color:#00ffff">▲ Овердрайв</div>' +
        '<div style="color:#ff0044">■ Нюк</div><div style="color:#88ff00">+ Турель</div>';
})();

var VKSync = (function () {
    const inVk = NN_IN_VK;
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

    // inside OK the launcher adds vk_ok_user_id (the OK-native uid) to the
    // launch params; OK's payment callbacks carry that uid, so register the
    // ok_uid -> vk_user_id mapping the backend needs to grant the right
    // player (launch params are HMAC-verified server side)
    function mapOkUser() {
        try {
            const p = new URLSearchParams(location.search);
            if (p.get('vk_client') !== 'ok' || !p.get('vk_ok_user_id')) return;
            fetch(API + 'ok/map', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lp: location.search.slice(1) })
            }).catch(function () {});
        } catch (e) {}
    }

    // ---------------- global leaderboard (best single game) ----------------
    // VK records points only server-side (secure.addAppEvent, cumulative) —
    // POST each finished game's score; the backend keeps the per-user best
    // and submits only the delta, so the board value = best single game.

    function submitScore(gameScore) {
        if (!inVk) return;
        try {
            fetch(API + 'vk/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    score: Math.floor(gameScore) || 0,
                    lp: location.search.slice(1)
                })
            }).catch(function () {});
        } catch (e) {}
    }

    // ---------------- game-over actions (VK only) ----------------

    function appLink() {
        const p = new URLSearchParams(location.search);
        return 'https://vk.com/app' + (p.get('vk_app_id') || '');
    }

    function wireGameOverButtons() {
        const lb = document.getElementById('lb-button');
        const share = document.getElementById('share-button');
        const row = document.getElementById('go-actions');
        if (!lb || !share || !row || !inVk) return;
        row.style.display = 'flex';
        lb.style.display = 'block';
        share.style.display = 'block';
        lb.textContent = '🏆 РЕЙТИНГ';
        share.textContent = '↗ ПОДЕЛИТЬСЯ';
        lb.addEventListener('click', function () {
            if (lb.disabled) return;
            lb.disabled = true;
            // user_result is display-only (the box never saves the value) —
            // the recorded best arrives via the server-side score push
            send('VKWebAppShowLeaderBoardBox', {
                user_result: Math.max(0, gameState.highScores[0] || 0),
                global: 1
            }).catch(function () {}).finally(function () { lb.disabled = false; });
        });
        share.addEventListener('click', function () {
            if (share.disabled) return;
            share.disabled = true;
            const best = Math.max(0, gameState.highScores[0] || 0);
            send('VKWebAppShare', {
                text: 'Мой лучший бой в Neon Nexus: ' + best + ' очков. Побей мой рекорд!',
                link: appLink()
            }).catch(function () {}).finally(function () { share.disabled = false; });
        });
    }

    // called from main.js initializeGame — game state is loaded by then
    function init() {
        wireNoAdsButton();
        wireGameOverButtons();
        mapOkUser();
        syncFromCloud();
    }

    return {
        init: init,
        pushSoon: pushSoon,
        pushNow: pushNow,
        maybeInterstitial: maybeInterstitial,
        setNoAds: setNoAds,
        submitScore: submitScore,
        isNoAds: function () { return noads; },
        inVk: function () { return inVk; }
    };
})();

// ============================================

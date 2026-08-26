// AUDIO ENGINE (SFX Only)
// ============================================
let audioInitialized = false;
let sfxSquare, sfxSaw, sfxTri, sfxSine, sfxNoise, sfxNoiseHat;

async function initAudio() {
    if (audioInitialized || typeof Tone === 'undefined') return;
    try {
        await Tone.start();
        sfxSquare = new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }, volume: -12 }).toDestination();
        sfxSaw = new Tone.Synth({ oscillator: { type: "sawtooth" }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }, volume: -12 }).toDestination();
        sfxTri = new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }, volume: -12 }).toDestination();
        sfxSine = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }, volume: -12 }).toDestination();
        sfxNoise = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 }, volume: -10 });
        const noiseFilter = new Tone.Filter(800, "lowpass").toDestination(); sfxNoise.connect(noiseFilter);
        sfxNoiseHat = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 }, volume: -15 });
        const sfxHatFilter = new Tone.Filter(7000, "highpass").toDestination(); sfxNoiseHat.connect(sfxHatFilter);
        audioInitialized = true;
    } catch (e) {
        console.warn("Audio init failed:", e);
    }
}

const SFX = {
    pulse: () => { if (!audioInitialized || !sfxSquare) return; try { sfxSquare.triggerAttackRelease(880, "32n"); } catch(e){} },
    spread: () => { if (!audioInitialized || !sfxSquare) return; try { sfxSquare.triggerAttackRelease(660, "32n"); setTimeout(() => sfxSquare && sfxSquare.triggerAttackRelease(550, "32n"), 30); setTimeout(() => sfxSquare && sfxSquare.triggerAttackRelease(440, "32n"), 60); } catch(e){} },
    laser: () => { if (!audioInitialized || !sfxSaw) return; try { sfxSaw.triggerAttackRelease(440, "32n"); } catch(e){} },
    missile: () => { if (!audioInitialized || !sfxTri) return; try { sfxTri.triggerAttackRelease(220, "32n"); } catch(e){} },
    hit: () => { if (!audioInitialized || !sfxSquare) return; try { sfxSquare.triggerAttackRelease(1500, "64n"); } catch(e){} },
    death: () => { if (!audioInitialized || !sfxSquare || !sfxNoise) return; try { sfxSquare.triggerAttackRelease(440, "16n"); sfxNoise.triggerAttackRelease("16n"); } catch(e){} },
    playerHit: () => { if (!audioInitialized || !sfxSaw || !sfxNoise) return; try { sfxSaw.triggerAttackRelease(220, "4n"); sfxNoise.triggerAttackRelease("4n"); } catch(e){} },
    shieldHit: () => { if (!audioInitialized || !sfxSine || !sfxNoiseHat) return; try { sfxSine.triggerAttackRelease(800, "32n"); sfxNoiseHat.triggerAttackRelease("32n"); } catch(e){} },
    baseHit: () => { if (!audioInitialized || !sfxSaw || !sfxNoise) return; try { sfxSaw.triggerAttackRelease(110, "16n"); sfxNoise.triggerAttackRelease("16n"); } catch(e){} },
    turretFire: () => { if (!audioInitialized || !sfxTri) return; try { sfxTri.triggerAttackRelease(330, "64n"); } catch(e){} },
    powerup: () => { if (!audioInitialized || !sfxSquare) return; try { sfxSquare.triggerAttackRelease(523.25, "32n"); setTimeout(() => sfxSquare && sfxSquare.triggerAttackRelease(659.25, "32n"), 80); setTimeout(() => sfxSquare && sfxSquare.triggerAttackRelease(783.99, "32n"), 160); } catch(e){} },
    modeSwitch: () => { if (!audioInitialized || !sfxSquare) return; try { sfxSquare.triggerAttackRelease(800, "64n"); setTimeout(() => sfxSquare && sfxSquare.triggerAttackRelease(1000, "64n"), 30); } catch(e){} },
    unlock: () => { if (!audioInitialized || !sfxSquare) return; try { sfxSquare.triggerAttackRelease(523.25, "16n"); setTimeout(() => sfxSquare && sfxSquare.triggerAttackRelease(659.25, "16n"), 80); setTimeout(() => sfxSquare && sfxSquare.triggerAttackRelease(783.99, "16n"), 160); setTimeout(() => sfxSquare && sfxSquare.triggerAttackRelease(1046.50, "16n"), 240); } catch(e){} },
    respawn: () => { if (!audioInitialized || !sfxSine) return; try { sfxSine.triggerAttackRelease(440, "16n"); setTimeout(() => sfxSine && sfxSine.triggerAttackRelease(660, "16n"), 100); } catch(e){} },
    blink: () => { if (!audioInitialized || !sfxSine) return; try { sfxSine.triggerAttackRelease(1200, "32n"); setTimeout(() => sfxSine && sfxSine.triggerAttackRelease(800, "32n"), 40); } catch(e){} }
};

// ============================================

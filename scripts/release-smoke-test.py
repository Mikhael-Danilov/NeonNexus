#!/usr/bin/env python3
"""Cold-start smoke test for a published (or local) Neon Nexus release AAB.

Verifies the Android cold-start path of an actual release artifact on a
connected device/emulator: installs it, launches it, and reports the
WebViewConsole timeline (time to first game script, time to "Ready to
launch") plus keyframe screenshots.

Why: v1.0.0 had a render-blocking Google Fonts link that hung 30s+ on
RKN-affected networks (black screen on launch). Anything that re-introduces
an external startup dependency will show up here as a huge first-script time.

Typical use — test what Play actually received:
  gh run download <RUN_ID> -n app-release-1.0.1 -D /tmp/aab     # from the Play Publish run
  python3 scripts/release-smoke-test.py /tmp/aab/app-release.aab --label 1.0.1

To simulate RKN conditions (Google endpoints hanging, not failing), start the
emulator with a blackholed DNS first:
  emulator -avd <AVD> -no-window -no-snapshot -dns-server 192.0.2.1
Note fonts.googleapis.com is NOT reliably blocked from this network — a plain
run may pass even for a broken build; force the hang for a meaningful test.

Requires: adb device connected, bundletool (downloaded automatically),
JDK, the upload keystore at repo root (password in gitignored
keystore-credentials.txt). Stdlib-only.
"""
import argparse, re, subprocess, sys, threading, time, os, json

ADB = os.environ.get("ADB", "adb")
PKG = "com.nyrds.neonnexus"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLETOOL = os.environ.get("BUNDLETOOL_JAR", "/tmp/bundletool-all.jar")
BUNDLETOOL_URL = "https://github.com/google/bundletool/releases/download/1.17.1/bundletool-all-1.17.1.jar"


def sh(*args, **kw):
    return subprocess.run(list(args), capture_output=True, text=True, timeout=20, **kw)


def ensure_bundletool():
    if os.path.exists(BUNDLETOOL):
        return
    print(f"downloading bundletool -> {BUNDLETOOL}")
    subprocess.run(["curl", "-sSL", "-o", BUNDLETOOL, BUNDLETOOL_URL], check=True, timeout=120)


def keystore_args():
    """Parse the gitignored keystore-credentials.txt: 'store+key password: XXX'."""
    txt = open(os.path.join(REPO, "keystore-credentials.txt")).read()
    pw = re.search(r"store\+key password:\s*(\S+)", txt).group(1)
    ks = os.path.join(REPO, "my-upload-key.jks")
    return ["--ks", ks, "--ks-key-alias", "upload",
            "--ks-pass", f"pass:{pw}", "--key-pass", f"pass:{pw}"]


def install(aab):
    ensure_bundletool()
    apks = f"/tmp/smoke-{os.path.basename(aab)}.apks"
    r = subprocess.run(["java", "-jar", BUNDLETOOL, "build-apks", "--bundle", aab,
                        "--output", apks, "--overwrite"] + keystore_args(),
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-500:]
    sh(ADB, "shell", "am", "force-stop", PKG)
    sh(ADB, "shell", "pm", "uninstall", PKG)  # uninstall, not clear: avoids downgrade refusal and stale cache
    r = subprocess.run(["java", "-jar", BUNDLETOOL, "install-apks", "--apks", apks],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-500:]


def screen_px():
    out = sh(ADB, "shell", "wm", "size").stdout
    m = re.search(r"(\d+)x(\d+)", out)
    return int(m.group(1)), int(m.group(2))


def measure(max_wait, shots, outdir):
    """Cold-start, collect WebViewConsole timeline + keyframe screenshots."""
    t0 = time.time()
    events = []
    stop = threading.Event()

    def collector():
        p = subprocess.Popen([ADB, "logcat", "-T", "1", "-s", "WebViewConsole:*"],
                             stdout=subprocess.PIPE, text=True, errors="replace")
        for line in p.stdout:
            m = re.search(r"(Tone\.js v|Checking libraries|Ready to launch|FATAL)", line)
            if m and not stop.is_set():
                events.append((round(time.time() - t0, 1), m.group(1)))
        p.kill()

    threading.Thread(target=collector, daemon=True).start()
    sh(ADB, "logcat", "-c")
    sh(ADB, "shell", "am", "start", "-n", f"{PKG}/.MainActivity")

    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):  # clear stale keyframes from previous runs
        if f.endswith(".png"):
            os.unlink(os.path.join(outdir, f))
    w, h = screen_px()
    label_iter = iter(shots)
    next_shot = next(label_iter, None)
    while time.time() - t0 < max_wait:
        el = time.time() - t0
        if next_shot is not None and el >= next_shot:
            # Best-effort dismissal of an emulator SystemUI ANR dialog ("Wait" button)
            sh(ADB, "shell", "input", "tap", str(int(w * 0.33)), str(int(h * 0.62)))
            time.sleep(0.7)
            try:
                subprocess.run([ADB, "exec-out", "screencap", "-p"], timeout=25,
                               stdout=open(f"{outdir}/t{next_shot:02d}.png", "wb"))
            except subprocess.TimeoutExpired:
                pass  # screencap can stall on a wedged emulator; skip the frame
            next_shot = next(label_iter, None)
        if any(e[1] == "Ready to launch" for e in events) and next_shot is None:
            break
        time.sleep(0.3)
    stop.set()
    return events


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("aab", help="path to the release .aab to install")
    ap.add_argument("--label", default="test", help="label used for output files")
    ap.add_argument("--max-wait", type=int, default=120,
                    help="seconds to wait for 'Ready to launch' (use >=150 when DNS is blackholed)")
    ap.add_argument("--shots", default="5,15,30",
                    help="comma list of second-marks for keyframe screenshots")
    ap.add_argument("--outdir", default="/tmp/nn-smoke")
    args = ap.parse_args()

    install(args.aab)
    events = measure(args.max_wait, [int(s) for s in args.shots.split(",")], args.outdir)
    result = {"aab": args.aab, "label": args.label,
              "console_timeline_s": events,
              "screenshots": sorted(os.listdir(args.outdir))}
    print(json.dumps(result, indent=1))
    first = next((e for e in events if e[1] != "Ready to launch"), None)
    ready = next((e for e in events if e[1] == "Ready to launch"), None)
    # Absolute times vary a lot on a software emulator (cold WebView provider, GMS
    # chatter): same artifact measured 3.6s warm and 10.3s cold-boot. A hang shows
    # up as 20s+ (DNS-level) to 60s+ (TCP-level), so threshold at 20s.
    if not ready or (first and first[0] > 20):
        print("SUSPICIOUS: startup is slow — check for new render-blocking/external deps", file=sys.stderr)
        sys.exit(1)
    print(f"OK: first script {first[0] if first else '?'}s, ready {ready[0]}s")


if __name__ == "__main__":
    main()

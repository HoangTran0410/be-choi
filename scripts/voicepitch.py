"""Measure the pitch of each recorded take (public/sfx/<kind>-<n>.m4a) for src/core/voicepitch.ts.

    python3 scripts/voicepitch.py meow        # needs ffmpeg and numpy

Prints the median fundamental over the voiced frames of each take. A meow glides,
so treat the number as the middle of the glide.
"""
import subprocess, sys, glob, os
import numpy as np

kind = sys.argv[1] if len(sys.argv) > 1 else 'meow'
root = os.path.join(os.path.dirname(__file__), '..', 'public', 'sfx')
SR, N, HOP = 22050, 2048, 512
for path in sorted(glob.glob(os.path.join(root, f'{kind}-*.m4a'))):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.int16).astype(float) / 32768
    freqs = []
    for s in range(0, len(x) - N, HOP):
        f = x[s:s + N]
        if np.sqrt((f ** 2).mean()) < 0.02:
            continue
        f = f - f.mean()
        ac = np.correlate(f, f, 'full')[N - 1:]
        ac /= ac[0]
        lo, hi = int(SR / 2400), int(SR / 180)
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.6:
            freqs.append(SR / k)
    print(os.path.basename(path), round(float(np.median(freqs))) if freqs else None, 'Hz', f'({len(freqs)} frames)')

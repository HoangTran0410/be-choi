# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["librosa", "numpy"]
# ///
"""
Find the shortest seamless loop in each background recording.

A clock is the same tick-tock every second; thirty seconds of it is thirty copies.
This finds the period of anything that repeats — from the autocorrelation of its
onset envelope — and then the exact sample offset that period lands on, by
matching the waveform one period later against the waveform at the start. A loop a
whole number of periods long then joins itself with nothing to hear.

Anything without a clear period is left to the caller's default length.

    uv run scripts/lib/find_loop.py <job.json> <out.json>

job: {"items": [{"id", "path", "from", "maxLen"}]}
out: {id: {"start", "len", "period" | null, "strength"}}
"""
import json
import sys

import librosa
import numpy as np

SR = 22050
HOP = 256
# A beat slower than this is not a loop worth finding; faster is a buzz, not a rhythm.
MIN_PERIOD_S = 0.25
MAX_PERIOD_S = 6.0
# How alike the recording must be to itself one period later to call it periodic.
MIN_STRENGTH = 0.55
# A beat this clear wins over any longer repeat.
STRONG_BEAT = 0.8
# A periodic loop is at least this long, so the seam is not heard every half second
# and small drifts in a real clock average out.
MIN_LOOP_S = 3.0
# A whole recording that is one clip played again and again: its sound one repeat
# later is (nearly) the same, frame for frame. Looked for between these lengths,
# and taken only when the match is this close.
LONG_MIN_S = 5.0
LONG_MAX_S = 40.0
LONG_MIN_MATCH = 0.97
# Search this far either side of the envelope's estimate for the sample-exact period.
REFINE_S = 0.03
# Length of audio compared when refining.
MATCH_S = 1.5


def period_of(y: np.ndarray) -> tuple[float | None, float]:
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    env = env - env.mean()
    if not np.any(env):
        return None, 0.0
    ac = np.correlate(env, env, mode="full")[len(env) - 1 :]
    ac = ac / (ac[0] + 1e-9)
    lo = int(MIN_PERIOD_S * SR / HOP)
    hi = min(len(ac) - 1, int(MAX_PERIOD_S * SR / HOP))
    if hi <= lo:
        return None, 0.0
    # The first strong peak, not the tallest: the tallest is often a multiple.
    seg = ac[lo:hi]
    best = int(np.argmax(seg))
    top = seg[best]
    for i in range(1, len(seg) - 1):
        if seg[i] >= seg[i - 1] and seg[i] >= seg[i + 1] and seg[i] >= 0.85 * top:
            best = i
            break
    strength = float(seg[best])
    return (lo + best) * HOP / SR, strength


def repeat_of(y: np.ndarray) -> tuple[float | None, float]:
    """
    The length of the clip a recording is built from, if it is one clip repeated.
    Compares the log-mel spectrum with itself `lag` later, over every lag in range;
    real recordings never match themselves this closely, copies always do.
    """
    mel = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=SR, hop_length=HOP * 4, n_mels=40))
    f = mel - mel.mean(axis=1, keepdims=True)
    f = f / (np.linalg.norm(f, axis=0, keepdims=True) + 1e-9)
    step = HOP * 4 / SR
    lo, hi = int(LONG_MIN_S / step), int(LONG_MAX_S / step)
    best_lag, best = None, 0.0
    for lag in range(lo, min(hi, f.shape[1] - int(5 / step))):
        sim = float(np.mean(np.sum(f[:, :-lag] * f[:, lag:], axis=0)))
        if sim > best:
            best_lag, best = lag, sim
    if best_lag is None:
        return None, 0.0
    return best_lag * step, best


def refine(y: np.ndarray, start: int, length: int) -> int:
    """The loop length, within ±REFINE_S, whose end best matches its start sample for sample."""
    n = int(MATCH_S * SR)
    head = y[start : start + n]
    best, best_score = length, -np.inf
    r = int(REFINE_S * SR)
    for d in range(-r, r + 1, 2):
        s = start + length + d
        tail = y[s : s + n]
        if len(tail) < n:
            continue
        score = float(np.dot(head, tail) / (np.linalg.norm(head) * np.linalg.norm(tail) + 1e-9))
        if score > best_score:
            best, best_score = length + d, score
    return best


def main() -> None:
    job = json.load(open(sys.argv[1]))
    out = {}
    for it in job["items"]:
        y, _ = librosa.load(it["path"], sr=SR, mono=True)
        start = int(it["from"] * SR)
        window = y[start : start + int(40 * SR)]
        period, strength = period_of(window)
        # A clip repeated end to end, unless a clear beat was already found: a clock
        # is also "the same every 28 seconds", but four ticks make a far shorter loop.
        clip, match = (None, 0.0) if strength >= STRONG_BEAT else repeat_of(y[start:])
        if clip is not None and match >= LONG_MIN_MATCH:
            length = refine(y, start, int(round(clip * SR)))
            out[it["id"]] = {"start": it["from"], "len": round(length / SR, 4), "period": round(clip, 4), "strength": round(match, 3)}
            print(f"{it['id']:<14} repeats every {length / SR:.3f}s (match {match:.3f})", flush=True)
            continue
        if period is None or strength < MIN_STRENGTH:
            out[it["id"]] = {"start": it["from"], "len": None, "period": None, "strength": round(strength, 3)}
            print(f"{it['id']:<14} no period (beat {strength:.2f}, repeat {match:.3f})", flush=True)
            continue
        k = max(1, int(np.ceil(MIN_LOOP_S / period)))
        length = refine(y, start, int(round(period * k * SR)))
        out[it["id"]] = {
            "start": it["from"],
            "len": round(length / SR, 4),
            "period": round(period, 4),
            "strength": round(strength, 3),
        }
        print(f"{it['id']:<14} period {period:.3f}s ×{k} → {length / SR:.3f}s (strength {strength:.2f})", flush=True)
    json.dump(out, open(sys.argv[2], "w"), indent=1)


if __name__ == "__main__":
    main()

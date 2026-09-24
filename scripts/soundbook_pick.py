# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["torch", "transformers", "librosa", "numpy"]
# ///
"""
Listen to every candidate recording and keep the one that sounds most like what it is.

Nobody on this project can audition seventy sounds by ear every time the list
changes, and "rated highly on Freesound" says nothing about whether a two-year-old
will hear a cow. So each candidate is played to CLAP, an audio-text model, next to
every other label in the book plus a few kinds of junk (talking, wind, music). A
clip wins when CLAP is sure it is *this* thing and not the neighbour — a moo that
could also be a foghorn loses to one that could only be a cow.

Each recording is also cut here: the calls in it are found from the loudness
envelope, a window is tried from the start of each one, and the best window is
what gets kept. The Node side (scripts/soundbook.mjs) only encodes.

    uv run scripts/soundbook_pick.py <candidates.json> <picks.json>
"""
import json
import sys

import librosa
import numpy as np
import torch
from transformers import ClapModel, ClapProcessor

MODEL = "laion/larger_clap_general"
SR = 48000
# Things a clip can be instead of the thing it is supposed to be.
JUNK = [
    "people talking",
    "a man speaking",
    "wind noise on a microphone",
    "traffic noise in the background",
    "music playing",
    "silence",
    "static hiss",
]
# Clean and close beats far and noisy, even when both are clearly a cow.
CLEAN = "a clean, close-up studio recording of a single sound effect"
NOISY = "a distant, noisy outdoor field recording with background noise"
# A span quieter than this, relative to the recording's loudest moment, is not the sound.
ACTIVE_DB = -26
# Two bursts closer than this are one call (a "baa-aa", a double bark).
GAP_S = 0.3
# At most this many windows are tried per recording.
MAX_WINDOWS = 6


def spans(y: np.ndarray, sr: int) -> list[tuple[float, float]]:
    hop = 512
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    db = librosa.amplitude_to_db(rms, ref=np.max(rms) + 1e-9)
    on = db > ACTIVE_DB
    t = librosa.frames_to_time(np.arange(len(on)), sr=sr, hop_length=hop)
    out: list[list[float]] = []
    for i, a in enumerate(on):
        if not a:
            continue
        if out and t[i] - out[-1][1] <= GAP_S:
            out[-1][1] = t[i]
        else:
            out.append([t[i], t[i]])
    return [(a, b + hop / sr) for a, b in out if b - a > 0.08]


def windows(y: np.ndarray, sr: int, max_len: float) -> list[tuple[float, float]]:
    """Candidate cuts: from the start of each call, running on up to max_len but ending where sound ends."""
    found = spans(y, sr)
    wins = []
    for a, _ in found:
        start = max(0.0, a - 0.03)
        end = start
        for s, e in found:
            if s >= start and e <= start + max_len:
                end = max(end, e)
            elif s < start + max_len < e:
                end = start + max_len
        if end - start >= 0.25:
            wins.append((round(start, 3), round(min(end + 0.08, start + max_len), 3)))
    # Loudest calls first: a field recording's best call is rarely its first.
    def energy(w):
        seg = y[int(w[0] * sr) : int(w[1] * sr)]
        return float(np.mean(seg**2)) if len(seg) else 0.0

    wins = sorted(set(wins), key=energy, reverse=True)[:MAX_WINDOWS]
    return wins or [(0.0, min(len(y) / sr, max_len))]


def embedding(out) -> torch.Tensor:
    """transformers 4 returns the projected embedding; 5 wraps it in an output object."""
    return out if isinstance(out, torch.Tensor) else out.pooler_output


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    job = json.load(open(src))
    items = job["items"]
    prompts = [it["prompt"] for it in items] + JUNK + [CLEAN, NOISY]
    n_items = len(items)

    model = ClapModel.from_pretrained(MODEL).eval()
    proc = ClapProcessor.from_pretrained(MODEL)
    with torch.no_grad():
        t_in = proc(text=prompts, return_tensors="pt", padding=True)
        text = embedding(model.get_text_features(**t_in))
        text = text / text.norm(dim=-1, keepdim=True)
    scale = model.logit_scale_a.exp().item()

    picks = {}
    for idx, it in enumerate(items):
        best = None
        report = []
        for cand in it["candidates"]:
            try:
                y, _ = librosa.load(cand["path"], sr=SR, mono=True)
            except Exception as err:  # noqa: BLE001
                print(f"  {it['id']}: cannot read {cand['path']}: {err}", file=sys.stderr)
                continue
            if len(y) < SR * 0.2:
                continue
            wins = windows(y, SR, it["maxLen"])
            clips = [y[int(a * SR) : int(b * SR)] for a, b in wins]
            with torch.no_grad():
                a_in = proc(audio=clips, sampling_rate=SR, return_tensors="pt")
                aud = embedding(model.get_audio_features(**a_in))
                aud = aud / aud.norm(dim=-1, keepdim=True)
                logits = scale * aud @ text.T
                named = logits[:, : n_items + len(JUNK)]
                probs = named.softmax(dim=-1)
                clean = logits[:, -2:].softmax(dim=-1)[:, 0]
            for w, lg, p, c in zip(wins, named, probs, clean):
                # Probabilities saturate: five good moos all score 0.99. The margin
                # over the nearest other label keeps ranking them — how much more
                # this is a cow than it is anything else — nudged by how clean it is.
                others = torch.cat([lg[:idx], lg[idx + 1 :]])
                margin = float(lg[idx] - others.max())
                score = margin + 4 * (float(c) - 0.5)
                row = {
                    "id": cand["id"],
                    "start": w[0],
                    "end": w[1],
                    "score": round(score, 3),
                    "p": round(float(p[idx]), 3),
                    "clean": round(float(c), 3),
                }
                report.append(row)
                if best is None or score > best["score"]:
                    best = {**row, "path": cand["path"]}
        report.sort(key=lambda r: -r["score"])
        if best:
            picks[it["id"]] = {**best, "alternatives": report[1:6]}
            print(f"{it['id']:<14} {best['score']:6.2f}  p={best['p']:.2f} clean={best['clean']:.2f}  fs#{best['id']}  {best['start']:.2f}-{best['end']:.2f}s", flush=True)
        else:
            print(f"{it['id']:<14} nothing usable", flush=True)
    json.dump(picks, open(dst, "w"), indent=2)


if __name__ == "__main__":
    main()

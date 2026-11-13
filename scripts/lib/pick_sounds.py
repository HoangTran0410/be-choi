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
what gets kept. The Node side (scripts/lib/freesound.mjs) only encodes.

An item asking for several `takes` gets the best cut of each of its best few
recordings, so a button pressed twenty times is not twenty copies of one moo —
as long as the runners-up are nearly as clear as the winner.

    uv run scripts/lib/pick_sounds.py <candidates.json> <picks.json>
"""
import json
import sys

import librosa
import numpy as np
import torch
from transformers import ASTFeatureExtractor, ASTForAudioClassification, ClapModel, ClapProcessor

MODEL = "laion/larger_clap_general"
# AudioSet classifier: a second, independent opinion. CLAP is zero-shot and
# can be talked into things; AST was trained on 2 M labelled clips and says
# "Cat" or "Speech" with calibrated odds.
AST_MODEL = "MIT/ast-finetuned-audioset-10-10-0.4593"
AST_SR = 16000
# Whatever the clip is, it must not be these (no voice, no music bed).
AST_BAD = ["Speech", "Singing", "Male speech, man speaking", "Female speech, woman speaking", "Child speech, kid speaking", "Conversation"]
AST_BAD_MAX = 0.25
# Music bed: bells and chimes are musical, so this one is only for a clip that is mostly music.
AST_MUSIC = "Music"
AST_MUSIC_MAX = 0.55
# The wanted class must be this likely, and among the classifier's top few.
AST_HIT_MIN = 0.2
AST_TOP = 6
# Sure enough on its own, when CLAP prefers a look-alike (a donkey for a horse).
AST_SURE = 0.5
# Things an animal recording is often mistaken for. They are never an item of
# the book, so no item competes with them, but a clip that sounds more like one
# of these than like the animal it is meant to be is the wrong clip.
VOCAB = [
    "a rhinoceros snorting", "a hippopotamus grunting", "a tiger roaring", "a lion roaring", "a bear growling",
    "a whale singing", "a seal barking", "a camel groaning", "a deer calling", "a crow cawing", "a seagull screaming",
    "a goose honking", "a turkey gobbling", "a monster roar sound effect", "a didgeridoo", "a trumpet instrument",
    "a foghorn", "a synthesizer", "a person imitating an animal", "a cartoon sound effect", "a cat purring",
    "a dog whining", "a man shouting", "a baby crying", "an engine idling", "a lorry reversing",
]
SR = 48000
# Things a clip can be instead of the thing it is supposed to be.
JUNK = [
    "a crowd of many animals making noise together",
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
# A cut shorter than this is a fragment — half a moo, one toot of a "choo choo" —
# and loses this much score. Items that really are a blip (a pop, a click) set
# their own minLen.
MIN_LEN = 0.9
SHORT_PENALTY = 3.0
# A second take has to score within this much of the best one to be kept.
TAKE_SLACK = 6.0
# Two takes this alike (cosine of CLAP embeddings) are one recording uploaded twice.
SAME_EMBED = 0.965
# A clip failing recognition is only ever used when nothing passes, and is marked so.
UNVERIFIED = 100.0
# At most this many windows are tried per recording.
MAX_WINDOWS = 4


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


def names_of(ast, probs, n: int = 2) -> str:
    return ", ".join(f"{ast.config.id2label[i]} {float(probs[i]):.2f}" for i in probs.topk(n).indices.tolist())


def embedding(out) -> torch.Tensor:
    """transformers 4 returns the projected embedding; 5 wraps it in an output object."""
    return out if isinstance(out, torch.Tensor) else out.pooler_output


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    job = json.load(open(src))
    items = job["items"]
    prompts = [it["prompt"] for it in items] + JUNK + VOCAB + [CLEAN, NOISY]
    n_items = len(items)
    index = {it["id"]: i for i, it in enumerate(items)}
    n_named = len(prompts) - 2

    model = ClapModel.from_pretrained(MODEL).eval()
    proc = ClapProcessor.from_pretrained(MODEL)
    with torch.no_grad():
        t_in = proc(text=prompts, return_tensors="pt", padding=True)
        text = embedding(model.get_text_features(**t_in))
        text = text / text.norm(dim=-1, keepdim=True)
    scale = model.logit_scale_a.exp().item()

    ast_fx = ASTFeatureExtractor.from_pretrained(AST_MODEL)
    ast = ASTForAudioClassification.from_pretrained(AST_MODEL).eval()
    names = {v: int(k) for k, v in ast.config.id2label.items()}
    for it in items:
        for label in it.get("labels", []) + AST_BAD + [AST_MUSIC]:
            if label not in names:
                sys.exit(f"{it['id']}: {label!r} is not an AudioSet class")
    bad_ix = [names[b] for b in AST_BAD]

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
                named = logits[:, :n_named]
                probs = named.softmax(dim=-1)
                clean = logits[:, -2:].softmax(dim=-1)[:, 0]
                a_in = ast_fx([librosa.resample(c_, orig_sr=SR, target_sr=AST_SR) for c_ in clips], sampling_rate=AST_SR, return_tensors="pt")
                ap = torch.sigmoid(ast(**a_in).logits)
            for w, lg, p, c, emb, apr in zip(wins, named, probs, clean, aud, ap):
                # Probabilities saturate: five good moos all score 0.99. The margin
                # over the nearest other label keeps ranking them — how much more
                # this is a cow than it is anything else — nudged by how clean it is.
                others = torch.cat([lg[:idx], lg[idx + 1 :]])
                margin = float(lg[idx] - others.max())
                score = margin + 4 * (float(c) - 0.5)
                if w[1] - w[0] < it.get("minLen", MIN_LEN):
                    score -= SHORT_PENALTY
                # Recognition: CLAP's top label over every neighbour and look-alike is this
                # item (or one it says is as good), the classifier agrees, and nobody speaks.
                right = {idx} | {index[a] for a in it.get("alike", []) if a in index}
                top1 = int(lg.argmax())
                clap_ok = top1 in right
                voice = float(apr[bad_ix].max())
                labels = it.get("labels", [])
                ast_hit = max((float(apr[names[l]]) for l in labels), default=1.0)
                top = apr.topk(AST_TOP).indices.tolist()
                ast_ok = not labels or (ast_hit >= AST_HIT_MIN and any(names[l] in top for l in labels))
                # CLAP naming it, or the classifier being sure of it (AST was trained on labelled clips, CLAP is zero-shot).
                ast_sure = bool(labels) and ast_hit >= AST_SURE and any(names[l] in top[:2] for l in labels)
                verified = (clap_ok or ast_sure) and ast_ok and voice < AST_BAD_MAX and float(apr[names[AST_MUSIC]]) < AST_MUSIC_MAX
                # Where the models have no word for it and Freesound holds almost nothing (dolphins), the
                # title is the evidence: someone named the recording, and nobody speaks in it.
                if it.get("trust") and voice < AST_BAD_MAX:
                    verified = True
                if not verified:
                    score -= UNVERIFIED
                row = {
                    "id": cand["id"],
                    "start": w[0],
                    "end": w[1],
                    "score": round(score, 3),
                    "p": round(float(p[idx]), 3),
                    "clean": round(float(c), 3),
                    "ok": verified,
                    "clap": prompts[top1],
                    "ast": names_of(ast, apr),
                    "voice": round(voice, 2),
                    "path": cand["path"],
                    "emb": emb.tolist(),
                }
                report.append(row)
                if best is None or score > best["score"]:
                    best = row
        report.sort(key=lambda r: -r["score"])
        if best:
            # One cut per recording: two slices of the same moo are not two takes.
            takes, used = [], set()
            for r in report:
                if not r["ok"] and takes:
                    break
                if r["id"] in used or r["score"] < best["score"] - TAKE_SLACK or len(takes) >= it.get("takes", 1):
                    continue
                if any(float(np.dot(r["emb"], t["emb"])) > SAME_EMBED for t in takes):
                    continue
                used.add(r["id"])
                takes.append(r)
            n_ok = sum(1 for r in report if r["ok"])
            strip = lambda r: {k: v for k, v in r.items() if k != "emb"}
            picks[it["id"]] = {**strip(best), "takes": [strip(t) for t in takes], "alternatives": [strip(r) for r in report[1:6]]}
            print(
                f"{it['id']:<14} {best['score']:6.2f}  p={best['p']:.2f} clean={best['clean']:.2f}  "
                f"fs#{best['id']}  {best['start']:.2f}-{best['end']:.2f}s  ({len(takes)} take{'s' * (len(takes) > 1)}, {sum(t['ok'] for t in takes)} verified, {n_ok}/{len(report)} windows ok)  {best['clap'][:28]} | {best['ast']}",
                flush=True,
            )
        else:
            print(f"{it['id']:<14} nothing usable", flush=True)
    json.dump(picks, open(dst, "w"), indent=2)


if __name__ == "__main__":
    main()

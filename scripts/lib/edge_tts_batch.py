"""Render many lines with Microsoft Edge neural voices (edge-tts), a few at a time.

Usage: uv run --with edge-tts python -I edge_tts_batch.py jobs.json
jobs.json: [{"text": "...", "out": "/abs/path.mp3", "voice": "vi-VN-HoaiMyNeural", "rate": "-10%", "pitch": "+0Hz"}]
Skips jobs whose output already exists. Retries each line a few times (the service drops some requests).
"""
import asyncio, json, os, sys

import edge_tts


async def one(job, sem):
    if os.path.exists(job["out"]) and os.path.getsize(job["out"]) > 1000:
        return True
    async with sem:
        for attempt in range(int(os.environ.get("TRIES", "20"))):
            try:
                c = edge_tts.Communicate(job["text"], job["voice"], rate=job.get("rate", "+0%"), pitch=job.get("pitch", "+0Hz"))
                tmp = job["out"] + ".part"
                await c.save(tmp)
                if os.path.getsize(tmp) > 1000:
                    os.replace(tmp, job["out"])
                    await asyncio.sleep(float(os.environ.get("GAP", "0.25")))
                    return True
                os.remove(tmp)
            except Exception as e:  # noqa: BLE001
                err = e
            # The service answers "no audio" at random (~half the calls): just ask again soon.
            await asyncio.sleep(min(8, 0.5 * (attempt + 1)))
        print("FAIL", job["text"], file=sys.stderr)
        return False


async def main():
    jobs = json.load(open(sys.argv[1], encoding="utf-8"))
    sem = asyncio.Semaphore(int(os.environ.get("CONC", "4")))
    done = 0
    results = []
    for chunk in range(0, len(jobs), 200):
        results += await asyncio.gather(*(one(j, sem) for j in jobs[chunk : chunk + 200]))
        done = min(len(jobs), chunk + 200)
        print(f"{done}/{len(jobs)}", flush=True)
    print(f"ok {sum(results)} fail {len(results) - sum(results)}")


asyncio.run(main())

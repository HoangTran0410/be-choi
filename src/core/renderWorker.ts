/**
 * Renders the engine's computed notes (a cat singing, a world instrument) off the main
 * thread. Both are written sample by sample in plain JS: a sung cat note takes tens of
 * milliseconds and some instruments a few hundred, which on a tablet is a run of dropped
 * frames in the middle of a game the first time each note is played. The engine asks
 * for the samples here and plays a quick synthesized stand-in until they arrive.
 */
import { renderCatNote } from './catvoice';
import { renderInstrument, type InstrumentId } from './instruments';

export type RenderRequest =
  | { id: number; kind: 'cat'; hz: number; sampleRate: number; dur: number }
  | { id: number; kind: 'inst'; inst: InstrumentId; freq: number; vel: number; sampleRate: number; dur?: number };

export interface RenderReply {
  id: number;
  data: Float32Array | null;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<RenderRequest>) => void) | null;
  postMessage(message: RenderReply, transfer: Transferable[]): void;
};

scope.onmessage = (e) => {
  const req = e.data;
  let data: Float32Array | null = null;
  try {
    data =
      req.kind === 'cat'
        ? renderCatNote(req.hz, { sampleRate: req.sampleRate, dur: req.dur })
        : renderInstrument(req.inst, req.freq, req.vel, req.sampleRate, { dur: req.dur });
  } catch {
    data = null;
  }
  scope.postMessage({ id: req.id, data }, data ? [data.buffer] : []);
};

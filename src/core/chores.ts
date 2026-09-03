/**
 * A handful of jobs that can be done in any order.
 *
 * A two-year-old presses whatever catches their eye, so a pretend-play game
 * must never insist on a running order: every object works the moment it is
 * touched, a job can be undone again (a lamp is a switch, not a step), and the
 * round ends once every job is ticked off — however the child got there.
 */
export interface Checklist<J extends string> {
  /** Every job, in the order they were declared. */
  readonly jobs: readonly J[];
  done(job: J): boolean;
  /** Set a job done or undone. True when this actually changed something. */
  set(job: J, done: boolean): boolean;
  /** The jobs still waiting, in `jobs` order. */
  left(): J[];
  allDone(): boolean;
  /** Back to nothing done, for the next round. */
  reset(): void;
}

export function createChecklist<J extends string>(jobs: readonly J[]): Checklist<J> {
  const state = new Map<J, boolean>();
  const reset = (): void => {
    for (const job of jobs) state.set(job, false);
  };
  reset();
  return {
    jobs,
    done: (job) => state.get(job) === true,
    set(job, done) {
      if (!state.has(job) || state.get(job) === done) return false;
      state.set(job, done);
      return true;
    },
    left: () => jobs.filter((job) => state.get(job) !== true),
    allDone: () => jobs.every((job) => state.get(job) === true),
    reset,
  };
}

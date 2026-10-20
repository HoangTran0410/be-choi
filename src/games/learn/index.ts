import { h } from '../../core/dom';
import { onPerfChange, perf } from '../../core/frame';
import type { Photo } from '../../core/photos';
import type { GameContext, GameModule } from '../../core/types';
import type { App } from './app';
import { peopleFrom } from './curriculum';
import { showExplore } from './explore';
import { showMap } from './map';
import { meta } from './meta';
import { loadState, saveState } from './progress';
import { showQuiz } from './quiz';
import { createSayer } from './say';
import { createScope, type Scope } from './scope';
import { createTeacher } from './teacher';
import type { Env, TopicId } from './types';
import './style.css';

type Screen = 'map' | 'quiz' | 'explore';

/**
 * Học cùng bé: one teacher and one layout for ten topics. The map (a winding path of
 * stations) is home; a station asks five questions that get harder only when the child
 * is steady; Khám phá lets the child touch things and just listen.
 *
 * This file only wires the screens together; each lives in its own module.
 */
function start(ctx: GameContext): void {
  const root = createScope();
  ctx.onCleanup(() => root.dispose());

  const state = loadState();
  const env: Env = { people: [] };
  const sayer = createSayer(ctx, root);
  const teacher = createTeacher(state.wear);
  const host = h('div', { class: `learn${perf.low ? ' low' : ''}` });
  ctx.stage.append(host);
  root.onDispose(() => host.remove());
  root.onDispose(onPerfChange((low) => host.classList.toggle('low', low)));

  let screen: Screen = 'map';
  let screenScope: Scope | null = null;

  function mount(next: Screen, draw: (scope: Scope) => void): void {
    screenScope?.dispose();
    ctx.hint.clear();
    sayer.stop();
    screen = next;
    host.dataset.screen = next;
    screenScope = root.child();
    draw(screenScope);
  }

  const app: App = {
    ctx,
    state,
    env,
    sayer,
    teacher,
    firstVisit: true,
    low: () => perf.low,
    save: () => void saveState(state),
    goMap: () => mount('map', (s) => showMap(app, host, s)),
    goQuiz: (topic: TopicId) => mount('quiz', (s) => showQuiz(app, topic, host, s)),
    goExplore: () => mount('explore', (s) => showExplore(app, host, s)),
  };

  // Family photos: the "Người thân" station opens up once there are two to tell apart.
  const signature = (people: Env['people']): string => people.map((q) => `${q.key}|${q.name ?? ''}|${q.urls.length}`).join(';');
  const applyPhotos = (list: Photo[]): void => {
    const people = peopleFrom(list);
    const changed = signature(people) !== signature(app.env.people);
    app.env.people = people;
    // The map is the only screen that depends on who is in the photos; a question in progress is left alone.
    if (changed && screen === 'map') app.goMap();
  };
  void ctx.photos
    .list()
    .then((list) => {
      if (root.alive()) applyPhotos(list);
    })
    .catch(() => undefined);
  root.onDispose(ctx.photos.onChange((list) => root.alive() && applyPhotos(list)));

  app.goMap();
}

const game: GameModule = { ...meta, start };
export default game;

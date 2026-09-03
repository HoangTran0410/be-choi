/**
 * Entry point for `notes.html`, the melody editor. Vite only builds `index.html`, so
 * this page exists during `npm run dev` and never ships in the app the child installs.
 */
import { createAudio } from '../../core/audio';
import { mountEditor } from './editor';
import './style.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app missing');

const audio = createAudio();
// Browsers keep the audio context asleep until a gesture, same as in the app.
document.addEventListener('pointerdown', () => audio.unlock(), { capture: true, passive: true });

mountEditor(root, audio);

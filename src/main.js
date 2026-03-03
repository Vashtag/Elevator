// ─────────────────────────────────────────────
//  GOING UP  ·  Entry Point
// ─────────────────────────────────────────────

import { GameEngine } from './engine.js';
import { UIManager }  from './ui.js';

const engine = new GameEngine();
const ui     = new UIManager(engine);

// Make accessible for debugging
window._game = engine;

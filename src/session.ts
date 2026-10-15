// The current run, shared between scenes, with save/continue between fights.

import { RunState } from './core/run';

const KEY = 'clench.run.v1';

export const session: { run: RunState | null } = { run: null };

export function saveRun() {
  try {
    if (session.run && !session.run.over) localStorage.setItem(KEY, JSON.stringify(session.run));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
}

export function loadSavedRun(): RunState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RunState) : null;
  } catch {
    return null;
  }
}

export function clearSavedRun() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

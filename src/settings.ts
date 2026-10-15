// Player settings, kept in browser storage (wrapped: storage can be unavailable).

export interface Settings {
  sound: boolean;
  vibration: boolean;
  fast: boolean;
  holdToClench: boolean;
  reduceShake: boolean;
}

const KEY = 'clench.settings.v1';
const DEFAULTS: Settings = { sound: true, vibration: true, fast: false, holdToClench: true, reduceShake: false };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
}

export function vibrate(pattern: number | number[]) {
  if (!settings.vibration) return;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

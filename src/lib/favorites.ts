import { FREE_FAVORITE_SLOTS } from './config';

const KEY_FAVS = 'tm:favorites';
const KEY_SLOTS = 'tm:favSlots';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 불가 환경이면 조용히 무시 */
  }
}

export function getFavorites(): string[] {
  return read<string[]>(KEY_FAVS, []);
}

export function setFavorites(ids: string[]) {
  write(KEY_FAVS, ids);
}

export function getSlots(): number {
  return read<number>(KEY_SLOTS, FREE_FAVORITE_SLOTS);
}

export function addSlots(n: number): number {
  const next = getSlots() + n;
  write(KEY_SLOTS, next);
  return next;
}

// ───────────────────────── 지역 · 잠금 해제

const KEY_REGION = 'tm:region';
const KEY_UNLOCK = 'tm:regionUnlockUntil';

export function getRegionCode(): string | null {
  return read<string | null>(KEY_REGION, null);
}
export function setRegionCode(code: string) {
  write(KEY_REGION, code);
}
/** 유료 지역 잠금 해제 만료 시각(ms). 지났으면 0 */
export function getUnlockUntil(): number {
  const v = read<number>(KEY_UNLOCK, 0);
  return v > Date.now() ? v : 0;
}
export function setUnlockHours(hours: number): number {
  const until = Date.now() + hours * 3600 * 1000;
  write(KEY_UNLOCK, until);
  return until;
}

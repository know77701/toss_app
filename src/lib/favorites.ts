import { Storage } from '@apps-in-toss/web-framework';
import { FREE_FAVORITE_SLOTS } from './config';

/**
 * 저장 전략: 읽기는 동기(localStorage), 쓰기는 localStorage + 앱인토스 네이티브 Storage 둘 다.
 * 웹뷰 저장소가 비워져도 네이티브 쪽에서 되살립니다(hydrateFromNative). 서버로는 보내지 않습니다.
 */
const SYNC_KEYS = ['tm:favorites', 'tm:favSlots', 'tm:basket', 'tm:region', 'tm:regionUnlockUntil'];

function nativeSet(key: string, raw: string) {
  try {
    void Storage.setItem(key, raw).catch(() => {});
  } catch {
    /* 토스 밖 */
  }
}

/** 앱 시작 시 한 번: 네이티브에 있고 웹뷰에 없는 키를 되살립니다. 하나라도 되살렸으면 true */
export async function hydrateFromNative(): Promise<boolean> {
  try {
    const res = await Storage.getItems(SYNC_KEYS);
    let changed = false;
    for (const key of SYNC_KEYS) {
      const v = (res as Record<string, string | null | undefined>)[key];
      if (v == null) continue;
      if (localStorage.getItem(key) == null) {
        localStorage.setItem(key, v);
        changed = true;
      }
    }
    return changed;
  } catch {
    return false;
  }
}

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
  const raw = JSON.stringify(value);
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* 저장 불가 환경이면 조용히 무시 */
  }
  nativeSet(key, raw);
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

// ───────────────────────── 장바구니

const KEY_BASKET = 'tm:basket';

export type StoredBasketEntry = { kind: 'fresh' | 'mart'; id: string; qty: number };

export function getBasket(): StoredBasketEntry[] {
  return read<StoredBasketEntry[]>(KEY_BASKET, []);
}
export function setBasket(entries: StoredBasketEntry[]) {
  write(KEY_BASKET, entries);
}

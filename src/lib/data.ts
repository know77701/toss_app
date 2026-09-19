import { CATEGORY_ORDER, DATA_URL, POPULAR } from './config';

type DayKey = 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7';

export type PriceItem = {
  id: string;
  category: string; // '100' ~ '600'
  categoryName: string;
  item: string; // 품목명 (예: 돼지고기)
  kind: string; // 품종명 (예: 삼겹살)
  rank: string; // 상품 / 중품 / ''
  unit: string; // 100g, 1kg, 10개 ...
  /** d1: 오늘, d2: 1일 전, d3: 1주 전, d4: 2주 전, d5: 1개월 전, d6: 1년 전, d7: 평년 (원본 표기) */
  days: Record<DayKey, string>;
  /** 수집 스크립트가 yyyy-mm-dd 로 정규화한 날짜. 구버전 데이터엔 없을 수 있음 */
  dates?: Partial<Record<DayKey, string | null>>;
  prices: Record<DayKey, number | null>;
};

export type PriceData = {
  updatedAt: string;
  regday: string; // 조사일 yyyy-mm-dd
  region: string;
  source: string;
  items: PriceItem[];
};

/** id → [[yyyy-mm-dd, price], ...] 오름차순 */
export type HistoryData = {
  updatedAt: string;
  regday?: string;
  series: Record<string, Array<[string, number]>>;
};

export type Point = { date: string; price: number };

export type DisplayItem = PriceItem & {
  label: string;
  popularRank: number | null;
};

// ───────────────────────── 로드

/** 지역별 파일 경로. 서울(1101)은 prices.json, 그 외는 prices.<code>.json */
export function dataUrlFor(kind: 'prices' | 'history' | 'mart', regionCode: string): string {
  const base = DATA_URL.replace(/prices\.json(\?.*)?$/, '');
  if (base === DATA_URL) return DATA_URL; // 예상 밖 경로면 그대로
  const suffix = regionCode === '1101' ? '' : `.${regionCode}`;
  return `${base}${kind}${suffix}.json`;
}

const CACHE_MS = 6 * 60 * 60 * 1000;

/** 기기 저장소 캐시. 하루 1~2번 갱신되는 파일이라 6시간 안에는 네트워크를 타지 않습니다. */
async function cachedJson<T>(url: string): Promise<T> {
  const key = `tm:cache:${url}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const { at, data } = JSON.parse(raw) as { at: number; data: T };
      if (Date.now() - at < CACHE_MS) return data;
    }
  } catch {
    /* 캐시 못 읽으면 네트워크 */
  }
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다 (${res.status})`);
  const data = (await res.json()) as T;
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* 용량 초과 등은 무시 */
  }
  return data;
}

/** 원격이 안 되면 빌드에 포함된 스냅샷(public/data)으로 대체. 서울·회수 정보만 스냅샷이 있습니다. */
async function withFallback<T>(url: string, localName: string): Promise<T> {
  try {
    return await cachedJson<T>(url);
  } catch (e) {
    if (url.startsWith('/data/')) throw e;
    const res = await fetch(`/data/${localName}`, { cache: 'no-store' });
    if (!res.ok) throw e;
    return (await res.json()) as T;
  }
}

export async function fetchPriceData(regionCode = '1101'): Promise<PriceData> {
  const url = dataUrlFor('prices', regionCode);
  const json = regionCode === '1101' ? await withFallback<PriceData>(url, 'prices.json') : await cachedJson<PriceData>(url);
  if (!Array.isArray(json.items)) throw new Error('데이터 형식이 올바르지 않습니다');
  return json;
}

/** 이력은 없어도 앱이 동작해야 하므로 실패 시 null */
export async function fetchHistory(regionCode = '1101'): Promise<HistoryData | null> {
  try {
    const url = dataUrlFor('history', regionCode);
    if (url === DATA_URL) return null;
    const json = regionCode === '1101' ? await withFallback<HistoryData>(url, 'history.json') : await cachedJson<HistoryData>(url);
    return json && json.series ? json : null;
  } catch {
    return null;
  }
}

// ───────────────────────── 계산

/** 오늘 대비 비교 기준. 어제 값이 없으면(주말·공휴일) 1주 전, 그것도 없으면 1개월 전. */
export function change(it: PriceItem): { pct: number; diff: number; baseLabel: string } | null {
  const today = it.prices.d1;
  if (today == null) return null;
  const candidates: Array<[DayKey, string]> = [
    ['d2', '어제'],
    ['d3', '1주 전'],
    ['d5', '1개월 전'],
  ];
  for (const [k, label] of candidates) {
    const base = it.prices[k];
    if (base != null && base > 0) {
      const diff = today - base;
      return { pct: (diff / base) * 100, diff, baseLabel: label };
    }
  }
  return null;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** "09/18" 같은 짧은 날짜를 기준일 연도로 yyyy-mm-dd 정규화 */
export function normalizeDate(raw: string | null | undefined, refDate: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
  m = s.match(/(\d{1,2})[-/.](\d{1,2})/);
  if (!m) return null;
  const y = Number(refDate.slice(0, 4));
  let c = `${y}-${pad2(+m[1])}-${pad2(+m[2])}`;
  if (c > refDate) c = `${y - 1}-${pad2(+m[1])}-${pad2(+m[2])}`;
  return c;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 오늘·어제·1주·2주·1개월 전 다섯 점 */
export function anchorPoints(it: PriceItem, regday: string): Point[] {
  const keys: DayKey[] = ['d5', 'd4', 'd3', 'd2', 'd1'];
  const out: Point[] = [];
  for (const k of keys) {
    const price = it.prices[k];
    const date = it.dates?.[k] ?? normalizeDate(it.days[k], regday);
    if (price != null && date) out.push({ date, price });
  }
  return out;
}

/**
 * 최근 N일 시계열. 이력(history)과 앵커 5점을 합쳐 날짜순으로 돌려줍니다.
 * sparse: 실제 일별 이력이 아직 얇아서 점이 3개 미만인 경우
 */
export function seriesFor(
  it: PriceItem,
  history: HistoryData | null,
  regday: string,
  days: number,
): { points: Point[]; sparse: boolean } {
  const from = addDays(regday, -days);
  const map = new Map<string, number>();
  for (const [d, p] of history?.series?.[it.id] ?? []) if (d >= from && d <= regday) map.set(d, p);
  for (const p of anchorPoints(it, regday)) if (p.date >= from && p.date <= regday && !map.has(p.date)) map.set(p.date, p.price);
  const points = [...map.entries()].map(([date, price]) => ({ date, price })).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { points, sparse: points.length < 3 };
}

// ───────────────────────── 정렬

function rankScore(rank: string): number {
  if (rank.includes('상')) return 0;
  if (rank.includes('중')) return 1;
  return 2;
}

export function orderItems(items: PriceItem[]): DisplayItem[] {
  const used = new Set<string>();
  const popular: DisplayItem[] = [];

  POPULAR.forEach((m, idx) => {
    const found = items
      .filter((it) => !used.has(it.id) && it.prices.d1 != null)
      .filter((it) => it.item === m.item)
      .filter((it) => (m.kind ? it.kind.includes(m.kind) : true))
      .filter((it) => (m.rank ? it.rank.includes(m.rank) : true))
      .sort((a, b) => rankScore(a.rank) - rankScore(b.rank))[0];
    if (found) {
      used.add(found.id);
      popular.push({ ...found, label: m.label, popularRank: idx + 1 });
    }
  });

  const rest: DisplayItem[] = items
    .filter((it) => !used.has(it.id))
    .sort((a, b) => {
      const ca = (CATEGORY_ORDER.indexOf(a.category) + 100) % 100;
      const cb = (CATEGORY_ORDER.indexOf(b.category) + 100) % 100;
      if (ca !== cb) return ca - cb;
      if (a.item !== b.item) return a.item.localeCompare(b.item, 'ko');
      return rankScore(a.rank) - rankScore(b.rank);
    })
    .map((it) => ({ ...it, label: shortLabel(it), popularRank: null }));

  return [...popular, ...rest];
}

export function shortLabel(it: PriceItem): string {
  if (!it.kind || it.kind === it.item) return it.item;
  return `${it.item} ${it.kind}`;
}

export function fullLabel(it: PriceItem): string {
  const parts = [it.item];
  if (it.kind && it.kind !== it.item) parts.push(it.kind);
  if (it.rank) parts.push(it.rank);
  return parts.join(' · ');
}

// ───────────────────────── 표시

export function won(n: number | null | undefined): string {
  if (n == null) return '-';
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

export function pct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

/** yyyy-mm-dd → "9.18" */
export function shortDate(date: string): string {
  const m = date.match(/\d{4}-(\d{2})-(\d{2})/);
  return m ? `${+m[1]}.${+m[2]}` : date;
}

/** 인기 품목 중 가장 많이 오른 것과 내린 것 */
export function headline(list: DisplayItem[]): { up: DisplayItem | null; down: DisplayItem | null } {
  const pop = list.filter((x) => x.popularRank != null);
  let up: DisplayItem | null = null;
  let down: DisplayItem | null = null;
  let upPct = 0;
  let downPct = 0;
  for (const it of pop) {
    const c = change(it);
    if (!c) continue;
    if (c.pct > upPct) {
      upPct = c.pct;
      up = it;
    }
    if (c.pct < downPct) {
      downPct = c.pct;
      down = it;
    }
  }
  return { up, down };
}

/**
 * 어제 대비 많이 오른 / 내린 품목 상위 n개.
 * 같은 품목·품종의 상품/중품이 둘 다 잡히지 않도록 이름 기준으로 하나만 씁니다.
 */
export function movers(list: DisplayItem[], n = 5): { up: Array<DisplayItem & { pct: number }>; down: Array<DisplayItem & { pct: number }> } {
  const seen = new Set<string>();
  const scored: Array<DisplayItem & { pct: number }> = [];
  for (const it of list) {
    const key = `${it.item}|${it.kind}`;
    if (seen.has(key)) continue;
    const c = change(it);
    if (!c || c.baseLabel !== '어제') continue;
    seen.add(key);
    scored.push({ ...it, pct: c.pct });
  }
  const up = scored.filter((x) => x.pct > 0.05).sort((a, b) => b.pct - a.pct).slice(0, n);
  const down = scored.filter((x) => x.pct < -0.05).sort((a, b) => a.pct - b.pct).slice(0, n);
  return { up, down };
}

// ───────────────────────── 검색

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/** 한글 음절을 초성으로 (삼겹살 → ㅅㄱㅅ). 그 외 문자는 그대로 */
function toChosung(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0) - 0xac00;
    out += code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : ch;
  }
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 품목명·품종명·표시명에 부분 일치. 초성만 입력해도 찾습니다 (ㅅㄱㅅ → 삼겹살). */
export function searchItems(list: DisplayItem[], query: string): DisplayItem[] {
  const q = norm(query);
  if (!q) return [];
  const isChosungOnly = /^[ㄱ-ㅎ]+$/.test(q);
  return list.filter((it) => {
    const hay = norm(`${it.label} ${it.item} ${it.kind}`);
    if (hay.includes(q)) return true;
    return isChosungOnly && toChosung(hay).includes(q);
  });
}

// ───────────────────────── 회수·판매중지 (식약처)

export type RecallItem = {
  seq: string;
  name: string;
  reason: string;
  company: string;
  category: string;
  type: string;
  grade: string;
  unit: string;
  expiry: string;
  made: string;
  barcode: string;
  image: string | null;
  date: string; // yyyy-mm-dd
};

export type RecallData = { updatedAt: string; source: string; items: RecallItem[] };

export async function fetchRecalls(): Promise<RecallData | null> {
  try {
    const base = DATA_URL.replace(/prices\.json(\?.*)?$/, '');
    if (base === DATA_URL) return null;
    const json = await withFallback<RecallData>(`${base}recalls.json`, 'recalls.json');
    return json && Array.isArray(json.items) ? json : null;
  } catch {
    return null;
  }
}

// ───────────────────────── 마트 물가 (한국소비자원 참가격)

export type MartStore = { id: string; name: string; chain: string; type: string; typeName: string };
export type MartProduct = {
  id: string;
  name: string;
  unit: string;
  cls: string;
  /** [매장 인덱스, 가격] 오름차순 */
  prices: Array<[number, number]>;
  min: number;
  max: number;
  avg: number;
  chainAvg: Record<string, number>;
};
export type MartData = {
  updatedAt: string;
  inspectDay: string;
  region: string;
  regionCode: string;
  source: string;
  stores: MartStore[];
  products: MartProduct[];
};

export async function fetchMart(regionCode = '1101'): Promise<MartData | null> {
  try {
    const url = dataUrlFor('mart', regionCode);
    if (url === DATA_URL) return null;
    const json = regionCode === '1101' ? await withFallback<MartData>(url, 'mart.json') : await cachedJson<MartData>(url);
    return json && Array.isArray(json.products) ? json : null;
  } catch {
    return null;
  }
}

// ───────────────────────── 대형마트 의무휴업일

import { MART_CLOSURE, type ClosureRule } from './config';

/** 이번 달과 다음 달의 의무휴업 예정일 (yyyy-mm-dd) */
export function closureDates(regionCode: string, from = new Date()): { dates: string[]; rule: ClosureRule } {
  const rule = MART_CLOSURE[regionCode] ?? MART_CLOSURE.default;
  const out: string[] = [];
  for (let m = 0; m < 2; m++) {
    const y = from.getFullYear();
    const mo = from.getMonth() + m;
    const first = new Date(y, mo, 1);
    let count = 0;
    for (let d = new Date(first); d.getMonth() === first.getMonth(); d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== rule.weekday) continue;
      count++;
      if (rule.weeks.includes(count)) out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
    }
  }
  const today = `${from.getFullYear()}-${pad2(from.getMonth() + 1)}-${pad2(from.getDate())}`;
  return { dates: out.filter((d) => d >= today), rule };
}

export function weekdayKo(date: string): string {
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(`${date}T00:00:00`).getDay()];
}

// ───────────────────────── 매장 좌표 · 거리

export type GeoData = { updatedAt: string; geo: Record<string, [number, number] | null> };

export async function fetchGeo(): Promise<GeoData | null> {
  try {
    const base = DATA_URL.replace(/prices\.json(\?.*)?$/, '');
    if (base === DATA_URL) return null;
    const json = await withFallback<GeoData>(`${base}stores-geo.json`, 'stores-geo.json');
    return json && json.geo ? json : null;
  } catch {
    return null;
  }
}

/** 두 좌표 사이 거리(km) */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function fmtKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

// ───────────────────────── 전통시장 (서울시)

export type MarketItem = {
  code: string;
  name: string;
  unit: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  guAvg: Record<string, number>;
  cheapest: Array<{ market: string; gu: string; price: number; spec: string; date: string }>;
};
export type MarketData = { updatedAt: string; inspectDay: string; region: string; source: string; markets: number; items: MarketItem[] };

export async function fetchMarket(): Promise<MarketData | null> {
  try {
    const base = DATA_URL.replace(/prices\.json(\?.*)?$/, '');
    if (base === DATA_URL) return null;
    const json = await withFallback<MarketData>(`${base}market.json`, 'market.json');
    return json && Array.isArray(json.items) ? json : null;
  } catch {
    return null;
  }
}

// ───────────────────────── 장바구니

export type BasketEntry = { kind: 'fresh' | 'mart'; id: string; qty: number };

export type StoreTotal = { storeIdx: number; total: number; covered: number; missing: string[] };

/** 마트 장바구니: 매장별 합계. 담은 상품 중 그 매장에 가격이 있는 것만 더하고, 빠진 상품은 이름으로 알려줍니다. */
export function martBasketTotals(mart: MartData, entries: BasketEntry[]): { totals: StoreTotal[]; avgTotal: number; items: number } {
  const picked = entries
    .filter((e) => e.kind === 'mart')
    .map((e) => ({ e, p: mart.products.find((p) => p.id === e.id) }))
    .filter((x): x is { e: BasketEntry; p: MartProduct } => !!x.p);
  if (picked.length === 0) return { totals: [], avgTotal: 0, items: 0 };

  const per = new Map<number, { total: number; covered: number; missing: string[] }>();
  mart.stores.forEach((_, idx) => per.set(idx, { total: 0, covered: 0, missing: [] }));
  for (const { e, p } of picked) {
    const has = new Map(p.prices.map(([si, price]) => [si, price]));
    for (const [idx, acc] of per) {
      const price = has.get(idx);
      if (price != null) {
        acc.total += price * e.qty;
        acc.covered++;
      } else acc.missing.push(p.name);
    }
  }
  const totals = [...per.entries()]
    .map(([storeIdx, v]) => ({ storeIdx, ...v }))
    .filter((t) => t.covered >= Math.ceil(picked.length * 0.7)) // 담은 것의 70% 이상 취급하는 매장만
    .sort((a, b) => b.covered - a.covered || a.total - b.total);
  const avgTotal = picked.reduce((s, { e, p }) => s + p.avg * e.qty, 0);
  return { totals, avgTotal, items: picked.length };
}

// ───────────────────────── 상품명 나누기 (제조사 / 제목 / 규격)

import { MAKERS } from './config';

export type SplitName = { title: string; maker: string | null; spec: string | null };

/**
 * "CJ 1등급 깨끗한 계란(10개)" → { maker: 'CJ', title: '1등급 깨끗한 계란', spec: '10개' }
 * 제조사는 MAKERS 목록에 있을 때만 떼어냅니다. 괄호 안 규격은 항상 아래 줄로 뺍니다.
 */
export function splitProductName(name: string): SplitName {
  let s = name.trim();
  let spec: string | null = null;
  const m = s.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (m) {
    s = m[1].trim();
    spec = m[2].trim() || null;
  }
  let maker: string | null = null;
  for (const mk of MAKERS) {
    if (s === mk) break;
    if (s.startsWith(mk + ' ') || (s.startsWith(mk) && mk.length >= 3 && /^[가-힣A-Za-z]/.test(s.slice(mk.length)))) {
      maker = mk;
      s = s.slice(mk.length).trim();
      break;
    }
  }
  return { title: s || name, maker, spec };
}

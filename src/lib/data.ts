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
export function dataUrlFor(kind: 'prices' | 'history', regionCode: string): string {
  const base = DATA_URL.replace(/prices\.json(\?.*)?$/, '');
  if (base === DATA_URL) return DATA_URL; // 예상 밖 경로면 그대로
  const suffix = regionCode === '1101' ? '' : `.${regionCode}`;
  return `${base}${kind}${suffix}.json`;
}

export async function fetchPriceData(regionCode = '1101'): Promise<PriceData> {
  const res = await fetch(dataUrlFor('prices', regionCode), { cache: 'no-store' });
  if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다 (${res.status})`);
  const json = (await res.json()) as PriceData;
  if (!Array.isArray(json.items)) throw new Error('데이터 형식이 올바르지 않습니다');
  return json;
}

/** 이력은 없어도 앱이 동작해야 하므로 실패 시 null */
export async function fetchHistory(regionCode = '1101'): Promise<HistoryData | null> {
  try {
    const url = dataUrlFor('history', regionCode);
    if (url === DATA_URL) return null;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as HistoryData;
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
      .filter((it) => it.item.includes(m.item))
      .filter((it) => (m.kind ? it.kind.includes(m.kind) : true))
      .sort((a, b) => rankScore(a.rank) - rankScore(b.rank))[0];
    if (found) {
      used.add(found.id);
      popular.push({ ...found, label: m.label, popularRank: idx + 1 });
    }
  });

  const rest: DisplayItem[] = items
    .filter((it) => !used.has(it.id))
    .sort((a, b) => {
      const ca = CATEGORY_ORDER.indexOf(a.category);
      const cb = CATEGORY_ORDER.indexOf(b.category);
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

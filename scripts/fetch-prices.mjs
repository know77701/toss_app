/**
 * KAMIS 일별 부류별 소매가격을 지역별로 가져와 prices[.지역코드].json 으로 저장하고,
 * 날짜별 가격 이력을 history[.지역코드].json 에 누적합니다. (최근 40일 유지)
 *
 * 사용법:
 *   KAMIS_CERT_KEY=... KAMIS_CERT_ID=... node scripts/fetch-prices.mjs <출력폴더>
 *   예) node scripts/fetch-prices.mjs out          → out/prices.json, out/prices.2100.json, out/history.json ...
 *       node scripts/fetch-prices.mjs public/data  → 로컬 개발용
 *
 * - 첫 번째 지역(서울)은 prices.json / history.json (접미사 없음) 으로도 저장됩니다. 앱 기본값.
 * - 이력은 <출력폴더>/history*.json 이 이미 있으면 거기에 이어 붙입니다.
 * - 서울만 '기간별 품목별' API(periodProductList)로 최근 35일을 보충합니다.
 *   (한 번 실행에 최대 BACKFILL_MAX_CALLS 회, 기본 80회. 며칠 돌면 전 품목이 채워집니다.)
 *   다른 지역은 매일 쌓이는 값 + 어제/1주/2주/1개월 전 값으로만 채워집니다.
 *
 * 비용: KAMIS Open-API 무료(공공누리 1유형). 호출 수 = 지역 7 × 부류 6 = 42회 + 보충 최대 80회.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://www.kamis.or.kr/service/price/xml.do';
const CATEGORIES = {
  100: '식량작물',
  200: '채소류',
  300: '특용작물',
  400: '과일류',
  500: '축산물',
  600: '수산물',
};
// 소매 지역코드. 앱의 src/lib/config.ts REGIONS 와 같아야 합니다.
const REGIONS = [
  { code: '1101', name: '서울', backfill: true },
  { code: '2100', name: '부산' },
  { code: '2200', name: '대구' },
  { code: '2300', name: '인천' },
  { code: '2401', name: '광주' },
  { code: '2501', name: '대전' },
  { code: '2601', name: '울산' },
];
const HISTORY_DAYS = 40; // 보관 일수
const BACKFILL_DAYS = 35; // 기간별 API로 채울 범위
const BACKFILL_MAX_CALLS = Number(process.env.BACKFILL_MAX_CALLS ?? 80);

const certKey = process.env.KAMIS_CERT_KEY;
const certId = process.env.KAMIS_CERT_ID;
const outDir = process.argv[2] || 'out';

if (!certKey || !certId) {
  console.error('KAMIS_CERT_KEY, KAMIS_CERT_ID 환경변수가 필요합니다. (.env.example 참고)');
  process.exit(1);
}

// ───────────────────────── 유틸

function toNumber(v) {
  if (v == null) return null;
  const s = String(v).replace(/,/g, '').trim();
  if (!s || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return '';
}

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** "2026-09-18", "09/18" 등을 yyyy-mm-dd 로. 연도 없으면 기준일 연도, 기준일보다 미래면 전년 */
function normalizeDate(raw, refDate) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/(\d{1,2})[-/.](\d{1,2})/);
  if (!m) return null;
  const refYear = Number(refDate.slice(0, 4));
  let candidate = `${refYear}-${pad2(m[1])}-${pad2(m[2])}`;
  if (candidate > refDate) candidate = `${refYear - 1}-${pad2(m[1])}-${pad2(m[2])}`;
  return candidate;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callKamis(params) {
  const url = new URL(BASE);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  url.searchParams.set('p_returntype', 'json');
  url.searchParams.set('p_cert_key', certKey);
  url.searchParams.set('p_cert_id', certId);
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`JSON 파싱 실패: ${text.slice(0, 120)}`);
  }
  const d = json.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.item)) return d.item;
  if (d && d.error_code && d.error_code !== '000') return { error: d.error_code };
  return [];
}

// ───────────────────────── 1) 오늘 가격 (부류별)

async function fetchCategory(code, region) {
  const rows = await callKamis({
    action: 'dailyPriceByCategoryList',
    p_product_cls_code: '01', // 01 소매, 02 도매
    p_item_category_code: code,
    p_country_code: region.code,
    p_convert_kg_yn: 'N',
  });
  if (!Array.isArray(rows)) {
    console.warn(`[${region.name}] 부류 ${code}: KAMIS 응답 코드 ${rows.error} (001=데이터 없음, 200=파라미터 오류, 900=인증 실패)`);
    return [];
  }
  return rows
    .map((row) => {
      const item = pick(row, 'item_name');
      if (!item) return null;
      const kind = pick(row, 'kind_name');
      const rank = pick(row, 'rank').replace(/\s/g, '');
      const itemCode = pick(row, 'item_code', 'itemcode');
      const kindCode = pick(row, 'kind_code', 'kindcode');
      const rankCode = pick(row, 'rank_code', 'rankcode');
      return {
        id: `${code}-${itemCode}-${kindCode}-${rankCode || rank}`,
        category: String(code),
        categoryName: CATEGORIES[code],
        item,
        kind,
        rank,
        unit: pick(row, 'unit'),
        codes: { item: itemCode, kind: kindCode, rank: rankCode },
        days: {
          d1: pick(row, 'day1'),
          d2: pick(row, 'day2'),
          d3: pick(row, 'day3'),
          d4: pick(row, 'day4'),
          d5: pick(row, 'day5'),
          d6: pick(row, 'day6'),
          d7: pick(row, 'day7'),
        },
        prices: {
          d1: toNumber(row.dpr1),
          d2: toNumber(row.dpr2),
          d3: toNumber(row.dpr3),
          d4: toNumber(row.dpr4),
          d5: toNumber(row.dpr5),
          d6: toNumber(row.dpr6),
          d7: toNumber(row.dpr7),
        },
      };
    })
    .filter(Boolean);
}

function guessRegday(items) {
  const today = ymd(new Date());
  const raw = items.find((it) => it.days.d1)?.days.d1 || '';
  return normalizeDate(raw, today) || today;
}

// ───────────────────────── 2) 기간별 이력 (품목별)

async function fetchPeriod(it, startday, endday, region) {
  const rows = await callKamis({
    action: 'periodProductList',
    p_productclscode: '01',
    p_startday: startday,
    p_endday: endday,
    p_itemcategorycode: it.category,
    p_itemcode: it.codes.item,
    p_kindcode: it.codes.kind,
    p_productrankcode: it.codes.rank || undefined,
    p_countrycode: region.code,
    p_convert_kg_yn: 'N',
  });
  if (!Array.isArray(rows)) return [];
  const county = (r) => pick(r, 'countyname', 'county_name');
  let picked = rows.filter((r) => county(r).includes(region.name));
  if (picked.length === 0) picked = rows.filter((r) => county(r).includes('평균'));
  if (picked.length === 0) picked = rows;
  return picked
    .map((r) => [normalizeDate(pick(r, 'regday', 'reg_date'), endday), toNumber(r.price)])
    .filter(([d, p]) => d && p != null);
}

// ───────────────────────── 3) 지역 하나 처리

async function processRegion(region, isDefault, now) {
  const suffix = isDefault ? '' : `.${region.code}`;

  const all = [];
  for (const code of Object.keys(CATEGORIES)) {
    try {
      all.push(...(await fetchCategory(code, region)));
    } catch (e) {
      console.error(`[${region.name}] 부류 ${code} 실패: ${e}`);
    }
    await sleep(150);
  }
  if (all.length === 0) return null;

  const regday = guessRegday(all);
  for (const it of all) {
    it.dates = {};
    for (const k of Object.keys(it.days)) it.dates[k] = k === 'd7' ? null : normalizeDate(it.days[k], regday);
  }

  // 이력 불러오기 (지역별 파일)
  let history = { updatedAt: '', series: {} };
  try {
    history = JSON.parse(await readFile(path.join(outDir, `history${suffix}.json`), 'utf8'));
    if (!history.series) history.series = {};
  } catch {
    /* 첫 실행 */
  }
  const series = history.series;
  const addPoint = (id, date, price) => {
    if (!date || price == null) return;
    const arr = (series[id] ||= []);
    const i = arr.findIndex((p) => p[0] === date);
    if (i >= 0) arr[i][1] = price;
    else arr.push([date, price]);
  };
  for (const it of all) for (const k of ['d1', 'd2', 'd3', 'd4', 'd5']) addPoint(it.id, it.dates[k], it.prices[k]);

  // 기간별 API 보충 (서울만)
  const cutoff = addDays(regday, -HISTORY_DAYS);
  let calls = 0;
  if (region.backfill) {
    const backfillStart = addDays(regday, -BACKFILL_DAYS);
    for (const it of all) {
      if (calls >= BACKFILL_MAX_CALLS) break;
      const recent = (series[it.id] || []).filter((p) => p[0] >= backfillStart);
      if (recent.length >= 15) continue;
      calls++;
      try {
        for (const [d, p] of await fetchPeriod(it, backfillStart, regday, region)) addPoint(it.id, d, p);
      } catch (e) {
        console.warn(`이력 보충 실패 (${it.item} ${it.kind}): ${e}`);
      }
      await sleep(200);
    }
  }

  const liveIds = new Set(all.map((it) => it.id));
  for (const id of Object.keys(series)) {
    if (!liveIds.has(id)) {
      delete series[id];
      continue;
    }
    series[id] = series[id].filter((p) => p[0] >= cutoff).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }

  const prices = {
    updatedAt: now,
    regday,
    region: region.name,
    regionCode: region.code,
    source: '한국농수산식품유통공사 KAMIS 농산물유통정보 (공공누리 제1유형)',
    items: all,
  };
  const hist = { updatedAt: now, regday, region: region.name, series };
  const files = [`prices${suffix}.json`, `history${suffix}.json`];
  await writeFile(path.join(outDir, files[0]), JSON.stringify(prices), 'utf8');
  await writeFile(path.join(outDir, files[1]), JSON.stringify(hist), 'utf8');
  if (isDefault) {
    // 서울은 코드 붙은 이름으로도 한 벌 더 (앱이 어느 쪽으로 요청해도 되게)
    await writeFile(path.join(outDir, `prices.${region.code}.json`), JSON.stringify(prices), 'utf8');
    await writeFile(path.join(outDir, `history.${region.code}.json`), JSON.stringify(hist), 'utf8');
  }
  const pointCount = Object.values(series).reduce((s, a) => s + a.length, 0);
  return `${region.name} ${all.length}건 (조사일 ${regday}, 이력 ${pointCount}점${calls ? `, 보충 ${calls}회` : ''})`;
}

// ───────────────────────── main

async function main() {
  await mkdir(outDir, { recursive: true });
  const now = new Date().toISOString();
  const summary = [];

  for (const region of REGIONS) {
    const isDefault = region === REGIONS[0];
    const line = await processRegion(region, isDefault, now);
    if (!line) {
      console.error(`[${region.name}] 가져온 데이터가 없습니다. 인증키/아이디 또는 KAMIS 서버 상태를 확인하세요.`);
      if (isDefault) process.exit(2);
      continue;
    }
    console.log(line);
    summary.push(line);
  }

  await writeFile(path.join(outDir, '.nojekyll'), '', 'utf8');
  await writeFile(
    path.join(outDir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>today-market data</title><p>updated: ${now}</p><ul>${summary
      .map((l) => `<li>${l}</li>`)
      .join('')}</ul><p><a href="prices.json">prices.json</a> · <a href="history.json">history.json</a> · <a href="push.json">push.json</a></p>`,
    'utf8',
  );
  console.log('저장 완료:', outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

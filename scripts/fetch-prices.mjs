/**
 * 공공데이터포털(data.go.kr) 기반 수집 스크립트.
 *
 *   node scripts/fetch-prices.mjs <출력폴더>
 *   env: DATA_GO_KR_KEY (공공데이터포털 일반 인증키), FOODSAFETY_KEY (식품안전나라 keyId, 없으면 회수정보 생략)
 *
 * 만들어지는 파일
 *   prices.json / prices.<지역코드>.json    오늘 가격 + 어제·1주·2주·1개월·1년 전 비교 (서울은 접미사 없는 파일도)
 *   history.json / history.<지역코드>.json  최근 40일 일별 가격 (그래프용)
 *   recalls.json                           식약처 회수·판매중지 최근 30건
 *
 * 데이터 출처
 *   - 한국농수산식품유통공사_지역별 품목별 도,소매 가격정보 조회 (apis.data.go.kr/B552845/perRegion/price)
 *     지역·날짜 범위만 주면 전 품목이 한 번에 옵니다. 품목당 호출이 필요 없습니다.
 *   - 식품의약품안전처 식품 회수·판매중지 정보 I0490 (openapi.foodsafetykorea.go.kr)
 *
 * 호출량(하루 1회 기준): 지역 7 × (40일 범위 ~8페이지 + 1년 전 1페이지) ≈ 63회 + 회수정보 1회. 개발계정 한도 10,000회.
 * 키는 절대 코드에 넣지 않습니다. 로컬은 .env, GitHub Actions는 Secrets.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.DATA_GO_KR_KEY;
const FOOD_KEY = process.env.FOODSAFETY_KEY;
const outDir = process.argv[2] || 'out';

if (!KEY) {
  console.error('DATA_GO_KR_KEY 환경변수가 필요합니다. (README 참고)');
  process.exit(1);
}

const PRICE_API = 'https://apis.data.go.kr/B552845/perRegion/price';
const RECALL_API = 'http://openapi.foodsafetykorea.go.kr/api';

// 소매 시군구코드. 앱의 src/lib/config.ts REGIONS 와 같아야 합니다. 첫 번째(서울)가 기본.
const REGIONS = [
  { code: '1101', name: '서울' },
  { code: '3111', name: '수원' },
  { code: '3112', name: '성남' },
  { code: '2300', name: '인천' },
  { code: '2100', name: '부산' },
  { code: '2200', name: '대구' },
  { code: '2401', name: '광주' },
  { code: '2501', name: '대전' },
  { code: '2601', name: '울산' },
  { code: '2701', name: '세종' },
  { code: '3211', name: '춘천' },
  { code: '3214', name: '강릉' },
  { code: '3311', name: '청주' },
  { code: '3411', name: '천안' },
  { code: '3511', name: '전주' },
  { code: '3613', name: '순천' },
  { code: '3711', name: '포항' },
  { code: '3714', name: '안동' },
  { code: '3814', name: '창원' },
  { code: '3911', name: '제주' },
];
const HISTORY_DAYS = 40;
const SOURCE = '한국농수산식품유통공사 농산물유통정보 (공공데이터포털, 공공누리 제1유형)';

// ───────────────────────── 유틸

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const compact = (s) => s.replace(/-/g, ''); // 2026-09-18 → 20260918
const dashed = (s) => (s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s);
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
const toNumber = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
      return JSON.parse(text);
    } catch (e) {
      if (i === tries) throw e;
      await sleep(800 * i);
    }
  }
}

// ───────────────────────── 1) 지역별 소매가격 (날짜 범위, 전 품목)

async function fetchRegionRange(region, from, to) {
  const rows = [];
  let page = 1;
  for (;;) {
    const u = new URL(PRICE_API);
    u.searchParams.set('serviceKey', KEY);
    u.searchParams.set('pageNo', String(page));
    u.searchParams.set('numOfRows', '1000');
    u.searchParams.set('cond[exmn_ymd::GTE]', compact(from));
    u.searchParams.set('cond[exmn_ymd::LTE]', compact(to));
    u.searchParams.set('cond[se_cd::EQ]', '01'); // 01 소매, 02 중도매
    u.searchParams.set('cond[sgg_cd::EQ]', region.code);
    u.searchParams.set('returnType', 'JSON');
    const json = await getJson(u.toString());
    const header = json?.response?.header;
    if (header && header.resultCode !== '0' && header.resultCode !== '00') {
      throw new Error(`API 오류 ${header.resultCode} ${header.resultMsg}`);
    }
    const body = json?.response?.body;
    const items = body?.items?.item ?? [];
    rows.push(...items);
    const total = Number(body?.totalCount ?? 0);
    if (rows.length >= total || items.length === 0) break;
    page++;
    await sleep(120);
  }
  return rows;
}

/** 날짜 → 가격 맵에서 기준일 이전(포함) 가장 가까운 값. maxBack 일까지만 거슬러 봅니다. */
function nearestOnOrBefore(map, date, maxBack) {
  for (let i = 0; i <= maxBack; i++) {
    const d = addDays(date, -i);
    if (map.has(d)) return [d, map.get(d)];
  }
  return [null, null];
}

function buildRegion(region, rows, yearRows, now) {
  // id → { meta, map(date → avg price) }
  const byId = new Map();
  const add = (r, target) => {
    const id = `${r.ctgry_cd}-${r.item_cd}-${r.vrty_cd}-${r.grd_cd}`;
    let e = byId.get(id);
    if (!e) {
      const rank = (r.grd_nm ?? '').trim();
      e = {
        id,
        category: r.ctgry_cd,
        categoryName: r.ctgry_nm,
        item: (r.item_nm ?? '').trim(),
        kind: (r.vrty_nm ?? '').trim(),
        rank: rank === '-' ? '' : rank,
        unit: `${r.unit_sz ?? ''}${r.unit ?? ''}`,
        codes: { item: r.item_cd, kind: r.vrty_cd, rank: r.grd_cd },
        map: new Map(),
        yearMap: new Map(),
      };
      byId.set(id, e);
    }
    const price = toNumber(r.exmn_dd_avg_prc);
    if (price != null) e[target].set(dashed(r.exmn_ymd), price);
  };
  for (const r of rows) add(r, 'map');
  for (const r of yearRows) add(r, 'yearMap');

  // 지역 조사일 = 가장 최근 날짜
  const allDates = [...new Set(rows.map((r) => dashed(r.exmn_ymd)))].sort();
  const regday = allDates[allDates.length - 1];
  const cutoff = addDays(regday, -HISTORY_DAYS);

  const items = [];
  const series = {};
  for (const e of byId.values()) {
    const [d1, p1] = nearestOnOrBefore(e.map, regday, 3);
    if (!d1) continue; // 최근 3일 안에 조사값이 없는 품목은 제외
    // 어제 = d1 이전의 가장 가까운 조사일
    let d2 = null;
    let p2 = null;
    for (let i = 1; i <= 7; i++) {
      const d = addDays(d1, -i);
      if (e.map.has(d)) {
        d2 = d;
        p2 = e.map.get(d);
        break;
      }
    }
    const [d3, p3] = nearestOnOrBefore(e.map, addDays(d1, -7), 4);
    const [d4, p4] = nearestOnOrBefore(e.map, addDays(d1, -14), 4);
    const [d5, p5] = nearestOnOrBefore(e.map, addDays(d1, -30), 6);
    const [d6, p6] = nearestOnOrBefore(e.yearMap, addDays(d1, -365), 6);

    items.push({
      id: e.id,
      category: e.category,
      categoryName: e.categoryName,
      item: e.item,
      kind: e.kind,
      rank: e.rank,
      unit: e.unit,
      codes: e.codes,
      days: { d1, d2: d2 ?? '', d3: d3 ?? '', d4: d4 ?? '', d5: d5 ?? '', d6: d6 ?? '', d7: '' },
      dates: { d1, d2, d3, d4, d5, d6, d7: null },
      prices: { d1: p1, d2: p2, d3: p3, d4: p4, d5: p5, d6: p6, d7: null }, // d7 평년: 이 API엔 없음
    });
    series[e.id] = [...e.map.entries()]
      .filter(([d]) => d >= cutoff)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  items.sort((a, b) => a.id.localeCompare(b.id));

  return {
    prices: { updatedAt: now, regday, region: region.name, regionCode: region.code, source: SOURCE, items },
    history: { updatedAt: now, regday, region: region.name, series },
  };
}

// ───────────────────────── 2) 식약처 회수·판매중지

async function fetchRecalls() {
  if (!FOOD_KEY) {
    console.log('FOODSAFETY_KEY 없음 → recalls.json 생략');
    return null;
  }
  const json = await getJson(`${RECALL_API}/${FOOD_KEY}/I0490/json/1/60`);
  const rows = json?.I0490?.row ?? [];
  const items = rows
    .map((r) => ({
      seq: r.RTRVLDSUSE_SEQ,
      name: r.PRDTNM,
      reason: r.RTRVLPRVNS,
      company: r.BSSHNM,
      category: r.PRDLST_CD_NM,
      type: r.PRDLST_TYPE,
      grade: r.RTRVL_GRDCD_NM,
      unit: r.FRMLCUNIT,
      expiry: r.DISTBTMLMT,
      made: r.MNFDT,
      barcode: r.BRCDNO,
      image: (r.IMG_FILE_PATH || '').split(',')[0].trim() || null,
      date: (r.CRET_DTM || '').slice(0, 10),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30);
  return { updatedAt: new Date().toISOString(), source: '식품의약품안전처 식품안전나라 회수·판매중지 정보', items };
}

// ───────────────────────── main

async function main() {
  await mkdir(outDir, { recursive: true });
  const now = new Date().toISOString();
  const today = ymd(new Date());
  const from = addDays(today, -(HISTORY_DAYS + 3));
  const summary = [];

  for (const region of REGIONS) {
    const isDefault = region === REGIONS[0];
    try {
      const rows = await fetchRegionRange(region, from, today);
      if (rows.length === 0) throw new Error('응답 0건');
      const dates = [...new Set(rows.map((r) => dashed(r.exmn_ymd)))].sort();
      const regday = dates[dates.length - 1];
      const yearRows = await fetchRegionRange(region, addDays(regday, -371), addDays(regday, -365));
      const { prices, history } = buildRegion(region, rows, yearRows, now);

      const suffix = isDefault ? '' : `.${region.code}`;
      await writeFile(path.join(outDir, `prices${suffix}.json`), JSON.stringify(prices), 'utf8');
      await writeFile(path.join(outDir, `history${suffix}.json`), JSON.stringify(history), 'utf8');
      if (isDefault) {
        await writeFile(path.join(outDir, `prices.${region.code}.json`), JSON.stringify(prices), 'utf8');
        await writeFile(path.join(outDir, `history.${region.code}.json`), JSON.stringify(history), 'utf8');
      }
      const pts = Object.values(history.series).reduce((s, a) => s + a.length, 0);
      const line = `${region.name} ${prices.items.length}품목 (조사일 ${regday}, 이력 ${pts}점, 원본 ${rows.length}행)`;
      console.log(line);
      summary.push(line);
    } catch (e) {
      console.error(`[${region.name}] 실패: ${e}`);
      if (isDefault) process.exit(2);
    }
    await sleep(200);
  }

  try {
    const recalls = await fetchRecalls();
    if (recalls) {
      await writeFile(path.join(outDir, 'recalls.json'), JSON.stringify(recalls), 'utf8');
      console.log(`회수·판매중지 ${recalls.items.length}건`);
      summary.push(`회수·판매중지 ${recalls.items.length}건`);
    }
  } catch (e) {
    console.error(`회수정보 실패: ${e}`);
  }

  await writeFile(path.join(outDir, '.nojekyll'), '', 'utf8');
  await writeFile(
    path.join(outDir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>today-market data</title><p>updated: ${now}</p><ul>${summary
      .map((l) => `<li>${l}</li>`)
      .join('')}</ul><p><a href="prices.json">prices.json</a> · <a href="history.json">history.json</a> · <a href="recalls.json">recalls.json</a> · <a href="push.json">push.json</a></p>`,
    'utf8',
  );
  console.log('저장 완료:', outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

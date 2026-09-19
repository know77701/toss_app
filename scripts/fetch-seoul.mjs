/**
 * 서울 열린데이터광장 수집 → market.json (전통시장 가격), dining.json (개인서비스·외식 요금)
 *
 *   node scripts/fetch-seoul.mjs <출력폴더>
 *   env: SEOUL_OPENDATA_KEY (서울 열린데이터광장 인증키, 즉시 발급)
 *       SEOUL_DINING_SERVICE (선택) 개인서비스요금 API 서비스명. 모르면 dining.json 은 생략됩니다.
 *
 * 전통시장: ListNecessariesPricesService — 서울시 물가모니터가 자치구별 전통시장에서 매주 조사(화요일 갱신).
 *          최신순으로 오므로 앞에서 3,000행만 받아 가장 최근 조사 주만 씁니다.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.SEOUL_OPENDATA_KEY;
// 개인서비스요금(외식·이발 등). 현재 API가 60여 행(3월 조사)만 줘서 앱에는 싣지 않고 원본만 저장해 둡니다.
const DINING_SERVICE = process.env.SEOUL_DINING_SERVICE || 'IndividualServiceChargeService';
const outDir = process.argv[2] || 'out';
if (!KEY) {
  console.error('SEOUL_OPENDATA_KEY 환경변수가 필요합니다.');
  process.exit(1);
}
const BASE = `http://openapi.seoul.go.kr:8088/${KEY}/json`;

async function rows(service, start, end) {
  const res = await fetch(`${BASE}/${service}/${start}/${end}/`);
  const json = await res.json();
  const body = json[service];
  if (!body) throw new Error(`${service}: ${json?.RESULT?.CODE} ${json?.RESULT?.MESSAGE}`);
  return { total: body.list_total_count, rows: body.row ?? [] };
}

const toNumber = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function market() {
  const all = [];
  for (let s = 1; s <= 3000; s += 1000) {
    const { rows: r } = await rows('ListNecessariesPricesService', s, s + 999);
    all.push(...r);
    if (r.length < 1000) break;
  }
  const dates = [...new Set(all.map((r) => r.P_DATE))].sort();
  const latest = dates[dates.length - 1];
  // 최신 조사일 기준 7일 안의 행 (시장마다 조사 요일이 조금씩 다름)
  const from = new Date(`${latest}T00:00:00`);
  from.setDate(from.getDate() - 7);
  const fromStr = from.toISOString().slice(0, 10);
  const recent = all.filter((r) => r.P_DATE >= fromStr && r.M_TYPE_NAME === '전통시장');

  // 품목별 정리
  const byItem = new Map();
  for (const r of recent) {
    const price = toNumber(r.A_PRICE);
    if (price == null) continue;
    const key = r.PRDLST_CD || r.PRDLST_NM;
    if (!byItem.has(key)) byItem.set(key, { code: key, name: (r.PRDLST_NM || '').trim(), unit: (r.UNIT || '').trim(), rows: [] });
    byItem.get(key).rows.push({ market: r.M_NAME.trim(), gu: r.M_GU_NAME.trim(), price, spec: (r.SPCIES || '').trim(), date: r.P_DATE });
  }
  const items = [...byItem.values()]
    .map((it) => {
      const vals = it.rows.map((x) => x.price);
      const byGu = {};
      for (const x of it.rows) (byGu[x.gu] ||= []).push(x.price);
      const guAvg = Object.fromEntries(Object.entries(byGu).map(([g, arr]) => [g, Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)]));
      return {
        code: it.code,
        name: it.name,
        unit: it.unit,
        count: it.rows.length,
        min: Math.min(...vals),
        max: Math.max(...vals),
        avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        guAvg,
        cheapest: it.rows.sort((a, b) => a.price - b.price).slice(0, 8),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const out = {
    updatedAt: new Date().toISOString(),
    inspectDay: latest,
    region: '서울',
    source: '서울시 생필품 농수축산물 가격 정보 (서울 열린데이터광장)',
    markets: [...new Set(recent.map((r) => r.M_NAME.trim()))].length,
    items,
  };
  await writeFile(path.join(outDir, 'market.json'), JSON.stringify(out), 'utf8');
  console.log(`전통시장: 조사일 ${latest}, 시장 ${out.markets}곳, 품목 ${items.length}`);
}

async function dining() {
  if (!DINING_SERVICE) {
    console.log('SEOUL_DINING_SERVICE 미설정 → dining.json 생략');
    return;
  }
  const { rows: r } = await rows(DINING_SERVICE, 1, 1000);
  await writeFile(path.join(outDir, 'dining-raw.json'), JSON.stringify(r.slice(0, 50)), 'utf8');
  console.log(`개인서비스요금 원본 ${r.length}행 (필드: ${Object.keys(r[0] || {}).join(',')})`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await market();
  await dining();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

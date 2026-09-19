/**
 * 한국소비자원 참가격(생필품 가격) 수집 → mart[.지역코드].json
 *
 *   node scripts/fetch-mart.mjs <출력폴더>
 *   env: DATA_GO_KR_KEY (공공데이터포털 일반 인증키. "한국소비자원_생필품 가격 정보_GW" 활용신청 필요)
 *
 * 참가격은 전국 대형마트·SSM·백화점·편의점에서 생필품을 **격주 금요일**에 조사합니다.
 * API는 XML 만 주고, 가격 조회는 상품(goodId) 또는 매장(entpId) 하나씩만 됩니다.
 *
 * 수집 방식
 *   1) 최근 8주 안에서 데이터가 있는 가장 최근 금요일을 찾음
 *   2) 큰 매장 몇 곳의 그날 데이터로 "조사 중인 상품" 목록(≈330개)을 얻음
 *   3) 상품마다 1회 호출해 전국 매장 가격을 받음 (≈330회, 개발계정 한도 10,000회)
 *   4) 매장 주소로 시도를 나눠 지역별 파일로 저장. 앱의 REGIONS(서울·부산·대구·인천·광주·대전·울산)와 동일
 *
 * 키는 절대 코드에 넣지 않습니다.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.DATA_GO_KR_KEY;
const outDir = process.argv[2] || 'out';
if (!KEY) {
  console.error('DATA_GO_KR_KEY 환경변수가 필요합니다. (README 참고)');
  process.exit(1);
}

const BASE = 'https://apis.data.go.kr/B551919/ProductPriceInfoService';
const PRICE_TAG = 'iros.openapi.service.vo.goodPriceVO';
const STORE_TAG = 'iros.openapi.service.vo.entpInfoVO';

// 앱의 src/lib/config.ts REGIONS 와 같은 코드. 주소 앞글자로 매장을 나눕니다.
const REGIONS = [
  { code: '1101', name: '서울', prefix: ['서울'] },
  { code: '3111', name: '경기(수원)', prefix: ['경기'] },
  { code: '3112', name: '성남', prefix: ['경기도 성남', '경기 성남'] },
  { code: '2300', name: '인천', prefix: ['인천'] },
  { code: '2100', name: '부산', prefix: ['부산'] },
  { code: '2200', name: '대구', prefix: ['대구'] },
  { code: '2401', name: '광주', prefix: ['광주', '전남광주'] },
  { code: '2501', name: '대전', prefix: ['대전'] },
  { code: '2601', name: '울산', prefix: ['울산'] },
  { code: '2701', name: '세종', prefix: ['세종'] },
  { code: '3211', name: '강원(춘천)', prefix: ['강원'] },
  { code: '3214', name: '강릉', prefix: ['강원도 강릉', '강원 강릉', '강원특별자치도 강릉'] },
  { code: '3311', name: '충북(청주)', prefix: ['충북', '충청북도'] },
  { code: '3411', name: '충남(천안)', prefix: ['충남', '충청남도'] },
  { code: '3511', name: '전북(전주)', prefix: ['전북', '전라북도'] },
  { code: '3613', name: '전남(순천)', prefix: ['전라남도', '전남 '] },
  { code: '3711', name: '경북(포항)', prefix: ['경북', '경상북도'] },
  { code: '3714', name: '안동', prefix: ['경북 안동', '경상북도 안동'] },
  { code: '3814', name: '경남(창원)', prefix: ['경남', '경상남도'] },
  { code: '3911', name: '제주', prefix: ['제주'] },
];
const TYPE_NAME = { LM: '대형마트', SM: '기업형슈퍼', DP: '백화점', CS: '편의점', TM: '전통시장' };
// 매장 이름 앞부분 → 체인명
const CHAINS = [
  '이마트에브리데이', '이마트트레이더스', '이마트', '홈플러스익스프레스', '홈플러스', '롯데마트', '롯데슈퍼', 'GS더프레시', 'GS25',
  'CU', '세븐일레븐', '미니스톱', '이마트24', '현대백화점', '신세계백화점', '롯데백화점', '갤러리아', 'AK플라자', '메가마트',
  '하나로마트', '하나로클럽', '코스트코', '탑마트', '서원유통', '킴스클럽', '노브랜드',
];
const chainOf = (name) => {
  const clean = name.replace(/^\(주\)\s*/, '').replace(/^주식회사\s*/, '');
  const hit = CHAINS.find((c) => clean.startsWith(c));
  if (hit) return hit;
  const stripped = clean.replace(/\(.*$/, '').replace(/[가-힣]{1,3}점$/, '').trim();
  return stripped || clean || name;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (p, extra) => `${BASE}${p}?serviceKey=${encodeURIComponent(KEY)}&${extra}`;

/** 얕은 XML → 객체 배열 (참가격 응답은 중첩이 없어 정규식으로 충분) */
function parse(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}>([^]*?)</${tag}>`, 'g'))].map((m) => {
    const o = {};
    for (const f of m[1].matchAll(/<([A-Za-z_.]+)>([^<]*)<\/\1>/g)) o[f[1]] = f[2].trim();
    return o;
  });
}

/** 호출. 429(초당 호출 제한)면 점점 길게 쉬었다가 재시도 */
async function getXml(p, extra, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(q(p, extra));
      const text = await res.text();
      if (res.status === 429) {
        // returnReasonCode 22 = 일일 요청 한도 초과 → 오늘은 더 못 부르므로 즉시 중단 (기존 파일 유지)
        if (/returnReasonCode>22</.test(text)) throw Object.assign(new Error('일일 요청 한도 초과 (내일 자정 이후 재시도)'), { fatal: true });
        throw Object.assign(new Error('HTTP 429'), { retryable: true });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const code = (text.match(/<resultCode>(\d+)<\/resultCode>/) || [])[1];
      if (code && code !== '00') throw new Error(`resultCode ${code} ${(text.match(/<resultMsg>([^<]*)/) || [])[1] || ''}`);
      return text;
    } catch (e) {
      if (e.fatal || i === tries) throw e;
      await sleep(e.retryable ? 2500 * i : 700 * i);
    }
  }
}

/**
 * 카탈로그 페이징. 이 API는 numOfRows 를 무시하고 한 페이지에 전부 주는 경우가 있어서
 * id 기준으로 중복을 걸러내고, 새 행이 없으면 멈춥니다.
 */
async function pageAll(p, extra, tag, idKey) {
  const out = [];
  const seen = new Set();
  for (let page = 1; page <= 40; page++) {
    const rows = parse(await getXml(p, `${extra}&numOfRows=500&pageNo=${page}`), tag);
    let added = 0;
    for (const r of rows) {
      const k = r[idKey];
      if (k && seen.has(k)) continue;
      if (k) seen.add(k);
      out.push(r);
      added++;
    }
    if (rows.length < 500 || added === 0) break;
    await sleep(300);
  }
  return out;
}

const pad2 = (n) => String(n).padStart(2, '0');
const ymdCompact = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
const dashed = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

function lastFridays(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 2) % 7; // 금요일(5)까지 되돌림
  d.setDate(d.getDate() - back);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(ymdCompact(d));
    d.setDate(d.getDate() - 7);
  }
  return out;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const now = new Date().toISOString();

  // 매장·상품 카탈로그
  const storesRaw = await pageAll('/getStoreInfoSvc.do', '', STORE_TAG, 'entpId');
  await sleep(400);
  const prodsRaw = await pageAll('/getProductInfoSvc.do', '', 'item', 'goodId');
  await sleep(400);
  console.log(`카탈로그: 매장 ${storesRaw.length}, 상품 ${prodsRaw.length}`);
  const storeById = new Map(storesRaw.map((s) => [s.entpId, s]));
  const prodById = new Map(prodsRaw.map((p) => [p.goodId, p]));

  // 지역별 매장 (주소 앞글자)
  const regionOfStore = (s) => {
    const addr = s.plmkAddrBasic || s.roadAddrBasic || '';
    return REGIONS.find((r) => r.prefix.some((p) => addr.startsWith(p)))?.code ?? null;
  };

  // 최근 조사일 찾기: 서울 대형마트 하나로 시도
  const probeStore = storesRaw.find((s) => s.entpTypeCode === 'LM' && regionOfStore(s) === '1101') || storesRaw[0];
  let inspectDay = null;
  let probeRows = [];
  for (const day of lastFridays(8)) {
    probeRows = parse(await getXml('/getProductPriceInfoSvc', `goodInspectDay=${day}&entpId=${probeStore.entpId}&numOfRows=2000&pageNo=1`), PRICE_TAG);
    if (probeRows.length > 0) {
      inspectDay = day;
      break;
    }
    await sleep(400);
  }
  if (!inspectDay) throw new Error('최근 8주 안에 조사 데이터가 없습니다.');
  console.log(`조사일 ${dashed(inspectDay)} (탐색 매장 ${probeStore.entpName}, ${probeRows.length}상품)`);

  // 조사 중인 상품 목록: 유형별 매장 몇 곳의 합집합
  const goodIds = new Set(probeRows.map((r) => r.goodId));
  for (const type of ['SM', 'DP', 'CS']) {
    const s = storesRaw.find((x) => x.entpTypeCode === type && regionOfStore(x) === '1101');
    if (!s) continue;
    const rows = parse(await getXml('/getProductPriceInfoSvc', `goodInspectDay=${inspectDay}&entpId=${s.entpId}&numOfRows=2000&pageNo=1`), PRICE_TAG);
    for (const r of rows) goodIds.add(r.goodId);
    await sleep(400);
  }
  console.log(`조사 상품 ${goodIds.size}개 → 상품별 전국 가격 수집`);

  // 상품별 전국 가격 (동시 5개)
  const priceRows = []; // {goodId, entpId, price}
  const queue = [...goodIds];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const goodId = queue.shift();
      try {
        const rows = parse(await getXml('/getProductPriceInfoSvc', `goodInspectDay=${inspectDay}&goodId=${goodId}&numOfRows=2000&pageNo=1`), PRICE_TAG);
        for (const r of rows) {
          const price = Number(r.goodPrice);
          if (Number.isFinite(price) && price > 0) priceRows.push({ goodId, entpId: r.entpId, price });
        }
      } catch (e) {
        if (e.fatal) throw e;
        console.warn(`goodId ${goodId} 실패: ${e}`);
      }
      done++;
      if (done % 50 === 0) console.log(`  ${done}/${goodIds.size}`);
      await sleep(250); // 초당 호출 제한(429) 회피
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker));
  console.log(`가격 행 ${priceRows.length}`);
  if (priceRows.length === 0) {
    console.error('가격 데이터가 0건이라 파일을 덮어쓰지 않습니다.');
    process.exit(3);
  }

  // 지역별 파일
  const summary = [];
  for (const region of REGIONS) {
    const isDefault = region === REGIONS[0];
    const rows = priceRows.filter((r) => regionOfStore(storeById.get(r.entpId) || {}) === region.code);
    const storeIds = [...new Set(rows.map((r) => r.entpId))];
    const stores = storeIds.map((id) => {
      const s = storeById.get(id);
      return { id, name: s.entpName, chain: chainOf(s.entpName), type: s.entpTypeCode, typeName: TYPE_NAME[s.entpTypeCode] || s.entpTypeCode };
    });
    const idx = new Map(storeIds.map((id, i) => [id, i]));

    const byGood = new Map();
    for (const r of rows) {
      if (!byGood.has(r.goodId)) byGood.set(r.goodId, []);
      byGood.get(r.goodId).push([idx.get(r.entpId), r.price]);
    }
    const products = [];
    for (const [goodId, prices] of byGood) {
      const p = prodById.get(goodId) || { goodName: `상품 ${goodId}` };
      const vals = prices.map((x) => x[1]);
      const byChain = {};
      for (const [si, price] of prices) {
        const c = stores[si].chain;
        (byChain[c] ||= []).push(price);
      }
      const chainAvg = Object.fromEntries(Object.entries(byChain).map(([c, arr]) => [c, Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)]));
      products.push({
        id: goodId,
        name: p.goodName,
        unit: p.detailMean || '',
        cls: (p.goodSmlclsCode || '').slice(0, 4),
        prices: prices.sort((a, b) => a[1] - b[1]),
        min: Math.min(...vals),
        max: Math.max(...vals),
        avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        chainAvg,
      });
    }
    products.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    const out = {
      updatedAt: now,
      inspectDay: dashed(inspectDay),
      region: region.name,
      regionCode: region.code,
      source: '한국소비자원 참가격 생필품 가격정보 (공공데이터포털)',
      stores,
      products,
    };
    const suffix = isDefault ? '' : `.${region.code}`;
    await writeFile(path.join(outDir, `mart${suffix}.json`), JSON.stringify(out), 'utf8');
    if (isDefault) await writeFile(path.join(outDir, `mart.${region.code}.json`), JSON.stringify(out), 'utf8');
    const line = `${region.name} 매장 ${stores.length} · 상품 ${products.length}`;
    console.log(line);
    summary.push(line);
  }
  console.log('저장 완료:', outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 참가격 매장 주소 → 좌표 (카카오 로컬 API). 결과를 stores-geo.json 에 누적 저장합니다.
 *
 *   node scripts/geocode-stores.mjs <출력폴더>
 *   env: KAKAO_REST_KEY (카카오 개발자 REST API 키, 하루 10만 회 무료)
 *
 * - <출력폴더>/mart*.json 에 등장하는 매장만 대상. 이미 좌표가 있는 매장은 건너뜁니다(호출 절약).
 * - 주소 검색이 안 되면 "매장명" 키워드 검색으로 한 번 더 시도합니다.
 * - 앱은 이 파일의 좌표로만 거리를 계산하고, 카카오 API 는 절대 앱에서 직접 부르지 않습니다.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.KAKAO_REST_KEY;
const DATA_KEY = process.env.DATA_GO_KR_KEY;
const outDir = process.argv[2] || 'out';
if (!KEY) {
  console.error('KAKAO_REST_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const headers = { Authorization: `KakaoAK ${KEY}` };

async function kakao(pathname, query) {
  const u = new URL(`https://dapi.kakao.com/v2/local/search/${pathname}.json`);
  u.searchParams.set('query', query);
  u.searchParams.set('size', '1');
  const res = await fetch(u, { headers });
  if (!res.ok) throw new Error(`kakao HTTP ${res.status}`);
  const json = await res.json();
  return json.documents?.[0] ?? null;
}

/** 참가격 매장 카탈로그(주소)를 다시 받아옵니다. 주소는 mart.json 에 안 넣어 두므로 여기서 조회 */
async function storeAddresses() {
  if (!DATA_KEY) return new Map();
  const u = `https://apis.data.go.kr/B551919/ProductPriceInfoService/getStoreInfoSvc.do?serviceKey=${encodeURIComponent(DATA_KEY)}&numOfRows=500&pageNo=1`;
  const xml = await (await fetch(u)).text();
  const map = new Map();
  for (const m of xml.matchAll(/<iros\.openapi\.service\.vo\.entpInfoVO>([^]*?)<\/iros\.openapi\.service\.vo\.entpInfoVO>/g)) {
    const o = {};
    for (const f of m[1].matchAll(/<([A-Za-z_.]+)>([^<]*)<\/\1>/g)) o[f[1]] = f[2].trim();
    map.set(o.entpId, o);
  }
  return map;
}

async function main() {
  const geoPath = path.join(outDir, 'stores-geo.json');
  let geo = {};
  try {
    geo = JSON.parse(await readFile(geoPath, 'utf8'));
  } catch {
    /* 첫 실행 */
  }

  const files = (await readdir(outDir)).filter((f) => /^mart(\.\d+)?\.json$/.test(f));
  const stores = new Map();
  for (const f of files) {
    const j = JSON.parse(await readFile(path.join(outDir, f), 'utf8'));
    for (const s of j.stores ?? []) stores.set(s.id, s);
  }
  const todo = [...stores.values()].filter((s) => !geo[s.id]);
  console.log(`매장 ${stores.size}곳 중 좌표 없는 곳 ${todo.length}`);
  if (todo.length === 0) return finish(geo, geoPath);

  const addr = await storeAddresses();
  let ok = 0;
  for (const s of todo) {
    const a = addr.get(s.id);
    let hit = null;
    try {
      const road = a?.roadAddrBasic || '';
      const plmk = a?.plmkAddrBasic || '';
      if (road) hit = await kakao('address', road);
      if (!hit && plmk) hit = await kakao('address', plmk.replace(/^전남광주/, '광주'));
      if (!hit) hit = await kakao('keyword', s.name);
    } catch (e) {
      console.warn(`${s.name}: ${e}`);
    }
    if (hit) {
      geo[s.id] = [Number(hit.y), Number(hit.x)]; // [lat, lng]
      ok++;
    } else {
      geo[s.id] = null; // 못 찾은 매장도 기록해 다음에 다시 부르지 않음
    }
    await sleep(60);
  }
  console.log(`좌표 찾음 ${ok}/${todo.length}`);
  await finish(geo, geoPath);
}

async function finish(geo, geoPath) {
  await writeFile(geoPath, JSON.stringify({ updatedAt: new Date().toISOString(), source: '카카오 로컬 API 지오코딩', geo }), 'utf8');
  console.log('저장 완료:', geoPath, Object.values(geo).filter(Boolean).length, '개 좌표');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

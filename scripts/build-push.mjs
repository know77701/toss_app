/**
 * 오늘 보낼 푸시 문구를 만들어 push.json 으로 저장합니다. (발송은 하지 않음)
 *
 *   node scripts/build-push.mjs out        → out/push.json
 *
 * 규칙(앱인토스 스마트발송 템플릿): 제목 7자 이내 명사형, 본문 25자 이내 '~요.' 체.
 * 문구는 콘솔에서 템플릿으로 검수받아야 실제 발송이 됩니다. 이 파일은
 *   - 콘솔 정기 발송에 붙여넣을 오늘 문구
 *   - scripts/send-push.mjs 가 읽는 템플릿 변수(context)
 * 두 가지로 씁니다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outDir = process.argv[2] || 'out';
const APP_SCHEME = 'intoss://todaymarketprice';

// 푸시에 쓸 만한 "누구나 아는" 품목. 앱의 POPULAR 와 같은 순서.
const POPULAR = ['계란', '삼겹살', '쌀', '양파', '대파', '사과', '배추', '닭고기', '감자', '등심', '목살', '깐마늘', '토마토', '바나나', '고등어', '오이', '무', '상추', '애호박', '감귤', '배', '딸기', '오징어', '김', '시금치', '당근', '고구마'];

function label(it) {
  const hit = POPULAR.find((p) => it.item.includes(p) || it.kind.includes(p));
  if (hit) return hit === '등심' ? '소고기 등심' : hit === '목살' ? '돼지 목살' : hit;
  return it.kind && it.kind !== it.item ? `${it.item} ${it.kind}` : it.item;
}

function josa(word, a, b) {
  // 받침 유무에 따라 이/가, 은/는 선택
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasJong = code >= 0 && code < 11172 && code % 28 !== 0;
  return hasJong ? a : b;
}

const prices = JSON.parse(await readFile(path.join(outDir, 'prices.json'), 'utf8'));

const candidates = prices.items
  .filter((it) => it.prices.d1 != null && it.prices.d2 != null && it.prices.d2 > 0)
  .map((it) => ({ it, pct: ((it.prices.d1 - it.prices.d2) / it.prices.d2) * 100 }))
  .filter((x) => Math.abs(x.pct) >= 1)
  // 잘 아는 품목을 우선, 그다음 변동폭
  .sort((a, b) => {
    const pa = POPULAR.findIndex((p) => a.it.item.includes(p) || a.it.kind.includes(p));
    const pb = POPULAR.findIndex((p) => b.it.item.includes(p) || b.it.kind.includes(p));
    const ra = pa < 0 ? 99 : pa;
    const rb = pb < 0 ? 99 : pb;
    if (ra !== rb) return ra - rb;
    return Math.abs(b.pct) - Math.abs(a.pct);
  });

let push;
if (candidates.length === 0) {
  push = {
    date: prices.regday,
    title: '오늘 물가',
    body: '오늘 장바구니 물가가 나왔어요.',
    deeplink: APP_SCHEME,
    item: null,
  };
} else {
  // 변동폭이 큰 인기 품목 1개를 고릅니다. (인기 순위 상위 8개 중 최대 변동)
  const top = candidates.slice(0, 8).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
  const name = label(top.it);
  const dir = top.pct > 0 ? '올랐어요' : '내렸어요';
  const body = `${name}${josa(name, '이', '가')} 어제보다 ${Math.abs(top.pct).toFixed(0)}% ${dir}.`;
  push = {
    date: prices.regday,
    title: '오늘 물가',
    body: body.length <= 25 ? body : body.slice(0, 24) + '.',
    deeplink: `${APP_SCHEME}?item=${encodeURIComponent(top.it.id)}`,
    item: { id: top.it.id, name, pct: Number(top.pct.toFixed(1)), price: top.it.prices.d1, unit: top.it.unit },
    // send-push.mjs 가 템플릿 변수로 넘기는 값. 템플릿 문구 예) "#{name}#{josa} 어제보다 #{pct}% #{dir}."
    context: { name, josa: josa(name, '이', '가'), pct: Math.abs(top.pct).toFixed(0), dir },
  };
}

await writeFile(path.join(outDir, 'push.json'), JSON.stringify(push, null, 2), 'utf8');
console.log(`push.json: [${push.title}] ${push.body} → ${push.deeplink}`);

/**
 * 앱인토스 기능성 메시지(푸시) 대량 발송 스크립트.
 *
 * ⚠️ 실제로 보내려면 아래가 모두 준비돼야 합니다. 하나라도 없으면 이 스크립트는 동작하지 않습니다.
 *   1. 사업자 등록 + 콘솔 사업자 정보 승인
 *   2. 콘솔에서 발급한 mTLS 클라이언트 인증서 (cert.pem, key.pem)
 *   3. 콘솔에서 검수 승인된 메시지 템플릿 코드 (templateSetCode)
 *      템플릿 문구 예) 제목 "오늘 물가" / 본문 "#{name}#{josa} 어제보다 #{pct}% #{dir}."
 *   4. 수신자 목록: userKey(토스 로그인) 또는 anonKey 배열 JSON 파일
 *      → 로그인 없는 이 앱은 사용자 키를 모을 서버가 없으므로, 먼저 토스 로그인 + 키 저장소(예: Cloudflare Workers KV)를 붙여야 합니다.
 *
 * 사용법:
 *   TOSS_CERT=./cert.pem TOSS_KEY=./key.pem TEMPLATE_SET_CODE=xxxx \
 *   node scripts/send-push.mjs out/push.json subscribers.json
 *
 * API: POST https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/messenger/send-bulk-message
 *      본문 { templateSetCode, contextList: [{ userKey | anonKey, context }] }  (1회 50~2,500건)
 */
import https from 'node:https';
import { readFile } from 'node:fs/promises';

const [pushPath = 'out/push.json', subsPath = 'subscribers.json'] = process.argv.slice(2);
const { TOSS_CERT, TOSS_KEY, TEMPLATE_SET_CODE, DRY_RUN } = process.env;

if (!TOSS_CERT || !TOSS_KEY || !TEMPLATE_SET_CODE) {
  console.error('TOSS_CERT, TOSS_KEY, TEMPLATE_SET_CODE 환경변수가 필요합니다. (파일 상단 주석 참고)');
  process.exit(1);
}

const push = JSON.parse(await readFile(pushPath, 'utf8'));
const subscribers = JSON.parse(await readFile(subsPath, 'utf8')); // [{ userKey } | { anonKey }, ...]
if (!push.context) {
  console.log('오늘은 보낼 변동 품목이 없습니다. 발송 생략.');
  process.exit(0);
}
if (subscribers.length < 50) {
  console.error(`대량 발송은 최소 50건입니다. 현재 ${subscribers.length}건. (50건 미만이면 send-message 로 개별 발송)`);
  process.exit(1);
}

const cert = await readFile(TOSS_CERT);
const key = await readFile(TOSS_KEY);

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        host: 'apps-in-toss-api.toss.im',
        path: '/api-partner/v1/apps-in-toss/messenger/send-bulk-message',
        method: 'POST',
        cert,
        key,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(buf) });
          } catch {
            resolve({ status: res.statusCode, json: { raw: buf } });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

let sent = 0;
for (let i = 0; i < subscribers.length; i += 2500) {
  const chunk = subscribers.slice(i, i + 2500);
  const body = {
    templateSetCode: TEMPLATE_SET_CODE,
    contextList: chunk.map((s) => ({ ...s, context: push.context })),
  };
  if (DRY_RUN) {
    console.log(`[DRY_RUN] ${chunk.length}건`, JSON.stringify(body).slice(0, 300));
    continue;
  }
  const { status, json } = await post(body);
  if (status !== 200 || json.resultType !== 'SUCCESS') {
    console.error('발송 실패', status, json);
    process.exit(2);
  }
  sent += json.success?.msgCount ?? chunk.length;
  console.log(`발송 ${i + chunk.length}/${subscribers.length}`);
}
console.log(`완료: ${sent}건 · "${push.body}"`);

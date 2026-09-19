# 오늘의 장바구니 물가 — 앱인토스 미니앱

계란·삼겹살·쌀·양파처럼 사람들이 많이 사는 품목의 **오늘 서울 소매가격**과 어제 대비 등락을 보여주는 앱입니다.
품목을 누르면 그 자리에서 최근 1주 그래프가 펼쳐지고, "1개월 추이와 비교표 보기"를 누르면 상세 화면으로 갑니다.
데이터는 공공데이터포털(한국농수산식품유통공사 지역별 소매가격 API)에서 하루 2번 자동 수집하고, 식약처 회수·판매중지 정보도 같이 받아, 앱은 로그인 없이 동작하며, 수익은 앱인토스 인앱 광고(배너·전면·보상형)입니다.

**데이터 파일**
- `prices.json` 서울 오늘 가격 + 어제·1주·2주·1개월·1년 전. 다른 지역은 `prices.<지역코드>.json` (부산 2100, 대구 2200, 인천 2300, 광주 2401, 대전 2501, 울산 2601). 평년 값은 이 API에 없어 비교표에서 빠집니다.
- `history.json` / `history.<지역코드>.json` 최근 40일 일별 가격. 날짜 범위로 한 번에 받으므로 첫날부터 그래프가 채워집니다.
- `mart.json` / `mart.<지역코드>.json` 한국소비자원 참가격 생필품(≈330개) 매장별 가격. 격주 금요일 조사
- `recalls.json` 식약처 회수·판매중지 최근 30건
- `push.json` 오늘 보낼 푸시 문구 1개 (제목·본문·딥링크)

**비용**: 공공데이터포털·식품안전나라 API 무료, GitHub Actions·Pages 공개 저장소 무료, 앱인토스 콘솔·광고 SDK 무료. **돈 드는 건 없습니다.** 하루 호출은 농산물 약 65회 + 참가격 약 350회, 개발계정 한도 10,000회.

**조회 시 API 호출 없음**: 사용자가 앱을 열 때는 GitHub Pages 의 JSON 만 읽고, 그마저도 기기에 6시간 캐시합니다. 외부 API는 GitHub Actions 배치만 호출합니다. 앱인토스는 서버 DB를 제공하지 않아서(공식 문서: 로컬 Storage 또는 Supabase·Firebase 권장) 정적 JSON 을 저장소로 씁니다.

**지역 전환과 보상형 광고**: 서울은 항상 무료, 다른 지역은 보상형 광고를 끝까지 보면 24시간 동안 전체 지역이 열립니다. 상단 "서울 ▾" 버튼에서 고릅니다.

**딥링크** (푸시에서 특정 품목으로 보낼 때)
- `intoss://todaymarketprice?item=<id>` 해당 품목이 펼쳐진 목록
- `intoss://todaymarketprice?item=<id>&view=detail` 해당 품목 상세
- `intoss://todaymarketprice?tab=mart` 마트 생필품 탭
- id는 `prices.json` 의 `items[].id` (예: 계란 `500-4501-01-`)

`@apps-in-toss/web-framework` **3.4.1** 기준으로 작성·빌드 검증했습니다. (`npm run build` 로 `todaymarketprice.ait` 생성 확인)

```
today-market/
├─ apps-in-toss.config.ts     앱인토스 설정 (appName, 색상, 네비바)  ※ 3.x는 이 파일명이어야 함
├─ src/
│  ├─ App.tsx                 화면 3개: 리스트 / 상세 / 설정
│  ├─ lib/config.ts           ★ 인기 품목 순서, 광고 빈도, 즐겨찾기 칸 수 — 여기만 고치면 됨
│  ├─ lib/data.ts             데이터 로드, 정렬, 등락 계산
│  ├─ lib/ads.ts              배너 / 전면형 / 보상형 훅
│  └─ lib/toss.ts             뒤로가기 · 닫기 (토스 밖 브라우저에서도 안 죽게 감쌈)
├─ scripts/fetch-prices.mjs   공공데이터포털 → prices/history/recalls.json 수집 스크립트
├─ scripts/fetch-mart.mjs     한국소비자원 참가격 → mart.json (마트 생필품) 수집 스크립트
├─ .github/workflows/fetch-prices.yml   하루 2번 자동 수집 → GitHub Pages
├─ public/data/prices.json    개발용 샘플 데이터 (실제 값 아님)
└─ docs/
   ├─ console-registration.md 콘솔에 붙여넣을 앱 이름·소개·심사 메모
   ├─ privacy-policy.md       개인정보 처리방침
   └─ icon-600.png            임시 아이콘 (600×600)
```

---

## 올리는 순서 (총 5~7일, 사업자 없이 시작 가능)

### 0일차 — 계정·키 (30분, 승인 대기는 하루 이상 걸릴 수 있음)

1. **공공데이터포털 키**: https://www.data.go.kr 가입 → "한국농수산식품유통공사_지역별 품목별 도,소매 가격정보 조회" 와 "한국소비자원_생필품 가격 정보_GW" 두 개 활용신청(자동승인) → 마이페이지에서 일반 인증키(Decoding). **식품안전나라 키**: https://www.foodsafetykorea.go.kr 가입 → OpenAPI 이용신청 → I0490 회수·판매중지 → keyId.
2. **앱인토스 콘솔**: https://developers-apps-in-toss.toss.im 에서 콘솔 진입 → 워크스페이스 생성. 사업자 없이 만들 수 있습니다.
3. **GitHub 저장소** 하나 만듭니다(공개 저장소여야 Pages가 무료). 이 폴더를 그대로 push.

### 1일차 — 로컬에서 띄우기

```bash
cd today-market
npm install
npm run dev                 # 터미널에 뜨는 주소를 브라우저에서 열어 확인 (광고는 토스 밖에서 안 뜸)
```

브라우저에서 리스트·상세·설정·즐겨찾기 등록이 되는지 봅니다. `src/lib/config.ts`의 `POPULAR` 순서를 취향대로 바꾸세요.

키를 넣고 실데이터로 바꿔봅니다 (public/data 에는 이미 실데이터 한 벌이 들어 있습니다):

```bash
# 프로젝트 루트에 .env 파일을 만들고 (git 에 올라가지 않음) 아래 이름으로 값을 넣습니다.
#   VITE_DATA_URL=https://know77701.github.io/toss_app/prices.json
#   VITE_AD_BANNER_ID=, VITE_AD_INTERSTITIAL_ID=, VITE_AD_REWARDED_ID=   ← 콘솔 광고 그룹 ID
#   DATA_GO_KR_KEY=, FOODSAFETY_KEY=                                    ← 수집 스크립트용
# 수집 스크립트는 셸 환경변수로 받습니다. PowerShell: $env:DATA_GO_KR_KEY="..."; $env:FOODSAFETY_KEY="..."
npm run fetch:prices        # public/data/prices.json 이 실데이터로 덮어써짐
```

품목명은 실제 응답 기준으로 맞춰 두었습니다(31/32 매칭, 딸기는 제철 아님). 바꾸려면 `src/lib/config.ts`의 `POPULAR`에서 품목명은 정확히, 품종·등급은 부분 일치로 적으면 됩니다.

### 2일차 — 데이터 자동화 (GitHub Actions + Pages)

1. GitHub 저장소 › Settings › **Secrets and variables › Actions** 에 `DATA_GO_KR_KEY`, `FOODSAFETY_KEY` 추가.
2. Actions 탭 › `fetch-prices` › **Run workflow** 로 한 번 수동 실행. 성공하면 `gh-pages` 브랜치가 생깁니다.
3. Settings › **Pages** › Source를 `Deploy from a branch` / `gh-pages` / `/ (root)` 로 설정.
4. 1~2분 뒤 `https://know77701.github.io/toss_app/prices.json` 이 열리면 성공.
5. `.env` 의 `VITE_DATA_URL` 에 그 주소를 넣습니다.

이후엔 매일 08:00·16:00(KST)에 자동 갱신됩니다. 앱은 다시 배포할 필요가 없습니다.
GitHub Pages는 `Access-Control-Allow-Origin: *` 를 주므로 토스 웹뷰(`https://todaymarketprice.web.tossmini.com`)에서 fetch 가 막히지 않습니다.

**개인정보 처리방침 게시**: `docs/privacy-policy.md` 의 `[ ]` 를 채운 뒤 GitHub 저장소 파일 주소(또는 Pages 주소)를 콘솔에 넣으면 됩니다.

### 3일차 — 콘솔 등록 + 테스트 배포

3.x CLI에는 `ait dev` 가 없습니다. 토스 앱 안에서 보려면 **테스트 배포 → 콘솔 QR** 로 확인합니다.

1. 콘솔 › 앱 등록. `docs/console-registration.md` 내용을 붙여넣습니다. appName은 `todaymarketprice`, 미니앱 이름은 `오늘의 장바구니 물가` (`index.html` 의 `<title>` 과 동일).
2. 콘솔 › 워크스페이스 › **키** 에서 API 키 발급.
3. 빌드·업로드:

```bash
npm run build                          # tsc → vite build → ait build  →  todaymarketprice.ait 생성
npx ait token add --api-key <API키>    # 1회. ~/.ait/credentials 에 저장됨
npx ait deploy -m "v0.1.0 테스트"      # 콘솔 테스트 환경(intoss-private://)에 올라감
```

4. 콘솔 출시 메뉴의 QR을 토스 앱으로 찍어 실행합니다. 확인할 것:
   - 배너가 하단에 뜨는지(테스트 광고), 상세 5번째 진입에 전면형이 뜨는지, 설정에서 보상형이 뜨고 칸이 늘어나는지
   - 안드로이드 뒤로가기가 상세 → 리스트 → 종료 순으로 되는지
   - 디버깅: 안드로이드 `chrome://inspect/#devices`, iOS Safari 개발자 메뉴

### 4일차 — 실제 광고 ID로 교체 + 스크린샷

1. 콘솔 › 인앱 광고 › 광고 그룹 3개 생성(배너·전면·보상형) → 발급 ID를 `.env` 에 넣습니다. 구글 등록까지 최대 2시간.
   **테스트 ID가 남아 있으면 심사 반려·전수점검 지적 대상입니다.**
2. `npm run build && npx ait deploy -m "v0.1.0 광고 ID 적용"` 후 QR로 다시 1회 테스트(테스트 완료 기록이 있어야 검토 요청 버튼이 열립니다).
3. 이 상태에서 스크린샷 3장(636×1048)을 찍어 콘솔에 올립니다.

### 5일차 — 검토 요청

- 콘솔에서 **검토 요청하기**. 영업일 1~3일. 반려되면 사유가 이메일·콘솔에 옵니다. 흔한 사유: 앱 이름 불일치, 테스트 광고 키, 뒤로가기 오동작.
- 승인 메일이 오면 콘솔 **출시하기** 버튼을 눌러야 실제로 노출됩니다.

### 출시 후

- 누적 예상수익이 **5,000원**에 도달하면 5영업일 안에 사업자 정보·정산 정보를 등록해야 합니다(개인사업자 가능, 면세사업자 불가). 그달 말까지 승인이 안 되면 그달 수익은 못 받습니다. 홈택스 신청 후 평균 2일이면 나오니, 3,000원쯤 넘어가면 준비하세요.
- 첫 4주는 광고 ID 학습 기간이라 eCPM이 낮습니다. 수익 판단은 5주차부터.
- **푸시(스마트발송)** 는 코드로 다 준비돼 있지만 아래가 있어야 실제로 나갑니다. 사업자 등록 전에는 켤 수 없습니다.
  1. 사업자 등록 + 콘솔 승인
  2. 콘솔 › 메시지 템플릿 등록·검수. 제목 `오늘 물가`(7자 이내), 본문 `#{name}#{josa} 어제보다 #{pct}% #{dir}.`(25자 이내, 해요체)
  3. 발송 경로 선택
     - **콘솔 정기 발송(토스 요청 방식)**: 매일 `push.json` 의 문구를 콘솔에 넣는 방식. 서버 없이 가능. 단, 문구가 고정이라 매일 손으로 바꿔야 함.
     - **API 자동 발송**: `scripts/send-push.mjs` 가 mTLS 인증서로 `send-bulk-message` 를 호출. 수신자 userKey 목록이 필요하므로 토스 로그인 + 키 저장소(Cloudflare Workers KV 등)를 먼저 붙여야 합니다.
  4. 딥링크는 `push.json` 의 `deeplink` 그대로 (해당 품목이 펼쳐진 상태로 열림)
- 비게임 미니앱 전수점검(9/30~) 항목: 뒤로가기 동작, 테스트 광고 키 잔존. 둘 다 이 코드에서 처리돼 있지만 배포 전 `.env` 를 꼭 확인하세요.

---

## 검수 전 체크리스트

- [ ] 콘솔 미니앱 이름 = `index.html` `<title>` = `오늘의 장바구니 물가`
- [ ] `.env` 의 광고 ID 3개가 `ait-ad-test-*` 가 아님
- [ ] `.env` 의 `VITE_DATA_URL` 이 GitHub Pages 주소이고 브라우저에서 열림
- [ ] 안드로이드 뒤로가기: 상세 → 리스트 → 종료
- [ ] 같은 화면에 같은 포맷 광고 1개, 배너가 버튼과 붙어 있지 않음
- [ ] 출처 표기(리스트 하단, 상세 하단)가 보임
- [ ] 스크린샷에 테스트 광고 없음
- [ ] 고객문의 이메일 입력

## 자주 바꾸게 될 값

| 바꾸고 싶은 것 | 위치 |
|---|---|
| 인기 품목 순서·이름·이모지 | `src/lib/config.ts` › `POPULAR` |
| 전면형 광고 빈도 (기본 상세 10회당 1회) | `src/lib/config.ts` › `INTERSTITIAL_EVERY_N_DETAIL_OPENS` |
| 지역 목록 / 잠금 해제 시간 | `src/lib/config.ts` › `REGIONS`, `REGION_UNLOCK_HOURS` (+ `scripts/fetch-prices.mjs` › `REGIONS`, 시군구코드) |
| 무료 즐겨찾기 수 / 보상형 보상 수 | `src/lib/config.ts` › `FREE_FAVORITE_SLOTS`, `REWARD_SLOTS` |
| 수집 시각 | `.github/workflows/fetch-prices.yml` › `cron` (UTC 기준) |
| 상단 네비바(뒤로/홈 버튼) | `apps-in-toss.config.ts` › `navigationBar` |

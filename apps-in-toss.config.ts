import { defineConfig } from '@apps-in-toss/web-framework/config';

/**
 * 앱인토스 미니앱 설정 (web-framework 3.x 기준)
 * - appName: 딥링크 키(intoss://todaymarketprice). 콘솔에 등록한 값과 반드시 같아야 하고, 한 번 정하면 못 바꿉니다.
 * - 미니앱 표시 이름·아이콘은 3.x에서는 여기가 아니라 콘솔 "앱 정보"에서 넣습니다.
 *   콘솔 이름 = index.html <title> = "오늘의 장바구니 물가" 로 맞춰 두세요. (불일치 = 반려 사유)
 * - webBundleDir: vite build 결과물 폴더. `ait build` 가 이 폴더를 .ait 로 묶습니다.
 */
export default defineConfig({
  appName: 'todaymarketprice',
  brand: {
    primaryColor: '#1B64DA',
  },
  permissions: [],
  navigationBar: {
    withBackButton: true,
    withHomeButton: true,
    withTitle: true,
    theme: 'light',
  },
  webView: {
    pullToRefreshEnabled: false,
    bounces: false,
  },
  webBundleDir: 'dist',
});

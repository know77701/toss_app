/**
 * 앱인토스 SDK 래퍼.
 * 토스 앱 밖(일반 브라우저)에서 열었을 때도 죽지 않도록 모든 호출을 try/catch로 감쌉니다.
 */
import { graniteEvent, Screen } from '@apps-in-toss/web-framework';

/** 안드로이드 뒤로가기 구독. 반환된 함수를 호출하면 구독 해제. */
export function onBack(handler: () => void): () => void {
  try {
    const unsubscribe = graniteEvent.addEventListener('backEvent', {
      onEvent: () => handler(),
      onError: (error: unknown) => console.error('backEvent error', error),
    });
    return () => {
      try {
        unsubscribe();
      } catch {
        /* noop */
      }
    };
  } catch {
    // 토스 밖: 브라우저 popstate로 대체
    const fn = () => handler();
    window.addEventListener('popstate', fn);
    return () => window.removeEventListener('popstate', fn);
  }
}

/** 미니앱 닫기 */
export async function closeMiniApp() {
  try {
    await Screen.close();
  } catch {
    window.history.back();
  }
}

export function isInToss(): boolean {
  try {
    return typeof (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView !== 'undefined';
  } catch {
    return false;
  }
}

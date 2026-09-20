/**
 * 앱인토스 SDK 래퍼.
 * 토스 앱 밖(일반 브라우저)에서 열었을 때도 죽지 않도록 모든 호출을 try/catch로 감쌉니다.
 */
import { graniteEvent, Screen } from '@apps-in-toss/web-framework';

/**
 * 뒤로가기 구독. 두 경로를 모두 잡습니다.
 *  1) graniteEvent 'backEvent' — 안드로이드 하드웨어 뒤로가기 (리스너를 달면 기본 종료가 막힘)
 *  2) 웹 history 'popstate' — 상단 네비게이션 바의 < 버튼은 웹뷰의 history.back() 으로 동작하므로,
 *     더미 히스토리를 하나 깔아 두고 popstate 가 오면 handler 를 부른 뒤 다시 깔아 둡니다.
 * handler 가 true 를 돌려주면 "앱을 닫아도 됨" 이라는 뜻이라 더미를 다시 깔지 않고 종료합니다.
 */
export function onBack(handler: () => boolean | void): () => void {
  const GUARD = { tm: 'guard' };
  const arm = () => {
    try {
      if (!(window.history.state && (window.history.state as { tm?: string }).tm === 'guard')) window.history.pushState(GUARD, '');
    } catch {
      /* noop */
    }
  };
  arm();

  const onPop = () => {
    const exit = handler() === true;
    if (exit) {
      void closeMiniApp();
      return;
    }
    arm();
  };
  window.addEventListener('popstate', onPop);

  let unsubscribe: (() => void) | null = null;
  try {
    unsubscribe = graniteEvent.addEventListener('backEvent', {
      onEvent: () => {
        const exit = handler() === true;
        if (exit) void closeMiniApp();
      },
      onError: (error: unknown) => console.error('backEvent error', error),
    });
  } catch {
    /* 토스 밖: popstate 만으로 동작 */
  }

  return () => {
    window.removeEventListener('popstate', onPop);
    try {
      unsubscribe?.();
    } catch {
      /* noop */
    }
  };
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

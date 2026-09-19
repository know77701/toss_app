/**
 * 인앱 광고 훅 모음 (앱인토스 인앱 광고 2.0, 웹뷰용)
 * - 배너: TossAds.initialize() 1회 → attachBanner(adGroupId, element, options) → destroy()
 * - 전면형/보상형: loadFullScreenAd() 로 미리 로드 → showFullScreenAd() 로 표시
 *
 * 금지 사항(검수 기준): 광고 클릭에 보상 지급, 같은 화면에 같은 포맷 2개, 버튼 옆에 배너 배치,
 * 광고를 "추천 서비스"처럼 위장. 이 코드는 시청 완료(userEarnedReward)에만 보상을 줍니다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TossAds, loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';
import { AD, INTERSTITIAL_EVERY_N_DETAIL_OPENS } from './config';

/** 앱 최상위에서 한 번만 호출 */
export function useTossAdsInit(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      TossAds.initialize({
        callbacks: {
          onInitialized: () => setReady(true),
          onInitializationFailed: (error: unknown) => console.warn('TossAds init failed', error),
        },
      });
    } catch (e) {
      console.warn('TossAds unavailable (토스 앱 밖에서 실행 중?)', e);
    }
  }, []);
  return ready;
}

/** 배너 슬롯. 컨테이너 ref를 돌려주고, 마운트/언마운트에 맞춰 attach/destroy 합니다. */
export function useBanner(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'rendered' | 'nofill' | 'error'>('idle');

  useEffect(() => {
    if (!ready || !ref.current) return;
    let slot: { destroy?: () => void } | null = null;
    try {
      slot = TossAds.attachBanner(AD.banner, ref.current, {
        theme: 'light',
        variant: 'expanded',
        callbacks: {
          onAdRendered: () => setState('rendered'),
          onNoFill: () => setState('nofill'),
          onAdFailedToRender: () => setState('error'),
        },
      }) as { destroy?: () => void };
    } catch (e) {
      console.warn('attachBanner failed', e);
      setState('error');
    }
    return () => {
      try {
        slot?.destroy?.();
      } catch {
        /* noop */
      }
    };
  }, [ready]);

  return { ref, state };
}

/** 전면형: N번째 상세 진입마다 1회. 미리 로드해 두고 조건이 맞을 때만 보여줍니다. */
export function useInterstitial() {
  const loaded = useRef(false);
  const opens = useRef(0);

  const load = useCallback(() => {
    try {
      loadFullScreenAd({
        options: { adGroupId: AD.interstitial },
        onEvent: (event: { type: string }) => {
          if (event.type === 'loaded') loaded.current = true;
        },
        onError: (e: unknown) => console.warn('interstitial load error', e),
      });
    } catch (e) {
      console.warn('interstitial unavailable', e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** 상세 화면에 들어갈 때 호출. 조건이 맞으면 광고를 띄우고 true 반환 */
  const showIfDue = useCallback((): boolean => {
    opens.current += 1;
    if (opens.current % INTERSTITIAL_EVERY_N_DETAIL_OPENS !== 0) return false;
    if (!loaded.current) return false;
    try {
      showFullScreenAd({
        options: { adGroupId: AD.interstitial },
        onEvent: (event: { type: string }) => {
          if (event.type === 'dismissed' || event.type === 'failedToShow') {
            loaded.current = false;
            load();
          }
        },
        onError: (e: unknown) => {
          console.warn('interstitial show error', e);
          loaded.current = false;
          load();
        },
      });
      return true;
    } catch {
      return false;
    }
  }, [load]);

  return { showIfDue };
}

/** 보상형: 시청 완료 시 onReward 호출. 로드 실패/미지원이면 false 반환 */
export function useRewarded() {
  const loaded = useRef(false);

  const load = useCallback(() => {
    try {
      loadFullScreenAd({
        options: { adGroupId: AD.rewarded },
        onEvent: (event: { type: string }) => {
          if (event.type === 'loaded') loaded.current = true;
        },
        onError: (e: unknown) => console.warn('rewarded load error', e),
      });
    } catch (e) {
      console.warn('rewarded unavailable', e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const show = useCallback(
    (onReward: () => void): boolean => {
      if (!loaded.current) {
        load();
        return false;
      }
      try {
        showFullScreenAd({
          options: { adGroupId: AD.rewarded },
          onEvent: (event: { type: string }) => {
            if (event.type === 'userEarnedReward') onReward();
            if (event.type === 'dismissed' || event.type === 'failedToShow') {
              loaded.current = false;
              load();
            }
          },
          onError: (e: unknown) => {
            console.warn('rewarded show error', e);
            loaded.current = false;
            load();
          },
        });
        return true;
      } catch {
        return false;
      }
    },
    [load],
  );

  return { show };
}

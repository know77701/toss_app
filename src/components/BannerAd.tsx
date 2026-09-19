import { useBanner } from '../lib/ads';

/** 하단 고정 배너. 광고 UI는 SDK가 그리며 여기서는 자리만 잡습니다. */
export default function BannerAd({ ready }: { ready: boolean }) {
  const { ref } = useBanner(ready);
  return (
    <div className="banner-wrap">
      <div ref={ref} className="banner-slot" />
    </div>
  );
}

import { REGIONS, REGION_UNLOCK_HOURS, type Region } from '../lib/config';

type Props = {
  current: Region;
  unlockedUntil: number; // 0 이면 잠김
  onPick: (region: Region) => void;
  onClose: () => void;
};

function remain(until: number): string {
  const h = Math.max(0, Math.ceil((until - Date.now()) / 3600000));
  return h >= 1 ? `${h}시간 남음` : '곧 만료';
}

/** 지역 선택 바텀시트. 사용자가 버튼을 눌렀을 때만 열립니다(자동 노출 금지 규칙). */
export default function RegionSheet({ current, unlockedUntil, onPick, onClose }: Props) {
  const unlocked = unlockedUntil > 0;
  return (
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="지역 선택">
        <div className="sheet-title">지역 선택</div>
        <div className="sheet-desc">
          {unlocked
            ? `모든 지역을 볼 수 있습니다 · ${remain(unlockedUntil)}`
            : `서울은 항상 무료입니다. 다른 지역은 광고를 끝까지 보면 ${REGION_UNLOCK_HOURS}시간 동안 열립니다.`}
        </div>
        {REGIONS.map((r) => {
          const locked = !r.free && !unlocked;
          return (
            <button key={r.code} className={`sheet-row ${r.code === current.code ? 'on' : ''}`} onClick={() => onPick(r)}>
              <span>{r.name}</span>
              <span className="lock">{r.code === current.code ? '보는 중' : locked ? '광고 보고 열기' : ''}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

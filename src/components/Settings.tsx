import { REWARD_SLOTS } from '../lib/config';

type Props = {
  favoritesCount: number;
  slots: number;
  onBack: () => void;
  onWatchRewarded: () => void;
  updatedAt: string;
  regday: string;
  regionName?: string;
  unlockedUntil?: number;
};

export default function Settings({ favoritesCount, slots, onBack, onWatchRewarded, updatedAt, regday, regionName = '서울', unlockedUntil = 0 }: Props) {
  return (
    <div>
      <div className="nav">
        <button className="back" onClick={onBack} aria-label="닫기">
          ✕
        </button>
        <div className="title">설정</div>
        <div className="right" />
      </div>

      <div className="section">
        <div className="section-head">즐겨찾기</div>
        <div className="cell">
          <span>등록한 품목</span>
          <span className="v">
            {favoritesCount} / {slots}개
          </span>
        </div>
        <div className="cell-desc">
          즐겨찾기한 품목은 목록 맨 위에 모아서 보여줍니다. 광고를 끝까지 보면 등록할 수 있는 칸이 {REWARD_SLOTS}개 늘어납니다.
        </div>
        <button className="btn sub" onClick={onWatchRewarded}>
          광고 보고 {REWARD_SLOTS}개 늘리기
        </button>
      </div>

      <div className="section">
        <div className="section-head">데이터</div>
        <div className="cell">
          <span>조사일</span>
          <span className="v">{regday || '-'}</span>
        </div>
        <div className="cell">
          <span>갱신 시각</span>
          <span className="v">{updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : '-'}</span>
        </div>
        <div className="cell">
          <span>기준</span>
          <span className="v">{regionName} 소매가격</span>
        </div>
        <div className="cell">
          <span>다른 지역 보기</span>
          <span className="v">{unlockedUntil > 0 ? `${Math.max(1, Math.ceil((unlockedUntil - Date.now()) / 3600000))}시간 남음` : '서울만 (광고 보면 24시간 전체)'}</span>
        </div>
        <div className="cell">
          <span>출처</span>
          <span className="v">공공데이터포털 (aT 농산물유통정보)</span>
        </div>
      </div>

      <div className="note">로그인 없이 사용하며 개인정보를 수집하지 않습니다. 즐겨찾기는 이 기기에만 저장됩니다.</div>
    </div>
  );
}

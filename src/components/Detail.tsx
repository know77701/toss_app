import Chart from './Chart';
import { change, fullLabel, pct, seriesFor, won, type DisplayItem, type HistoryData } from '../lib/data';

type Props = {
  item: DisplayItem;
  isFavorite: boolean;
  history: HistoryData | null;
  regday: string;
  regionName?: string;
  onBack: () => void;
  onToggleFavorite: (item: DisplayItem) => void;
};

const ROWS: Array<{ key: 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7'; label: string }> = [
  { key: 'd2', label: '어제' },
  { key: 'd3', label: '1주 전' },
  { key: 'd4', label: '2주 전' },
  { key: 'd5', label: '1개월 전' },
  { key: 'd6', label: '1년 전' },
  { key: 'd7', label: '평년' },
];

export default function Detail({ item, isFavorite, history, regday, regionName = '서울', onBack, onToggleFavorite }: Props) {
  const today = item.prices.d1;
  const c = change(item);
  const cls = !c || Math.abs(c.pct) < 0.05 ? 'flat' : c.pct > 0 ? 'up' : 'down';
  const { points, sparse } = seriesFor(item, history, regday, 30);

  return (
    <div>
      <div className="nav">
        <button className="back" onClick={onBack} aria-label="닫기">
          ✕
        </button>
        <div className="title">{item.label}</div>
        <div className="right">
          <button className={`text-btn ${isFavorite ? 'on' : ''}`} onClick={() => onToggleFavorite(item)}>
            {isFavorite ? '★ 즐겨찾기' : '☆ 즐겨찾기'}
          </button>
        </div>
      </div>

      <div className="hero">
        <div className="label">
          {fullLabel(item)} · {item.unit}
        </div>
        <div className="price">{won(today)}</div>
        {c && (
          <div className={`chg ${cls}`}>
            {c.baseLabel} 대비 {pct(c.pct)} ({c.diff > 0 ? '+' : ''}
            {Math.round(c.diff).toLocaleString('ko-KR')}원)
          </div>
        )}
        <div className="meta">{regionName} 소매가격 · {item.days.d1} 조사</div>
      </div>

      <div className="section">
        <div className="section-head">최근 1개월</div>
        {points.length >= 2 ? (
          <div className="detail-chart">
            <Chart points={points} height={150} showDates showMinMax />
            {sparse && <div className="expand-note">일부 날짜만 있는 데이터입니다. 매일 갱신되며 점차 채워집니다.</div>}
          </div>
        ) : (
          <div className="expand-empty" style={{ padding: '12px 20px' }}>
            추이를 그릴 데이터가 아직 없습니다.
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">시점별 비교</div>
        <div className="table">
          {ROWS.filter((r) => item.prices[r.key] != null).map((r) => {
            const v = item.prices[r.key];
            const d = today != null && v != null && v > 0 ? ((today - v) / v) * 100 : null;
            const dcls = d == null || Math.abs(d) < 0.05 ? 'flat' : d > 0 ? 'up' : 'down';
            return (
              <div className="tr" key={r.key}>
                <div className="k">{r.label}</div>
                <div className="v">{won(v)}</div>
                <div className={`d ${dcls}`}>{d == null ? '-' : pct(d)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="note">
        오른쪽 등락률은 오늘 가격을 각 시점과 비교한 값입니다. 출처 공공데이터포털 한국농수산식품유통공사, {regionName} 지역 소매 조사 기준. 매장과 지역에
        따라 실제 판매가는 다를 수 있습니다.
      </div>
    </div>
  );
}

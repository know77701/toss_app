import Chart from './Chart';
import { change, pct, perUnitText, seriesFor, won, type DisplayItem, type HistoryData } from '../lib/data';

type Props = {
  item: DisplayItem;
  isFavorite: boolean;
  inBasket: boolean;
  expanded: boolean;
  history: HistoryData | null;
  regday: string;
  onToggle: (item: DisplayItem) => void;
  onDetail: (item: DisplayItem) => void;
  onToggleFavorite: (item: DisplayItem) => void;
  onAddBasket: (item: DisplayItem) => void;
};

export default function PriceRow({ item, isFavorite, inBasket, expanded, history, regday, onToggle, onDetail, onToggleFavorite, onAddBasket }: Props) {
  const c = change(item);
  const cls = !c || Math.abs(c.pct) < 0.05 ? 'flat' : c.pct > 0 ? 'up' : 'down';
  const sub = [item.kind && item.kind !== item.item ? item.kind : '', item.rank, item.unit, perUnitText(item.prices.d1, item.unit)].filter(Boolean).join(' · ');

  return (
    <div id={`row-${item.id}`} className={`row-wrap ${expanded ? 'open' : ''}`}>
      <div className="row" role="button" tabIndex={0} onClick={() => onToggle(item)} onKeyDown={(e) => e.key === 'Enter' && onToggle(item)}>
        <div className="name">
          <div className="t">
            {isFavorite && <span className="tag">★</span>}
            {inBasket && <span className="tag tag-basket">담김</span>}
            {item.label}
          </div>
          <div className="s">{sub}</div>
        </div>
        <div className="price">
          <div className="p">{won(item.prices.d1)}</div>
          <div className={`c ${cls}`}>{c ? `${pct(c.pct)} ${c.baseLabel} 대비` : '비교 없음'}</div>
        </div>
      </div>

      {expanded && (
        <Expanded
          item={item}
          history={history}
          regday={regday}
          isFavorite={isFavorite}
          inBasket={inBasket}
          onDetail={onDetail}
          onToggleFavorite={onToggleFavorite}
          onAddBasket={onAddBasket}
        />
      )}
    </div>
  );
}

function Expanded({
  item,
  history,
  regday,
  isFavorite,
  inBasket,
  onDetail,
  onToggleFavorite,
  onAddBasket,
}: {
  item: DisplayItem;
  history: HistoryData | null;
  regday: string;
  isFavorite: boolean;
  inBasket: boolean;
  onDetail: (i: DisplayItem) => void;
  onToggleFavorite: (i: DisplayItem) => void;
  onAddBasket: (i: DisplayItem) => void;
}) {
  const { points, sparse } = seriesFor(item, history, regday, 7);
  const prices = points.map((p) => p.price);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div className="expand">
      <div className="expand-head">
        <span>최근 1주</span>
        {min != null && max != null && (
          <span className="expand-range">
            {won(min)} ~ {won(max)}
          </span>
        )}
      </div>
      {points.length >= 2 ? <Chart points={points} height={64} showDates /> : <div className="expand-empty">일주일 치 가격이 아직 쌓이지 않았습니다.</div>}
      {sparse && points.length >= 2 && <div className="expand-note">일부 날짜만 있는 데이터입니다.</div>}
      <div className="expand-actions">
        <button className={`link-btn ${inBasket ? 'on' : ''}`} onClick={stop(() => onAddBasket(item))}>
          {inBasket ? '담김 · 1개 더' : '담기'}
        </button>
        <button className={`link-btn ${isFavorite ? 'on' : ''}`} onClick={stop(() => onToggleFavorite(item))}>
          {isFavorite ? '★ 즐겨찾기' : '☆ 즐겨찾기'}
        </button>
        <button className="link-btn" onClick={stop(() => onDetail(item))}>
          1개월 추이 ›
        </button>
      </div>
    </div>
  );
}

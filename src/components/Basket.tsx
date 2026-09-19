import { useMemo } from 'react';
import { BASKET_PRESETS, type BasketPreset } from '../lib/config';
import {
  fmtKm,
  martBasketTotals,
  pct,
  splitProductName,
  won,
  type BasketEntry,
  type DisplayItem,
  type GeoData,
  type MartData,
} from '../lib/data';

type Props = {
  entries: BasketEntry[];
  freshItems: DisplayItem[];
  mart: MartData | null;
  geo: GeoData | null;
  userPos: [number, number] | null;
  regionName: string;
  onQty: (entry: BasketEntry, delta: number) => void;
  onRemove: (entry: BasketEntry) => void;
  onGoFresh: () => void;
  onGoMart: () => void;
  onLocate: () => void;
  onPreset: (preset: BasketPreset) => void;
  activePreset: string | null;
};

/** 장바구니: 농산물은 오늘 vs 1개월 전, 마트 상품은 매장별 합계로 "어디가 싼가" */
export default function BasketScreen({ entries, freshItems, mart, geo, userPos, regionName, onQty, onRemove, onGoFresh, onGoMart, onLocate, onPreset, activePreset }: Props) {
  const fresh = useMemo(
    () =>
      entries
        .filter((e) => e.kind === 'fresh')
        .map((e) => ({ e, it: freshItems.find((x) => x.id === e.id) }))
        .filter((x): x is { e: BasketEntry; it: DisplayItem } => !!x.it),
    [entries, freshItems],
  );
  const martPicked = useMemo(
    () =>
      entries
        .filter((e) => e.kind === 'mart')
        .map((e) => ({ e, p: mart?.products.find((x) => x.id === e.id) }))
        .filter((x): x is { e: BasketEntry; p: NonNullable<typeof x.p> } => !!x.p),
    [entries, mart],
  );
  const martTotals = useMemo(() => (mart ? martBasketTotals(mart, entries) : null), [mart, entries]);

  const freshToday = fresh.reduce((s, { e, it }) => s + (it.prices.d1 ?? 0) * e.qty, 0);
  const freshMonth = fresh.reduce((s, { e, it }) => s + (it.prices.d5 ?? it.prices.d1 ?? 0) * e.qty, 0);
  const freshWeek = fresh.reduce((s, { e, it }) => s + (it.prices.d3 ?? it.prices.d1 ?? 0) * e.qty, 0);
  const hasFreshMonth = fresh.some(({ it }) => it.prices.d5 != null);
  // 작년 대비: 1년 전 값이 있는 품목만 같은 기준으로 비교
  const withYear = fresh.filter(({ it }) => it.prices.d6 != null);
  const yearToday = withYear.reduce((s, { e, it }) => s + (it.prices.d1 ?? 0) * e.qty, 0);
  const yearAgo = withYear.reduce((s, { e, it }) => s + (it.prices.d6 ?? 0) * e.qty, 0);
  const yearPct = yearAgo > 0 ? ((yearToday - yearAgo) / yearAgo) * 100 : null;

  const presetChips = (
    <div className="presets">
      {BASKET_PRESETS.map((p) => (
        <button key={p.id} className={`chip ${activePreset === p.id ? 'on' : ''}`} onClick={() => onPreset(p)} title={p.desc}>
          {p.name}
        </button>
      ))}
    </div>
  );

  if (entries.length === 0) {
    return (
      <div>
        <div className="section-head" style={{ paddingTop: 4 }}>한 번에 담기</div>
        {presetChips}
        <div className="state" style={{ paddingTop: 28 }}>
          장바구니가 비어 있습니다.
          <div className="expand-note" style={{ marginTop: 10, lineHeight: 1.6 }}>
            품목을 눌러 펼친 뒤 <b>담기</b>를 누르면 여기에 모입니다.
            <br />
            농축수산물은 이번 주 합계와 지난달 대비를, 마트 상품은 <b>내 장바구니가 가장 싼 매장</b>을 알려줍니다.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button className="btn sub" style={{ margin: 0, width: 'auto', flex: 1 }} onClick={onGoFresh}>
              농축수산물 담기
            </button>
            <button className="btn sub" style={{ margin: 0, width: 'auto', flex: 1 }} onClick={onGoMart}>
              마트 상품 담기
            </button>
          </div>
        </div>
      </div>
    );
  }

  const diff = freshToday - freshMonth;
  const diffPct = freshMonth > 0 ? (diff / freshMonth) * 100 : 0;

  return (
    <div>
      {presetChips}
      {/* 요약 */}
      <div className="basket-summary">
        <div className="basket-row">
          <span className="k">농축수산물 {fresh.length}개</span>
          <span className="v">{won(freshToday)}</span>
        </div>
        {hasFreshMonth && (
          <div className="basket-sub">
            지난달보다{' '}
            <b className={diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'}>
              {diff > 0 ? '+' : ''}
              {won(Math.round(diff))} ({pct(diffPct)})
            </b>
            {' · '}1주 전 {won(freshWeek)}
          </div>
        )}
        {yearPct != null && withYear.length >= 3 && (
          <div className="basket-sub">
            작년 이맘때보다{' '}
            <b className={yearPct > 0 ? 'up' : yearPct < 0 ? 'down' : 'flat'}>
              {yearPct > 0 ? '+' : ''}
              {won(Math.round(yearToday - yearAgo))} ({pct(yearPct)})
            </b>
            {withYear.length < fresh.length ? ` · ${withYear.length}/${fresh.length}개 품목 기준` : ''}
          </div>
        )}
        {martTotals && martTotals.items > 0 && (
          <div className="basket-row" style={{ marginTop: 8 }}>
            <span className="k">마트 상품 {martTotals.items}개 (평균가)</span>
            <span className="v">{won(martTotals.avgTotal)}</span>
          </div>
        )}
        <div className="basket-sub">{regionName} 기준 · 농축수산물은 조사 평균가, 마트 상품은 매장별 정가</div>
      </div>

      {/* 가장 싼 마트 */}
      {mart && martTotals && martTotals.items > 0 && (
        <div className="section">
          <div className="section-head recall-head">
            <span>내 장바구니가 가장 싼 매장</span>
            {!userPos && (
              <button className="text-btn" onClick={onLocate}>
                내 위치로 거리 보기
              </button>
            )}
          </div>
          {martTotals.totals.length === 0 ? (
            <div className="fav-empty">담은 상품을 70% 이상 취급하는 매장이 없습니다. 상품을 줄이거나 바꿔 보세요.</div>
          ) : (
            martTotals.totals.slice(0, 6).map((t, i) => {
              const s = mart.stores[t.storeIdx];
              const pos = geo?.geo?.[s.id];
              const km = userPos && pos ? distance(userPos, pos) : null;
              return (
                <div key={s.id} className="row">
                  <div className="name">
                    <div className="t">
                      {i === 0 && <span className="tag" style={{ background: '#e8f3ff', color: '#1b64da' }}>최저</span>}
                      {s.name}
                    </div>
                    <div className="s">
                      {s.typeName}
                      {' · '}
                      {t.covered}/{martTotals.items}개 취급
                      {km != null ? ` · ${fmtKm(km)}` : ''}
                      {t.missing.length > 0 && ` · 없음: ${t.missing.slice(0, 2).join(', ')}${t.missing.length > 2 ? ' 외' : ''}`}
                    </div>
                  </div>
                  <div className="price">
                    <div className={`p ${i === 0 ? 'down' : ''}`}>{won(t.total)}</div>
                    {i > 0 && martTotals.totals[0].covered === t.covered && (
                      <div className="c flat">+{won(t.total - martTotals.totals[0].total)}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 담은 품목 */}
      <div className="section">
        <div className="section-head">담은 품목</div>
        {fresh.map(({ e, it }) => (
          <BasketLine
            key={`f-${e.id}`}
            name={it.label}
            sub={`${it.unit} · 오늘 ${won(it.prices.d1)}`}
            qty={e.qty}
            total={(it.prices.d1 ?? 0) * e.qty}
            onQty={(d) => onQty(e, d)}
            onRemove={() => onRemove(e)}
          />
        ))}
        {martPicked.map(({ e, p }) => {
          const { title, maker, spec } = splitProductName(p.name);
          return (
            <BasketLine
              key={`m-${e.id}`}
              name={title}
              sub={[spec ?? p.unit, maker, `평균 ${won(p.avg)}`, `최저 ${won(p.min)}`].filter(Boolean).join(' · ')}
              qty={e.qty}
              total={p.avg * e.qty}
              onQty={(d) => onQty(e, d)}
              onRemove={() => onRemove(e)}
            />
          );
        })}
      </div>

      <div className="note">
        농축수산물 합계는 공공데이터포털 {regionName} 소매 조사 평균가, 마트 합계는 한국소비자원 참가격 매장별 정가 기준입니다. 행사가·회원가는 반영되지
        않습니다.
      </div>
    </div>
  );
}

function distance(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function BasketLine({ name, sub, qty, total, onQty, onRemove }: { name: string; sub: string; qty: number; total: number; onQty: (d: number) => void; onRemove: () => void }) {
  return (
    <div className="row basket-line">
      <div className="name">
        <div className="t">{name}</div>
        <div className="s">{sub}</div>
      </div>
      <div className="qty">
        <button onClick={() => (qty <= 1 ? onRemove() : onQty(-1))} aria-label="줄이기">
          {qty <= 1 ? '✕' : '−'}
        </button>
        <span>{qty}</span>
        <button onClick={() => onQty(1)} aria-label="늘리기">
          +
        </button>
      </div>
      <div className="price">
        <div className="p">{won(total)}</div>
      </div>
    </div>
  );
}

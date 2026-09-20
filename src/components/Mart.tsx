import { useMemo, useState } from 'react';
import MarketSection from './Market';
import { MART_AREA, MART_POPULAR } from '../lib/config';
import { closureDates, distanceKm, fmtKm, perUnitText, shortDate, splitProductName, weekdayKo, won, type GeoData, type MarketData, type MartData, type MartProduct } from '../lib/data';

type Props = {
  data: MartData | null;
  loading: boolean;
  regionName: string;
  regionCode: string;
  market: MarketData | null;
  geo: GeoData | null;
  userPos: [number, number] | null;
  basketIds: Set<string>;
  onAddBasket: (p: MartProduct) => void;
  onLocate: () => void;
};

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/**
 * 인기 규칙 순으로 앞에, 나머지는 이름순.
 * not 에 '*' 가 있으면 "키워드 뒤에 괄호 용량만 붙은 기본 상품"만 인정합니다. 예) 삼다수(2L) O, 삼다수(2L*6개) X
 */
function orderProducts(products: MartProduct[]): Array<MartProduct & { popular: boolean }> {
  const used = new Set<string>();
  const top: Array<MartProduct & { popular: boolean }> = [];
  for (const rule of MART_POPULAR) {
    const max = rule.max ?? 2;
    const hits = products
      .filter((p) => !used.has(p.id) && p.name.includes(rule.kw))
      .filter((p) => !(rule.not ?? []).some((n) => (n === '*' ? /[*×x]\s*\d+/i.test(p.name) : p.name.includes(n))))
      .sort((a, b) => a.prices.length - b.prices.length === 0 ? a.name.length - b.name.length : b.prices.length - a.prices.length) // 취급 매장 많은 것, 이름 짧은 것 우선
      .slice(0, max);
    for (const h of hits) {
      used.add(h.id);
      top.push({ ...h, popular: true });
    }
  }
  const rest = products.filter((p) => !used.has(p.id)).map((p) => ({ ...p, popular: false }));
  return [...top, ...rest];
}

export default function MartScreen({ data, loading, regionName, regionCode, market, geo, userPos, basketIds, onAddBasket, onLocate }: Props) {
  const closure = useMemo(() => closureDates(regionCode), [regionCode]);
  const [closureOpen, setClosureOpen] = useState(false);
  const [sub, setSub] = useState<'mart' | 'market'>('mart');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const ordered = useMemo(() => (data ? orderProducts(data.products) : []), [data]);
  const q = norm(query);
  const shown = q ? ordered.filter((p) => norm(p.name).includes(q)) : ordered;
  const popular = shown.filter((p) => p.popular);
  const rest = shown.filter((p) => !p.popular);

  const hasMarket = regionName === '서울';
  const subTabs = (
    <div className="subtabs">
      <button className={sub === 'mart' ? 'on' : ''} onClick={() => setSub('mart')}>
        마트·편의점
      </button>
      {hasMarket && (
        <button className={sub === 'market' ? 'on' : ''} onClick={() => setSub('market')}>
          전통시장
        </button>
      )}
    </div>
  );

  if (sub === 'market' && hasMarket) {
    return (
      <div>
        {subTabs}
        <MarketSection data={market} regionName={regionName} />
      </div>
    );
  }

  if (loading && !data)
    return (
      <div>
        {subTabs}
        <div className="state">마트 물가를 불러오는 중</div>
      </div>
    );
  if (!data)
    return (
      <div>
        {subTabs}
        <div className="state">
          {regionName} 지역 마트 가격 정보가 아직 없습니다.
          <div className="expand-note" style={{ marginTop: 8 }}>
            참가격 수집이 한 번 돌아야 채워집니다.
          </div>
        </div>
      </div>
    );

  return (
    <div>
      {subTabs}
      <div className="mart-meta recall-head">
        <span>
          {MART_AREA[regionCode] ?? regionName} {data.stores.length}개 매장 · 한국소비자원 {data.inspectDay} 조사 · 격주 갱신
        </span>
        {!userPos && (
          <button className="text-btn" onClick={onLocate}>
            내 위치로 거리 보기
          </button>
        )}
      </div>

      <div className="search">
        <div className="search-box">
          <input type="search" inputMode="search" placeholder="상품 검색 (예: 신라면, 화장지, 우유)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="상품 검색" />
          {query && (
            <button className="clear" onClick={() => setQuery('')} aria-label="지우기">
              ✕
            </button>
          )}
        </div>
      </div>

      {shown.length === 0 && <div className="search-empty">'{query.trim()}'에 해당하는 상품이 없습니다.</div>}

      {popular.length > 0 && (
        <div className="section">
          <div className="section-head">많이 사는 생필품</div>
          {popular.map((p) => (
            <ProductRow key={p.id} p={p} data={data} geo={geo} userPos={userPos} inBasket={basketIds.has(p.id)} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} onAddBasket={onAddBasket} />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div className="section">
          <div className="section-head">전체 {q ? '' : `${rest.length}개`}</div>
          {rest.map((p) => (
            <ProductRow key={p.id} p={p} data={data} geo={geo} userPos={userPos} inBasket={basketIds.has(p.id)} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} onAddBasket={onAddBasket} />
          ))}
        </div>
      )}

      {closure.dates.length > 0 && (
        <ClosureBar regionName={regionName} dates={closure.dates} open={closureOpen} onOpen={() => setClosureOpen(true)} onClose={() => setClosureOpen(false)} note={closure.rule.note} />
      )}

      <div className="note">
        출처 한국소비자원 참가격(공공데이터포털). {regionName} 소재 대형마트·기업형슈퍼·백화점·편의점의 정가 기준 조사이며 행사가는 반영되지 않을 수 있습니다.
        매장 위치는 카카오 지도 기준입니다.
      </div>
    </div>
  );
}

function ProductRow({
  p,
  data,
  geo,
  userPos,
  inBasket,
  open,
  onToggle,
  onAddBasket,
}: {
  p: MartProduct;
  data: MartData;
  geo: GeoData | null;
  userPos: [number, number] | null;
  inBasket: boolean;
  open: boolean;
  onToggle: () => void;
  onAddBasket: (p: MartProduct) => void;
}) {
  const spread = p.max - p.min;
  const spreadPct = p.min > 0 ? (spread / p.min) * 100 : 0;
  const { title, maker, spec } = splitProductName(p.name);
  const sub = [spec ?? p.unit, maker, perUnitText(p.min, spec ?? p.unit), `${p.prices.length}개 매장`].filter(Boolean).join(' · ');
  return (
    <div className={`row-wrap ${open ? 'open' : ''}`}>
      <div className="row" role="button" tabIndex={0} onClick={onToggle} onKeyDown={(e) => e.key === 'Enter' && onToggle()}>
        <div className="name">
          <div className="t">
            {inBasket && <span className="tag tag-basket">담김</span>}
            {title}
          </div>
          <div className="s">{sub}</div>
        </div>
        <div className="price">
          <div className="p">{won(p.min)}~</div>
          <div className={`c ${spreadPct >= 20 ? 'up' : 'flat'}`}>최대 {won(p.max)} · 차이 {won(spread)}</div>
        </div>
      </div>
      {open && <ProductDetail p={p} data={data} geo={geo} userPos={userPos} inBasket={inBasket} onAddBasket={onAddBasket} />}
    </div>
  );
}

function ProductDetail({
  p,
  data,
  geo,
  userPos,
  inBasket,
  onAddBasket,
}: {
  p: MartProduct;
  data: MartData;
  geo: GeoData | null;
  userPos: [number, number] | null;
  inBasket: boolean;
  onAddBasket: (p: MartProduct) => void;
}) {
  const chains = Object.entries(p.chainAvg).sort((a, b) => a[1] - b[1]);
  const withKm = p.prices.map(([si, price]) => {
    const pos = geo?.geo?.[data.stores[si]?.id];
    return { si, price, km: userPos && pos ? distanceKm(userPos, pos) : null };
  });
  const cheapest = withKm.slice(0, 6);
  const nearest = userPos ? [...withKm].filter((x) => x.km != null).sort((a, b) => a.km! - b.km!).slice(0, 4) : [];

  return (
    <div className="expand">
      <div className="expand-head">
        <span>체인별 평균</span>
        <span className="expand-range">평균 {won(p.avg)}</span>
      </div>
      <div className="chain-list">
        {chains.map(([chain, avg], i) => (
          <div key={chain} className="chain-row">
            <span className="n">{chain}</span>
            <span className={`v ${i === 0 ? 'down' : ''}`}>{won(avg)}</span>
          </div>
        ))}
      </div>

      <div className="expand-head" style={{ marginTop: 12 }}>
        <span>가장 싼 매장</span>
      </div>
      <div className="chain-list">
        {cheapest.map((x, i) => {
          const s = data.stores[x.si];
          return (
            <div key={`c-${x.si}`} className="chain-row">
              <span className="n">
                {s?.name ?? '-'} <span className="tag">{s?.typeName}</span>
                {x.km != null && <span className="chain-spec"> {fmtKm(x.km)}</span>}
              </span>
              <span className={`v ${i === 0 ? 'down' : ''}`}>{won(x.price)}</span>
            </div>
          );
        })}
      </div>

      {nearest.length > 0 && (
        <>
          <div className="expand-head" style={{ marginTop: 12 }}>
            <span>내 주변 매장</span>
          </div>
          <div className="chain-list">
            {nearest.map((x) => {
              const s = data.stores[x.si];
              return (
                <div key={`n-${x.si}`} className="chain-row">
                  <span className="n">
                    {s?.name ?? '-'} <span className="chain-spec">{fmtKm(x.km!)}</span>
                  </span>
                  <span className="v">{won(x.price)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="expand-actions">
        <button
          className={`link-btn ${inBasket ? 'on' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onAddBasket(p);
          }}
        >
          {inBasket ? '담김 · 1개 더' : '장바구니 담기'}
        </button>
      </div>
    </div>
  );
}

/**
 * 대형마트 의무휴업: 화면 하단 고정 바(광고 배너 위) + 누르면 바텀시트.
 * 자동으로 열리지 않습니다(검수 기준: 진입 즉시 바텀시트 노출 금지).
 */
function ClosureBar({ regionName, dates, note, open, onOpen, onClose }: { regionName: string; dates: string[]; note?: string; open: boolean; onOpen: () => void; onClose: () => void }) {
  const fmt = (d: string) => `${shortDate(d)}(${weekdayKo(d)})`;
  const next = dates[0];
  const daysLeft = Math.round((Date.parse(`${next}T00:00:00`) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  return (
    <>
      <button className="closure-bar" onClick={onOpen}>
        <span className="closure-dot" />
        <span className="closure-text">
          대형마트 휴무 <b>{fmt(next)}</b>
          {daysLeft === 0 ? ' · 오늘' : daysLeft === 1 ? ' · 내일' : daysLeft > 1 ? ` · ${daysLeft}일 뒤` : ''}
        </span>
        <span className="closure-more">자세히 ›</span>
      </button>

      {open && (
        <>
          <div className="sheet-bg" onClick={onClose} />
          <div className="sheet" role="dialog" aria-label="대형마트 의무휴업일">
            <div className="sheet-title">{regionName} 대형마트 의무휴업일</div>
            <div className="sheet-desc">이마트·홈플러스·롯데마트 등 대형마트와 기업형슈퍼(SSM)가 쉬는 날입니다. 백화점·편의점·전통시장은 엽니다.</div>
            {dates.slice(0, 4).map((d, i) => (
              <div key={d} className="sheet-row">
                <span>{fmt(d)}</span>
                <span className="lock">{i === 0 ? '다음 휴무' : ''}</span>
              </div>
            ))}
            <div className="sheet-desc" style={{ paddingTop: 10 }}>
              {note ? `${note}. ` : ''}유통산업발전법에 따라 지자체 조례로 정해지며 자치구·점포별로 다를 수 있습니다. 방문 전 매장에 확인하세요.
            </div>
            <button className="btn sub" onClick={onClose} style={{ marginTop: 8 }}>
              닫기
            </button>
          </div>
        </>
      )}
    </>
  );
}

/** 장바구니 등 다른 곳에서 마트 상품 상세를 모달로 열 때 */
export function MartProductModal({
  p,
  data,
  geo,
  userPos,
  inBasket,
  onAddBasket,
  onBack,
  onLocate,
}: {
  p: MartProduct;
  data: MartData;
  geo: GeoData | null;
  userPos: [number, number] | null;
  inBasket: boolean;
  onAddBasket: (p: MartProduct) => void;
  onBack: () => void;
  onLocate: () => void;
}) {
  const { title, maker, spec } = splitProductName(p.name);
  return (
    <div>
      <div className="nav">
        <button className="back" onClick={onBack} aria-label="닫기">
          ✕
        </button>
        <div className="title">{title}</div>
        <div className="right">
          {!userPos && (
            <button className="text-btn" onClick={onLocate}>
              거리
            </button>
          )}
        </div>
      </div>
      <div className="hero">
        <div className="label">{[maker, spec ?? p.unit, `${p.prices.length}개 매장`].filter(Boolean).join(' · ')}</div>
        <div className="price">{won(p.min)}~</div>
        <div className="chg flat">
          최대 {won(p.max)} · 평균 {won(p.avg)} · {perUnitText(p.min, spec ?? p.unit) ?? ''}
        </div>
        <div className="meta">한국소비자원 {data.inspectDay} 조사 · {data.region} 매장 기준</div>
      </div>
      <ProductDetail p={p} data={data} geo={geo} userPos={userPos} inBasket={inBasket} onAddBasket={onAddBasket} />
    </div>
  );
}

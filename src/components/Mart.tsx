import { useMemo, useState } from 'react';
import { MART_POPULAR } from '../lib/config';
import { closureDates, shortDate, weekdayKo, won, type MartData, type MartProduct } from '../lib/data';

type Props = {
  data: MartData | null;
  loading: boolean;
  regionName: string;
  regionCode: string;
};

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 인기 키워드 순으로 앞에, 나머지는 이름순 */
function orderProducts(products: MartProduct[]): Array<MartProduct & { popular: boolean }> {
  const used = new Set<string>();
  const top: Array<MartProduct & { popular: boolean }> = [];
  for (const kw of MART_POPULAR) {
    const hits = products.filter((p) => !used.has(p.id) && p.name.includes(kw));
    for (const h of hits) {
      used.add(h.id);
      top.push({ ...h, popular: true });
    }
  }
  const rest = products.filter((p) => !used.has(p.id)).map((p) => ({ ...p, popular: false }));
  return [...top, ...rest];
}

export default function MartScreen({ data, loading, regionName, regionCode }: Props) {
  const closure = useMemo(() => closureDates(regionCode), [regionCode]);
  const [closureOpen, setClosureOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const ordered = useMemo(() => (data ? orderProducts(data.products) : []), [data]);
  const q = norm(query);
  const shown = q ? ordered.filter((p) => norm(p.name).includes(q)) : ordered;
  const popular = shown.filter((p) => p.popular);
  const rest = shown.filter((p) => !p.popular);

  if (loading && !data) return <div className="state">마트 물가를 불러오는 중</div>;
  if (!data)
    return (
      <div className="state">
        {regionName} 지역 마트 가격 정보가 아직 없습니다.
        <div className="expand-note" style={{ marginTop: 8 }}>
          참가격 수집이 한 번 돌아야 채워집니다.
        </div>
      </div>
    );

  return (
    <div>
      <div className="mart-meta">
        {regionName} {data.stores.length}개 매장 · 한국소비자원 {data.inspectDay} 조사 · 격주 갱신
      </div>


      <div className="search">
        <div className="search-box">
          <input
            type="search"
            inputMode="search"
            placeholder="상품 검색 (예: 신라면, 화장지, 우유)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="상품 검색"
          />
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
            <ProductRow key={p.id} p={p} data={data} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div className="section">
          <div className="section-head">전체 {q ? '' : `${rest.length}개`}</div>
          {rest.map((p) => (
            <ProductRow key={p.id} p={p} data={data} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />
          ))}
        </div>
      )}

      {closure.dates.length > 0 && (
        <ClosureBar regionName={regionName} dates={closure.dates} open={closureOpen} onOpen={() => setClosureOpen(true)} onClose={() => setClosureOpen(false)} note={closure.rule.note} />
      )}

      <div className="note">
        출처 한국소비자원 참가격(공공데이터포털). {regionName} 소재 대형마트·기업형슈퍼·백화점·편의점의 정가 기준 조사이며 행사가는
        반영되지 않을 수 있습니다.
      </div>
    </div>
  );
}

function ProductRow({ p, data, open, onToggle }: { p: MartProduct; data: MartData; open: boolean; onToggle: () => void }) {
  const spread = p.max - p.min;
  const spreadPct = p.min > 0 ? (spread / p.min) * 100 : 0;
  return (
    <div className={`row-wrap ${open ? 'open' : ''}`}>
      <div className="row" role="button" tabIndex={0} onClick={onToggle} onKeyDown={(e) => e.key === 'Enter' && onToggle()}>
        <div className="name">
          <div className="t">{p.name}</div>
          <div className="s">
            {p.unit ? `${p.unit} · ` : ''}
            {p.prices.length}개 매장
          </div>
        </div>
        <div className="price">
          <div className="p">{won(p.min)}~</div>
          <div className={`c ${spreadPct >= 20 ? 'up' : 'flat'}`}>최대 {won(p.max)} · 차이 {won(spread)}</div>
        </div>
      </div>
      {open && <ProductDetail p={p} data={data} />}
    </div>
  );
}

function ProductDetail({ p, data }: { p: MartProduct; data: MartData }) {
  const chains = Object.entries(p.chainAvg).sort((a, b) => a[1] - b[1]);
  const cheapest = p.prices.slice(0, 8);
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
        {cheapest.map(([si, price], i) => {
          const s = data.stores[si];
          return (
            <div key={`${si}-${i}`} className="chain-row">
              <span className="n">
                {s?.name ?? '-'} <span className="tag">{s?.typeName}</span>
              </span>
              <span className={`v ${i === 0 ? 'down' : ''}`}>{won(price)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 대형마트 의무휴업: 화면 하단 고정 바(광고 배너 위) + 누르면 바텀시트.
 * 자동으로 열리지 않습니다(검수 기준: 진입 즉시 바텀시트 노출 금지).
 */
function ClosureBar({
  regionName,
  dates,
  note,
  open,
  onOpen,
  onClose,
}: {
  regionName: string;
  dates: string[];
  note?: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
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

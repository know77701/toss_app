import { useMemo, useState } from 'react';
import { won, type MarketData, type MarketItem } from '../lib/data';

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const POPULAR = ['계란', '돼지고기', '쌀', '우유', '양파', '파', '두부', '사과', '배추', '닭고기', '감자', '소고기', '라면', '고등어', '오이', '무', '상추', '토마토', '콩나물', '바나나', '즉석밥', '생수'];

/** 서울시 전통시장 가격 (자치구별 31개 시장, 주 1회) */
export default function MarketSection({ data, regionName }: { data: MarketData | null; regionName: string }) {
  const [query, setQuery] = useState('');
  const [openCode, setOpenCode] = useState<string | null>(null);

  const ordered = useMemo(() => {
    if (!data) return [];
    const used = new Set<string>();
    const top: MarketItem[] = [];
    for (const kw of POPULAR) {
      for (const it of data.items) {
        if (!used.has(it.code) && it.name === kw) {
          used.add(it.code);
          top.push(it);
        }
      }
    }
    return [...top, ...data.items.filter((it) => !used.has(it.code))];
  }, [data]);

  if (regionName !== '서울') {
    return <div className="state">전통시장 가격은 서울시 조사 자료라 서울에서만 볼 수 있습니다.</div>;
  }
  if (!data) return <div className="state">전통시장 가격을 불러오는 중</div>;

  const q = norm(query);
  const shown = q ? ordered.filter((it) => norm(it.name).includes(q)) : ordered;

  return (
    <div>
      <div className="mart-meta">
        서울 전통시장 {data.markets}곳 · 서울시 {data.inspectDay} 조사 · 주 1회 갱신
      </div>
      <div className="search">
        <div className="search-box">
          <input type="search" inputMode="search" placeholder="품목 검색 (예: 계란, 삼겹살, 라면)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="품목 검색" />
          {query && (
            <button className="clear" onClick={() => setQuery('')} aria-label="지우기">
              ✕
            </button>
          )}
        </div>
      </div>
      {shown.length === 0 && <div className="search-empty">'{query.trim()}'에 해당하는 품목이 없습니다.</div>}
      <div className="section">
        {shown.map((it) => {
          const open = openCode === it.code;
          return (
            <div key={it.code} className={`row-wrap ${open ? 'open' : ''}`}>
              <div className="row" role="button" tabIndex={0} onClick={() => setOpenCode(open ? null : it.code)} onKeyDown={(e) => e.key === 'Enter' && setOpenCode(open ? null : it.code)}>
                <div className="name">
                  <div className="t">{it.name}</div>
                  <div className="s">
                    {it.unit ? `${it.unit} · ` : ''}
                    {it.count}개 시장
                  </div>
                </div>
                <div className="price">
                  <div className="p">평균 {won(it.avg)}</div>
                  <div className="c flat">
                    {won(it.min)} ~ {won(it.max)}
                  </div>
                </div>
              </div>
              {open && (
                <div className="expand">
                  <div className="expand-head">
                    <span>가장 싼 시장</span>
                  </div>
                  <div className="chain-list">
                    {it.cheapest.map((c, i) => (
                      <div key={`${c.market}-${i}`} className="chain-row">
                        <span className="n">
                          {c.market} <span className="tag">{c.gu}</span>
                          {c.spec && c.spec !== '-' ? <span className="chain-spec"> {c.spec}</span> : null}
                        </span>
                        <span className={`v ${i === 0 ? 'down' : ''}`}>{won(c.price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="note">출처 서울시 생필품 농수축산물 가격 정보(서울 열린데이터광장). 자치구별 전통시장을 서울시 물가모니터가 주 1회 조사한 값입니다.</div>
    </div>
  );
}

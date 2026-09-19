import type { RecallData, RecallItem } from '../lib/data';

/** 대시보드용 요약 (최근 3건) */
export function RecallStrip({ data, onMore }: { data: RecallData | null; onMore: () => void }) {
  if (!data || data.items.length === 0) return null;
  const top = data.items.slice(0, 3);
  return (
    <div className="section">
      <div className="section-head recall-head">
        <span>회수·판매중지 식품</span>
        <button className="text-btn" onClick={onMore}>
          전체 {data.items.length}건 ›
        </button>
      </div>
      {top.map((r) => (
        <RecallRow key={r.seq} item={r} onClick={onMore} />
      ))}
    </div>
  );
}

function RecallRow({ item, onClick }: { item: RecallItem; onClick?: () => void }) {
  return (
    <div className="row recall-row" role="button" tabIndex={0} onClick={onClick}>
      <div className="name">
        <div className="t">{item.name}</div>
        <div className="s">
          {item.company}
          {item.category ? ` · ${item.category}` : ''}
        </div>
        <div className="recall-reason">{item.reason}</div>
      </div>
      <div className="price">
        <div className="recall-date">{shortDate(item.date)}</div>
        {item.grade && <div className="recall-grade">{item.grade}</div>}
      </div>
    </div>
  );
}

function shortDate(d: string) {
  const m = d.match(/\d{4}-(\d{2})-(\d{2})/);
  return m ? `${+m[1]}.${+m[2]}` : d;
}

/** 전체 목록 화면 */
export default function RecallsScreen({ data, onBack }: { data: RecallData | null; onBack: () => void }) {
  return (
    <div>
      <div className="nav">
        <button className="back" onClick={onBack} aria-label="뒤로">
          ‹
        </button>
        <div className="title">회수·판매중지 식품</div>
        <div className="right" />
      </div>
      {!data || data.items.length === 0 ? (
        <div className="state">최근 회수 정보가 없습니다.</div>
      ) : (
        <div className="section" style={{ marginTop: 4 }}>
          {data.items.map((r) => (
            <div key={r.seq} className="recall-card">
              <div className="recall-card-top">
                <div className="t">{r.name}</div>
                <div className="recall-date">{shortDate(r.date)}</div>
              </div>
              <div className="s">
                {r.company}
                {r.category ? ` · ${r.category}` : ''}
                {r.unit ? ` · ${r.unit}` : ''}
              </div>
              <div className="recall-reason">{r.reason}</div>
              <div className="recall-meta">
                {r.grade && <span>{r.grade}</span>}
                {r.expiry && <span>{r.expiry}</span>}
                {r.barcode && <span>바코드 {r.barcode}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="note">
        출처 식품의약품안전처 식품안전나라 회수·판매중지 정보. 회수등급 1등급이 가장 위해도가 높습니다. 해당 제품을 갖고 있다면 구입처에
        반품하세요.
      </div>
    </div>
  );
}

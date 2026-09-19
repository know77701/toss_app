import { useCallback, useEffect, useMemo, useState } from 'react';
import BannerAd from './components/BannerAd';
import Detail from './components/Detail';
import PriceRow from './components/PriceRow';
import RegionSheet from './components/RegionSheet';
import Settings from './components/Settings';
import { useInterstitial, useRewarded, useTossAdsInit } from './lib/ads';
import { CATEGORY_NAME, DEFAULT_REGION, REGIONS, REGION_UNLOCK_HOURS, REWARD_SLOTS, type Region } from './lib/config';
import {
  fetchHistory,
  fetchPriceData,
  movers,
  orderItems,
  pct,
  searchItems,
  type DisplayItem,
  type HistoryData,
  type PriceData,
} from './lib/data';
import {
  addSlots,
  getFavorites,
  getRegionCode,
  getSlots,
  getUnlockUntil,
  setFavorites,
  setRegionCode,
  setUnlockHours,
} from './lib/favorites';
import { closeMiniApp, onBack } from './lib/toss';

type Screen = { name: 'list' } | { name: 'detail'; item: DisplayItem } | { name: 'settings' };

function formatDate(regday: string): string {
  const m = regday.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return regday;
  return `${Number(m[2])}월 ${Number(m[3])}일`;
}

/** 저장된 지역이 잠겨 있으면(해제 만료) 서울로 되돌립니다 */
function initialRegion(): Region {
  const code = getRegionCode();
  const r = REGIONS.find((x) => x.code === code);
  if (!r) return DEFAULT_REGION;
  if (!r.free && getUnlockUntil() === 0) return DEFAULT_REGION;
  return r;
}

export default function App() {
  const adsReady = useTossAdsInit();
  const { showIfDue } = useInterstitial();
  const { show: showRewarded } = useRewarded();

  const [region, setRegion] = useState<Region>(() => initialRegion());
  const [unlockedUntil, setUnlockedUntil] = useState<number>(() => getUnlockUntil());
  const [sheetOpen, setSheetOpen] = useState(false);

  const [data, setData] = useState<PriceData | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'list' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [favorites, setFavs] = useState<string[]>(() => getFavorites());
  const [slots, setSlots] = useState<number>(() => getSlots());
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // 지역이 바뀔 때마다 데이터 다시 로드
  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setExpandedId(null);
    fetchPriceData(region.code)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    fetchHistory(region.code).then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, [region.code]);

  // 안드로이드 뒤로가기: 시트 → 상세/설정 → 펼침 → 종료
  useEffect(() => {
    return onBack(() => {
      setSheetOpen((open) => {
        if (open) return false;
        setScreen((s) => {
          if (s.name !== 'list') return { name: 'list' };
          setExpandedId((id) => {
            if (id) return null;
            void closeMiniApp();
            return id;
          });
          return s;
        });
        return open;
      });
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const list = useMemo(() => (data ? orderItems(data.items) : []), [data]);
  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const regday = data?.regday ?? '';
  const top = useMemo(() => movers(list, 5), [list]);
  const results = useMemo(() => searchItems(list, query), [list, query]);
  const searching = query.trim().length > 0;

  // 딥링크: ?item=<id>            → 해당 품목 펼친 상태로 목록
  //        ?item=<id>&view=detail → 해당 품목 상세
  // 푸시 알림에서 특정 품목으로 바로 보낼 때 씁니다. (예: intoss://todaymarketprice?item=500-4501-01-)
  useEffect(() => {
    if (!list.length) return;
    const q = new URLSearchParams(location.search);
    const id = q.get('item');
    if (!id) return;
    const target = list.find((x) => x.id === id);
    if (!target) return;
    if (q.get('view') === 'detail') setScreen({ name: 'detail', item: target });
    else setExpandedId(target.id);
  }, [list]);

  const favoriteItems = list.filter((x) => favSet.has(x.id));
  const popularItems = list.filter((x) => x.popularRank != null && !favSet.has(x.id));
  const restItems = list.filter((x) => x.popularRank == null && !favSet.has(x.id));

  const toggleRow = useCallback((item: DisplayItem) => {
    setExpandedId((cur) => (cur === item.id ? null : item.id));
  }, []);

  /** 대시보드에서 품목을 누르면 목록의 해당 행을 펼치고 그 위치로 스크롤 */
  const jumpTo = useCallback((item: DisplayItem) => {
    setExpandedId(item.id);
    requestAnimationFrame(() => {
      document.getElementById(`row-${item.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, []);

  const openDetail = useCallback(
    (item: DisplayItem) => {
      showIfDue();
      setScreen({ name: 'detail', item });
    },
    [showIfDue],
  );

  const toggleFavorite = useCallback(
    (item: DisplayItem) => {
      setFavs((prev) => {
        if (prev.includes(item.id)) {
          const next = prev.filter((id) => id !== item.id);
          setFavorites(next);
          setToast('즐겨찾기에서 뺐습니다');
          return next;
        }
        if (prev.length >= slots) {
          setToast(`즐겨찾기는 ${slots}개까지 등록할 수 있습니다`);
          return prev;
        }
        const next = [...prev, item.id];
        setFavorites(next);
        setToast('즐겨찾기에 추가했습니다');
        return next;
      });
    },
    [slots],
  );

  const watchRewarded = useCallback(() => {
    const ok = showRewarded(() => {
      const next = addSlots(REWARD_SLOTS);
      setSlots(next);
      setToast(`즐겨찾기를 ${next}개까지 등록할 수 있습니다`);
    });
    if (!ok) setToast('지금은 볼 수 있는 광고가 없습니다');
  }, [showRewarded]);

  /** 지역 선택. 잠긴 지역은 보상형 광고 시청 완료 후 열림 */
  const pickRegion = useCallback(
    (r: Region) => {
      const apply = () => {
        setRegion(r);
        setRegionCode(r.code);
        setSheetOpen(false);
        setQuery('');
      };
      if (r.free || getUnlockUntil() > 0) {
        apply();
        return;
      }
      const ok = showRewarded(() => {
        const until = setUnlockHours(REGION_UNLOCK_HOURS);
        setUnlockedUntil(until);
        setToast(`${REGION_UNLOCK_HOURS}시간 동안 모든 지역을 볼 수 있습니다`);
        apply();
      });
      if (!ok) setToast('지금은 볼 수 있는 광고가 없습니다. 잠시 후 다시 시도해 주세요.');
    },
    [showRewarded],
  );

  const rowProps = (it: DisplayItem) => ({
    item: it,
    isFavorite: favSet.has(it.id),
    expanded: expandedId === it.id,
    history,
    regday,
    onToggle: toggleRow,
    onDetail: openDetail,
    onToggleFavorite: toggleFavorite,
  });

  return (
    <div className="app">
      {screen.name === 'list' && (
        <>
          <div className="top">
            <div>
              <h1>장바구니 물가</h1>
              <div className="date">{data ? `${formatDate(data.regday)} ${region.name} 소매가 기준` : ' '}</div>
            </div>
            <div>
              <button className="region-btn" onClick={() => setSheetOpen(true)} aria-label="지역 선택">
                {region.name} ▾
              </button>
              <button className="text-btn" onClick={() => setScreen({ name: 'settings' })}>
                설정
              </button>
            </div>
          </div>

          {error && (
            <div className="state">
              가격 정보를 불러오지 못했습니다.
              <div style={{ marginTop: 16 }}>
                <button className="btn sub" onClick={() => location.reload()}>
                  다시 시도
                </button>
              </div>
            </div>
          )}

          {!error && !data && <div className="state">불러오는 중</div>}

          {data && (
            <div className="search">
              <div className="search-box">
                <input
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  placeholder="품목 검색 (예: 삼겹살, ㅅㄱㅅ)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="품목 검색"
                />
                {query && (
                  <button className="clear" onClick={() => setQuery('')} aria-label="지우기">
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {data && searching && (
            <div className="section" style={{ marginTop: 8 }}>
              <div className="section-head">검색 결과 {results.length}개</div>
              {results.length === 0 ? (
                <div className="search-empty">'{query.trim()}'에 해당하는 품목이 없습니다.</div>
              ) : (
                results.map((it) => <PriceRow key={it.id} {...rowProps(it)} />)
              )}
            </div>
          )}

          {data && !searching && (
            <>
              {/* 대시보드: 어제 대비 상승·하락 상위 5 */}
              <div className="dash">
                <div className="movers">
                  <MoverColumn title="많이 오른 품목" items={top.up} cls="up" onPick={jumpTo} empty="오늘 오른 품목이 없습니다" />
                  <MoverColumn title="많이 내린 품목" items={top.down} cls="down" onPick={jumpTo} empty="오늘 내린 품목이 없습니다" />
                </div>
              </div>

              {/* 즐겨찾기 */}
              <div className="section">
                <div className="section-head">
                  즐겨찾기 {favoriteItems.length > 0 && `${favoriteItems.length}/${slots}`}
                </div>
                {favoriteItems.length === 0 ? (
                  <div className="fav-empty">품목을 누른 뒤 ☆ 즐겨찾기를 누르면 여기에 모입니다.</div>
                ) : (
                  favoriteItems.map((it) => <PriceRow key={it.id} {...rowProps(it)} />)
                )}
              </div>

              <div className="section">
                <div className="section-head">많이 사는 품목</div>
                {popularItems.map((it) => (
                  <PriceRow key={it.id} {...rowProps(it)} />
                ))}
              </div>

              <div className="section">
                <div className="section-head">전체</div>
                {restItems.map((it, i) => {
                  const prev = restItems[i - 1];
                  const newCat = !prev || prev.category !== it.category;
                  return (
                    <div key={it.id}>
                      {newCat && <div className="group-head">{CATEGORY_NAME[it.category] ?? it.categoryName}</div>}
                      <PriceRow {...rowProps(it)} />
                    </div>
                  );
                })}
              </div>

              <div className="note">
                출처 한국농수산식품유통공사 KAMIS 농산물유통정보. {region.name} 지역 소매 조사 결과이며 매장에 따라 실제 판매가는 다를 수
                있습니다.
              </div>
            </>
          )}

          {sheetOpen && (
            <RegionSheet current={region} unlockedUntil={unlockedUntil} onPick={pickRegion} onClose={() => setSheetOpen(false)} />
          )}
        </>
      )}

      {screen.name === 'detail' && (
        <Detail
          item={screen.item}
          isFavorite={favSet.has(screen.item.id)}
          history={history}
          regday={regday}
          regionName={region.name}
          onBack={() => setScreen({ name: 'list' })}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {screen.name === 'settings' && (
        <Settings
          favoritesCount={favorites.length}
          slots={slots}
          onBack={() => setScreen({ name: 'list' })}
          onWatchRewarded={watchRewarded}
          updatedAt={data?.updatedAt ?? ''}
          regday={regday}
          regionName={region.name}
          unlockedUntil={unlockedUntil}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <BannerAd ready={adsReady} />
    </div>
  );
}

function MoverColumn({
  title,
  items,
  cls,
  empty,
  onPick,
}: {
  title: string;
  items: Array<DisplayItem & { pct: number }>;
  cls: 'up' | 'down';
  empty: string;
  onPick: (item: DisplayItem) => void;
}) {
  return (
    <div className="col">
      <div className="col-head">{title}</div>
      {items.length === 0 && <div className="mover-empty">{empty}</div>}
      {items.map((it) => (
        <button key={it.id} className="mover" onClick={() => onPick(it)}>
          <span className="n">{it.label}</span>
          <span className={`v ${cls}`}>{pct(it.pct)}</span>
        </button>
      ))}
    </div>
  );
}

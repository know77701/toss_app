import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BannerAd from './components/BannerAd';
import BasketScreen from './components/Basket';
import Detail from './components/Detail';
import MartScreen from './components/Mart';
import PriceRow from './components/PriceRow';
import RecallsScreen, { RecallStrip } from './components/Recalls';
import RegionSheet from './components/RegionSheet';
import Settings from './components/Settings';
import { useInterstitial, useRewarded, useTossAdsInit } from './lib/ads';
import { CATEGORY_NAME, DEFAULT_REGION, REGIONS, REGION_UNLOCK_HOURS, REWARD_SLOTS, type BasketPreset, type Region } from './lib/config';
import {
  applyPreset,
  cheapNow,
  errorStatus,
  fetchGeo,
  fetchHistory,
  fetchMarket,
  fetchMart,
  fetchPriceData,
  fetchRecalls,
  martBasketTotals,
  movers,
  orderItems,
  pct,
  presetById,
  searchItems,
  won,
  type BasketEntry,
  type DisplayItem,
  type GeoData,
  type HistoryData,
  type MarketData,
  type MartData,
  type MartProduct,
  type PriceData,
  type RecallData,
} from './lib/data';
import {
  addSlots,
  getBasket,
  getFavorites,
  getRegionCode,
  getSlots,
  getUnlockUntil,
  setBasket as saveBasket,
  setFavorites,
  setRegionCode,
  setUnlockHours,
} from './lib/favorites';
import { closeMiniApp, onBack } from './lib/toss';

type Screen = { name: 'list' } | { name: 'detail'; item: DisplayItem } | { name: 'settings' } | { name: 'recalls' };
type Tab = 'fresh' | 'mart' | 'basket';

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
  const [recalls, setRecalls] = useState<RecallData | null>(null);
  const [mart, setMart] = useState<MartData | null>(null);
  const [martLoading, setMartLoading] = useState(false);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [tab, setTab] = useState<Tab>('fresh');
  const [error, setError] = useState<{ message: string; status: number | null } | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'list' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [favorites, setFavs] = useState<string[]>(() => getFavorites());
  const [basket, setBasketState] = useState<BasketEntry[]>(() => getBasket());
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [slots, setSlots] = useState<number>(() => getSlots());
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    document.body.style.overflow = screen.name !== 'list' ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [screen.name]);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setShowTop(window.scrollY > 320);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 회수 정보는 작아서 바로. 좌표·전통시장은 마트/장바구니 탭을 열 때 처음 한 번만.
  useEffect(() => {
    fetchRecalls().then(setRecalls);
  }, []);
  const [extrasLoaded, setExtrasLoaded] = useState(false);
  const loadExtras = useCallback(() => {
    if (extrasLoaded) return;
    setExtrasLoaded(true);
    fetchGeo().then(setGeo);
    fetchMarket().then(setMarket);
  }, [extrasLoaded]);

  // 지역이 바뀔 때: 가격 파일 먼저 받아 첫 화면을 띄우고, 이력은 그 다음에
  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    setExpandedId(null);
    setHistory(null);
    setMart(null);
    setMartLoaded(false);
    fetchPriceData(region.code)
      .then((d) => {
        if (!alive) return;
        setData(d);
        fetchHistory(region.code).then((h) => alive && setHistory(h));
      })
      .catch((e: Error) => alive && setError({ message: e.message, status: errorStatus(e) }));
    return () => {
      alive = false;
    };
  }, [region.code]);

  // 마트 파일(가장 큼)은 마트·장바구니 탭을 열거나, 장바구니에 마트 상품이 있을 때만
  const [martLoaded, setMartLoaded] = useState(false);
  const needMart = tab === 'mart' || tab === 'basket' || basket.some((b) => b.kind === 'mart');
  useEffect(() => {
    if (!data || !needMart || martLoaded) return;
    let alive = true;
    setMartLoaded(true);
    setMartLoading(true);
    loadExtras();
    fetchMart(region.code).then((m) => {
      if (!alive) return;
      setMart(m);
      setMartLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [data, needMart, martLoaded, region.code, loadExtras]);

  // 뒤로가기(상단 < 버튼, 안드로이드 뒤로가기): 한 단계씩 되돌리고, 홈에서만 "나가시겠어요?" 확인
  const [exitAsk, setExitAsk] = useState(false);
  const navRef = useRef({ sheetOpen: false, exitAsk: false, screen: 'list' as Screen['name'], tab: 'fresh' as Tab, expandedId: null as string | null, query: '' });
  navRef.current = { sheetOpen, exitAsk, screen: screen.name, tab, expandedId, query };
  useEffect(() => {
    return onBack(() => {
      const n = navRef.current;
      if (n.exitAsk) {
        setExitAsk(false);
        return false;
      }
      if (n.sheetOpen) {
        setSheetOpen(false);
        return false;
      }
      if (n.screen !== 'list') {
        setScreen({ name: 'list' });
        return false;
      }
      if (n.query) {
        setQuery('');
        return false;
      }
      if (n.expandedId) {
        setExpandedId(null);
        return false;
      }
      if (n.tab !== 'fresh') {
        setTab('fresh');
        return false;
      }
      setExitAsk(true); // 홈: 바로 닫지 않고 확인
      return false;
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const list = useMemo(() => (data ? orderItems(data.items) : []), [data]);
  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const basketFreshIds = useMemo(() => new Set(basket.filter((b) => b.kind === 'fresh').map((b) => b.id)), [basket]);
  const basketMartIds = useMemo(() => new Set(basket.filter((b) => b.kind === 'mart').map((b) => b.id)), [basket]);
  const regday = data?.regday ?? '';
  const top = useMemo(() => movers(list, 5), [list]);
  const results = useMemo(() => searchItems(list, query), [list, query]);
  const cheap = useMemo(() => cheapNow(list, 5), [list]);
  const searching = query.trim().length > 0;

  // 딥링크: ?item=<id> / ?item=<id>&view=detail / ?tab=mart|basket
  useEffect(() => {
    if (!list.length) return;
    const q = new URLSearchParams(location.search);
    const t = q.get('tab');
    if (t === 'mart' || t === 'basket') setTab(t);
    const pr = presetById(q.get('preset'));
    if (pr) {
      const { entries } = applyPreset(pr, list, mart);
      if (entries.length) {
        setBasketState(entries);
        saveBasket(entries);
        setActivePreset(pr.id);
        setTab('basket');
      }
    }
    const id = q.get('item');
    if (!id) return;
    const target = list.find((x) => x.id === id);
    if (!target) return;
    if (q.get('view') === 'detail') setScreen({ name: 'detail', item: target });
    else setExpandedId(target.id);
  }, [list, mart]);

  const favoriteItems = list.filter((x) => favSet.has(x.id));
  const popularItems = list.filter((x) => x.popularRank != null && !favSet.has(x.id));
  const restItems = list.filter((x) => x.popularRank == null && !favSet.has(x.id));

  // 대시보드용 장바구니 요약
  const basketSummary = useMemo(() => {
    const fresh = basket
      .filter((b) => b.kind === 'fresh')
      .map((b) => ({ b, it: list.find((x) => x.id === b.id) }))
      .filter((x): x is { b: BasketEntry; it: DisplayItem } => !!x.it);
    const today = fresh.reduce((s, { b, it }) => s + (it.prices.d1 ?? 0) * b.qty, 0);
    const month = fresh.reduce((s, { b, it }) => s + (it.prices.d5 ?? it.prices.d1 ?? 0) * b.qty, 0);
    const martT = mart ? martBasketTotals(mart, basket) : null;
    const cheapest = martT && martT.totals.length ? { store: mart!.stores[martT.totals[0].storeIdx], total: martT.totals[0].total } : null;
    return { count: basket.length, freshCount: fresh.length, today, month, martAvg: martT?.avgTotal ?? 0, martCount: martT?.items ?? 0, cheapest };
  }, [basket, list, mart]);

  const toggleRow = useCallback((item: DisplayItem) => {
    setExpandedId((cur) => (cur === item.id ? null : item.id));
  }, []);

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

  // ── 장바구니
  const updateBasket = useCallback((fn: (prev: BasketEntry[]) => BasketEntry[]) => {
    setBasketState((prev) => {
      const next = fn(prev);
      saveBasket(next);
      return next;
    });
  }, []);
  const addToBasket = useCallback(
    (kind: 'fresh' | 'mart', id: string, name: string) => {
      setActivePreset(null);
      updateBasket((prev) => {
        const i = prev.findIndex((b) => b.kind === kind && b.id === id);
        if (i >= 0) return prev.map((b, j) => (j === i ? { ...b, qty: b.qty + 1 } : b));
        return [...prev, { kind, id, qty: 1 }];
      });
      setToast(`${name} 담았습니다`);
    },
    [updateBasket],
  );
  const addFresh = useCallback((it: DisplayItem) => addToBasket('fresh', it.id, it.label), [addToBasket]);
  const addMart = useCallback((p: MartProduct) => addToBasket('mart', p.id, p.name), [addToBasket]);
  const changeQty = useCallback(
    (entry: BasketEntry, delta: number) =>
      updateBasket((prev) => prev.map((b) => (b.kind === entry.kind && b.id === entry.id ? { ...b, qty: Math.max(1, b.qty + delta) } : b))),
    [updateBasket],
  );
  const usePreset = useCallback(
    (preset: BasketPreset, mode: 'add' | 'replace') => {
      const { entries, missing } = applyPreset(preset, list, mart);
      if (entries.length === 0) {
        setToast('이 지역 데이터에 프리셋 재료가 없습니다');
        return;
      }
      if (mode === 'replace') {
        updateBasket(() => entries);
        setActivePreset(preset.id);
      } else {
        // 추가: 이미 있는 품목은 수량을 더 큰 쪽으로만 맞추고(중복 합산 방지), 없는 품목만 새로 넣음
        updateBasket((prev) => {
          const next = [...prev];
          for (const e of entries) {
            const i = next.findIndex((b) => b.kind === e.kind && b.id === e.id);
            if (i >= 0) next[i] = { ...next[i], qty: Math.max(next[i].qty, e.qty) };
            else next.push(e);
          }
          return next;
        });
        setActivePreset((cur) => (cur && basket.length ? null : preset.id));
      }
      setToast(missing.length ? `${preset.name} ${entries.length}가지 담았습니다 (${missing.join(', ')} 제외)` : `${preset.name} ${entries.length}가지 담았습니다`);
    },
    [list, mart, updateBasket, basket.length],
  );
  const previewPreset = useCallback(
    (preset: BasketPreset) => {
      const { entries, missing } = applyPreset(preset, list, mart);
      return { count: entries.length, missing };
    },
    [list, mart],
  );
  const clearBasket = useCallback(() => {
    updateBasket(() => []);
    setActivePreset(null);
    setToast('장바구니를 비웠습니다');
  }, [updateBasket]);
  const removeEntry = useCallback((entry: BasketEntry) => updateBasket((prev) => prev.filter((b) => !(b.kind === entry.kind && b.id === entry.id))), [updateBasket]);

  // ── 내 위치 (버튼을 눌렀을 때만 요청, 저장하지 않음)
  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setToast('이 기기에서는 위치를 쓸 수 없습니다');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setToast('내 위치 기준 거리를 표시합니다');
      },
      () => setToast('위치 권한이 없어 거리를 표시할 수 없습니다'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }, []);

  const watchRewarded = useCallback(() => {
    const ok = showRewarded(() => {
      const next = addSlots(REWARD_SLOTS);
      setSlots(next);
      setToast(`즐겨찾기를 ${next}개까지 등록할 수 있습니다`);
    });
    if (!ok) setToast('지금은 볼 수 있는 광고가 없습니다');
  }, [showRewarded]);

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
    inBasket: basketFreshIds.has(it.id),
    expanded: expandedId === it.id,
    history,
    regday,
    onToggle: toggleRow,
    onDetail: openDetail,
    onToggleFavorite: toggleFavorite,
    onAddBasket: addFresh,
  });

  return (
    <div className={`app ${tab === 'mart' ? 'has-closure' : ''} ${screen.name !== 'list' ? 'modal-open' : ''}`}>
      {(
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

          {error && error.status === 404 && (
            <div className="state nodata">
              <div className="nodata-t">{region.name} 데이터가 아직 없어요</div>
              <div className="nodata-s">
                새로 추가된 지역은 반영까지 하루가 걸려요.
                <br />
                다른 도시를 보시거나 내일 다시 확인해 주세요.
              </div>
              <div className="nodata-actions">
                <button className="btn" onClick={() => setSheetOpen(true)}>
                  다른 지역 보기
                </button>
                <button className="btn sub" onClick={() => pickRegion(DEFAULT_REGION)}>
                  서울로 보기
                </button>
              </div>
            </div>
          )}
          {error && error.status !== 404 && (
            <div className="state">
              가격 정보를 불러오지 못했습니다.
              <div className="nodata-s">네트워크를 확인한 뒤 다시 시도해 주세요.</div>
              <div style={{ marginTop: 16 }}>
                <button className="btn sub" onClick={() => location.reload()}>
                  다시 시도
                </button>
              </div>
            </div>
          )}

          {!error && !data && <div className="state">불러오는 중</div>}

          {data && (
            <div className="tabs" role="tablist">
              <button role="tab" className={tab === 'fresh' ? 'on' : ''} onClick={() => setTab('fresh')}>
                농축수산물
              </button>
              <button role="tab" className={tab === 'mart' ? 'on' : ''} onClick={() => setTab('mart')}>
                마트·시장
              </button>
              <button role="tab" className={tab === 'basket' ? 'on' : ''} onClick={() => setTab('basket')}>
                장바구니{basket.length > 0 ? ` ${basket.length}` : ''}
              </button>
            </div>
          )}

          {data && tab === 'basket' && (
            <BasketScreen
              entries={basket}
              freshItems={list}
              mart={mart}
              geo={geo}
              userPos={userPos}
              regionName={region.name}
              onQty={changeQty}
              onRemove={removeEntry}
              onGoFresh={() => setTab('fresh')}
              onGoMart={() => setTab('mart')}
              onLocate={locate}
              onPreset={usePreset}
              onClear={clearBasket}
              activePreset={activePreset}
              previewPreset={previewPreset}
            />
          )}

          {data && tab === 'mart' && (
            <MartScreen
              data={mart}
              loading={martLoading}
              regionName={region.name}
              regionCode={region.code}
              market={market}
              geo={geo}
              userPos={userPos}
              basketIds={basketMartIds}
              onAddBasket={addMart}
              onLocate={locate}
            />
          )}

          {data && tab === 'fresh' && (
            <div className="search">
              <div className="search-box">
                <input type="search" inputMode="search" enterKeyHint="search" placeholder="품목 검색 (예: 삼겹살, ㅅㄱㅅ)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="품목 검색" />
                {query && (
                  <button className="clear" onClick={() => setQuery('')} aria-label="지우기">
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {data && tab === 'fresh' && searching && (
            <div className="section" style={{ marginTop: 8 }}>
              <div className="section-head">검색 결과 {results.length}개</div>
              {results.length === 0 ? <div className="search-empty">'{query.trim()}'에 해당하는 품목이 없습니다.</div> : results.map((it) => <PriceRow key={it.id} {...rowProps(it)} />)}
            </div>
          )}

          {data && tab === 'fresh' && !searching && (
            <>
              {basketSummary.count > 0 && (
                <button className="basket-card" onClick={() => setTab('basket')}>
                  <div className="basket-card-l">
                    <div className="k">{activePreset ? presetById(activePreset)?.name : '내 장바구니'} {basketSummary.count}개</div>
                    <div className="v">
                      {basketSummary.freshCount > 0 && <span>{won(basketSummary.today)}</span>}
                      {basketSummary.freshCount > 0 && basketSummary.month > 0 && (
                        <span className={`d ${basketSummary.today > basketSummary.month ? 'up' : basketSummary.today < basketSummary.month ? 'down' : 'flat'}`}>
                          {basketSummary.today >= basketSummary.month ? '+' : ''}
                          {won(Math.round(basketSummary.today - basketSummary.month))} 지난달 대비
                        </span>
                      )}
                    </div>
                    {basketSummary.cheapest && (
                      <div className="s">
                        마트 상품 가장 싼 곳 {basketSummary.cheapest.store.name} {won(basketSummary.cheapest.total)}
                      </div>
                    )}
                  </div>
                  <div className="basket-card-r">›</div>
                </button>
              )}

              <div className="dash">
                <div className="movers">
                  <MoverColumn title="많이 오른 품목" items={top.up} cls="up" onPick={jumpTo} empty="오늘 오른 품목이 없습니다" />
                  <MoverColumn title="많이 내린 품목" items={top.down} cls="down" onPick={jumpTo} empty="오늘 내린 품목이 없습니다" />
                </div>
              </div>

              {cheap.length > 0 && (
                <div className="section">
                  <div className="section-head">지금 싸요</div>
                  <div className="cheap">
                    {cheap.map(({ item, pct: p, base }) => (
                      <button key={item.id} className="cheap-row" onClick={() => jumpTo(item)}>
                        <span className="n">{item.label}</span>
                        <span className="d down">{base}보다 {Math.round(p)}% 싸요</span>
                        <span className="v">
                          {won(item.prices.d1)}
                          <small>/{item.unit}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="section">
                <div className="section-head">즐겨찾기 {favoriteItems.length > 0 && `${favoriteItems.length}/${slots}`}</div>
                {favoriteItems.length === 0 ? <div className="fav-empty">품목을 누른 뒤 ☆ 즐겨찾기를 누르면 여기에 모입니다.</div> : favoriteItems.map((it) => <PriceRow key={it.id} {...rowProps(it)} />)}
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

              <RecallStrip data={recalls} onMore={() => setScreen({ name: 'recalls' })} />

              <div className="note">출처 공공데이터포털 한국농수산식품유통공사 농산물유통정보. {region.name} 지역 소매 조사 결과이며 매장에 따라 실제 판매가는 다를 수 있습니다.</div>
            </>
          )}

          {sheetOpen && <RegionSheet current={region} unlockedUntil={unlockedUntil} onPick={pickRegion} onClose={() => setSheetOpen(false)} />}
        </>
      )}

      {/* 상세·설정·회수: 홈 위에 덮는 모달. 상단 X 또는 뒤로가기로 닫히고 홈 스크롤 위치는 그대로 */}
      {screen.name !== 'list' && (
        <>
          <div className="modal-bg" onClick={() => setScreen({ name: 'list' })} />
          <div className="modal" role="dialog">
            <div className="modal-handle" />
          {screen.name === 'detail' && (
            <Detail item={screen.item} isFavorite={favSet.has(screen.item.id)} history={history} regday={regday} regionName={region.name} onBack={() => setScreen({ name: 'list' })} onToggleFavorite={toggleFavorite} />
          )}
          {screen.name === 'recalls' && <RecallsScreen data={recalls} onBack={() => setScreen({ name: 'list' })} />}
          {screen.name === 'settings' && (
            <Settings favoritesCount={favorites.length} slots={slots} onBack={() => setScreen({ name: 'list' })} onWatchRewarded={watchRewarded} updatedAt={data?.updatedAt ?? ''} regday={regday} regionName={region.name} unlockedUntil={unlockedUntil} />
          )}
          </div>
        </>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {showTop && screen.name === 'list' && (
        <button className={`to-top ${tab === 'mart' ? 'lift' : ''}`} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="맨 위로">
          ↑
        </button>
      )}

      {exitAsk && (
        <>
          <div className="sheet-bg" onClick={() => setExitAsk(false)} />
          <div className="sheet" role="dialog" aria-label="나가기">
            <div className="sheet-title">장바구니 물가를 나갈까요?</div>
            <div className="sheet-desc">즐겨찾기와 장바구니는 그대로 남아 있어요.</div>
            <div style={{ padding: '4px 20px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn" style={{ margin: 0, width: '100%' }} onClick={() => void closeMiniApp()}>
                나가기
              </button>
              <button className="btn sub" style={{ margin: 0, width: '100%' }} onClick={() => setExitAsk(false)}>
                계속 보기
              </button>
            </div>
          </div>
        </>
      )}

      <BannerAd ready={adsReady} />
    </div>
  );
}

function MoverColumn({ title, items, cls, empty, onPick }: { title: string; items: Array<DisplayItem & { pct: number }>; cls: 'up' | 'down'; empty: string; onPick: (item: DisplayItem) => void }) {
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

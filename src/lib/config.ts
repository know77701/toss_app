/**
 * 앱 전역 설정. 값은 .env 에서 바꾸세요. (.env.example 참고)
 */
export const DATA_URL: string =
  (import.meta.env.VITE_DATA_URL as string | undefined)?.trim() || '/data/prices.json';

export const AD = {
  banner: (import.meta.env.VITE_AD_BANNER_ID as string | undefined) || 'ait-ad-test-banner-id',
  interstitial:
    (import.meta.env.VITE_AD_INTERSTITIAL_ID as string | undefined) || 'ait-ad-test-interstitial-id',
  rewarded: (import.meta.env.VITE_AD_REWARDED_ID as string | undefined) || 'ait-ad-test-rewarded-id',
};

/** 상세 화면을 몇 번 열 때마다 전면형 광고를 1번 보여줄지. 너무 잦으면 검수에서 지적됩니다. */
export const INTERSTITIAL_EVERY_N_DETAIL_OPENS = 10;

/** 무료로 등록할 수 있는 즐겨찾기 수. 초과분은 보상형 광고 시청으로 +REWARD_SLOTS 개씩 늘어납니다. */
export const FREE_FAVORITE_SLOTS = 3;
export const REWARD_SLOTS = 3;

/**
 * "사람들이 많이 사는 품목" 우선순위.
 * 위에서부터 순서대로 리스트 상단에 고정됩니다. KAMIS 품목명(item)과 품종명(kind)의 부분 일치로 찾습니다.
 * 데이터에 없는 품목은 자동으로 건너뜁니다. 순서는 마음대로 바꾸세요.
 */
export type PopularMatcher = { item: string; kind?: string; label: string };

export const POPULAR: PopularMatcher[] = [
  { item: '계란', label: '계란' },
  { item: '돼지고기', kind: '삼겹살', label: '삼겹살' },
  { item: '쌀', label: '쌀' },
  { item: '양파', label: '양파' },
  { item: '파', kind: '대파', label: '대파' },
  { item: '사과', label: '사과' },
  { item: '배추', label: '배추' },
  { item: '닭고기', label: '닭고기' },
  { item: '감자', label: '감자' },
  { item: '쇠고기', kind: '등심', label: '소고기 등심' },
  { item: '돼지고기', kind: '목살', label: '돼지 목살' },
  { item: '깐마늘', label: '깐마늘' },
  { item: '토마토', label: '토마토' },
  { item: '바나나', label: '바나나' },
  { item: '고등어', label: '고등어' },
  { item: '오이', label: '오이' },
  { item: '무', label: '무' },
  { item: '상추', label: '상추' },
  { item: '호박', kind: '애호박', label: '애호박' },
  { item: '감귤', label: '감귤' },
  { item: '배', label: '배' },
  { item: '딸기', label: '딸기' },
  { item: '오징어', label: '오징어' },
  { item: '김', label: '김' },
  { item: '두부', label: '두부' },
  { item: '시금치', label: '시금치' },
  { item: '당근', label: '당근' },
  { item: '고구마', label: '고구마' },
];

/** 인기 품목 아래에 나머지를 붙일 때의 부류 순서 */
export const CATEGORY_ORDER = ['500', '100', '200', '400', '600', '300'];

export const CATEGORY_NAME: Record<string, string> = {
  '100': '식량작물',
  '200': '채소류',
  '300': '특용작물',
  '400': '과일류',
  '500': '축산물',
  '600': '수산물',
};

/**
 * 지역. 서울은 항상 무료, 나머지는 보상형 광고를 보면 REGION_UNLOCK_HOURS 동안 열립니다.
 * code 는 KAMIS 소매 지역코드. 수집 스크립트(scripts/fetch-prices.mjs)의 REGIONS 와 같아야 합니다.
 */
export type Region = { code: string; name: string; free?: boolean };
export const REGIONS: Region[] = [
  { code: '1101', name: '서울', free: true },
  { code: '2100', name: '부산' },
  { code: '2200', name: '대구' },
  { code: '2300', name: '인천' },
  { code: '2401', name: '광주' },
  { code: '2501', name: '대전' },
  { code: '2601', name: '울산' },
];
export const DEFAULT_REGION = REGIONS[0];
export const REGION_UNLOCK_HOURS = 24;

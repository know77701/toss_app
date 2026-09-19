/**
 * 앱 전역 설정. 값은 .env 에서 바꾸세요. (README 의 환경변수 목록 참고)
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
 * 위에서부터 순서대로 리스트 상단에 고정됩니다. 공공데이터포털 품목명(item)은 정확히, 품종(kind)·등급(rank)은 부분 일치로 찾습니다.
 * 데이터에 없는 품목은 자동으로 건너뜁니다. 순서는 마음대로 바꾸세요.
 */
export type PopularMatcher = { item: string; kind?: string; rank?: string; label: string };

/**
 * item 은 공공데이터포털 품목명과 정확히 일치, kind/rank 는 부분 일치.
 * (실제 표기 예: 돼지/삼겹살, 소/등심/1등급, 닭/육계10호, 계란/특란30구/일반란, 파/대파, 호박/애호박)
 */
export const POPULAR: PopularMatcher[] = [
  { item: '계란', kind: '특란30구', rank: '일반', label: '계란 30구' },
  { item: '돼지', kind: '삼겹살', label: '삼겹살' },
  { item: '쌀', kind: '20kg', label: '쌀 20kg' },
  { item: '우유', label: '우유' },
  { item: '양파', label: '양파' },
  { item: '파', kind: '대파', label: '대파' },
  { item: '두부', label: '두부' },
  { item: '사과', label: '사과' },
  { item: '배추', label: '배추' },
  { item: '닭', kind: '육계', label: '닭고기' },
  { item: '감자', label: '감자' },
  { item: '소', kind: '등심', rank: '1등급', label: '소고기 등심' },
  { item: '돼지', kind: '목심', label: '돼지 목심' },
  { item: '즉석밥', label: '즉석밥' },
  { item: '깐마늘(국산)', label: '깐마늘' },
  { item: '토마토', label: '토마토' },
  { item: '바나나', label: '바나나' },
  { item: '고등어', kind: '신선', rank: '中', label: '고등어' },
  { item: '오이', kind: '다다기', label: '오이' },
  { item: '무', label: '무' },
  { item: '상추', kind: '적', label: '상추' },
  { item: '호박', kind: '애호박', label: '애호박' },
  { item: '김치', label: '포기김치' },
  { item: '콩나물', label: '콩나물' },
  { item: '감귤', label: '감귤' },
  { item: '배', kind: '신고', label: '배' },
  { item: '딸기', label: '딸기' },
  { item: '물오징어', kind: '신선', label: '오징어' },
  { item: '김', kind: '마른김', label: '김' },
  { item: '시금치', label: '시금치' },
  { item: '당근', label: '당근' },
  { item: '고구마', label: '고구마' },
];

/** 인기 품목 아래에 나머지를 붙일 때의 부류 순서 */
export const CATEGORY_ORDER = ['500', '800', '100', '200', '400', '600', '300'];

export const CATEGORY_NAME: Record<string, string> = {
  '100': '식량작물',
  '200': '채소류',
  '300': '특용작물',
  '400': '과일류',
  '500': '축산물',
  '600': '수산물',
  '800': '가공식품',
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

/**
 * 마트 물가 탭에서 앞에 보여줄 생필품 규칙 (순서대로).
 * kw: 상품명 부분 일치 · not: 이 단어가 들어가면 제외 · max: 키워드당 최대 개수(기본 2)
 * 참가격 실제 상품명 기준으로 맞춘 목록입니다. 예) 햇반(210g)만, 죽·컵반은 제외
 */
export type MartPopularRule = { kw: string; not?: string[]; max?: number };
export const MART_POPULAR: MartPopularRule[] = [
  { kw: '신라면', not: ['사발', '컵'] },
  { kw: '진라면', not: ['사발', '컵'], max: 1 },
  { kw: '삼양라면', not: ['사발', '컵'], max: 1 },
  { kw: '너구리', not: ['사발', '컵'], max: 1 },
  { kw: '햇반', not: ['죽', '컵반', '국밥', '덮밥', '볶음밥', '스팸'] },
  { kw: '흰우유' },
  { kw: '계란' },
  { kw: '삼다수', not: ['*'] },
  { kw: '아이시스', not: ['*'], max: 1 },
  { kw: '크리넥스', not: ['물티슈', '미용티슈'], max: 2 },
  { kw: '물티슈', max: 2 },
  { kw: '세제', not: ['주방'], max: 2 },
  { kw: '샴푸', max: 2 },
  { kw: '치약', max: 1 },
  { kw: '칫솔', max: 1 },
  { kw: '바디워시', max: 1 },
  { kw: '동원참치', max: 1 },
  { kw: '스팸', not: ['볶음밥'], max: 1 },
  { kw: '식용유', max: 1 },
  { kw: '하얀설탕', max: 1 },
  { kw: '꽃소금', max: 1 },
  { kw: '간장', max: 2 },
  { kw: '고추장', max: 1 },
  { kw: '된장', max: 1 },
  { kw: '마요네즈', max: 1 },
  { kw: '케찹', max: 1 },
  { kw: '커피믹스', max: 1 },
  { kw: '코카콜라', max: 1 },
  { kw: '두부', not: ['진밥'], max: 2 },
  { kw: '포기', max: 2 },
  { kw: '만두', max: 2 },
  { kw: '치즈', not: ['버터'], max: 1 },
  { kw: '서울우유 버터', max: 1 },
  { kw: '새우깡', max: 1 },
  { kw: '초코파이', max: 1 },
  { kw: '참이슬', max: 1 },
  { kw: '카스 프레쉬', max: 1 },
  { kw: '테라', max: 1 },
];

/**
 * 대형마트 의무휴업 규칙 (유통산업발전법 12조의2, 지자체 조례로 월 2회).
 * 전국 기본은 둘째·넷째 일요일이고, 일부 지자체는 평일로 바꿨습니다. 자치구·점포별 예외가 있어 안내 문구로만 씁니다.
 * weekday: 0=일 … 6=토, weeks: 그 요일의 n번째(1부터)
 */
export type ClosureRule = { weekday: number; weeks: number[]; note?: string };
export const MART_CLOSURE: Record<string, ClosureRule> = {
  default: { weekday: 0, weeks: [2, 4] },
  '1101': { weekday: 0, weeks: [2, 4], note: '서초·동대문·중구 등 일부 자치구는 평일 휴무' },
  '2100': { weekday: 1, weeks: [2, 4], note: '2024년부터 둘째·넷째 월요일' },
  '2200': { weekday: 1, weeks: [2, 4], note: '2023년부터 둘째·넷째 월요일' },
  '2300': { weekday: 0, weeks: [2, 4] },
  '2401': { weekday: 0, weeks: [2, 4] },
  '2501': { weekday: 0, weeks: [2, 4] },
  '2601': { weekday: 0, weeks: [2, 4] },
};

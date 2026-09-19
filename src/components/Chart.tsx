import { shortDate, won, type Point } from '../lib/data';

type Props = {
  points: Point[];
  height?: number;
  /** 아래에 시작·끝 날짜 표시 */
  showDates?: boolean;
  /** 최고·최저 가격 라벨 표시 */
  showMinMax?: boolean;
};

/**
 * 의존성 없는 SVG 선 그래프. x축은 실제 날짜 간격, y축은 최소~최대에 여백.
 * 점이 적으면(≤ 8) 각 점에 작은 원을 찍어 "며칠 치 데이터인지" 보이게 합니다.
 */
export default function Chart({ points, height = 80, showDates = false, showMinMax = false }: Props) {
  if (points.length < 2) return null;

  const W = 320;
  const H = height;
  const padX = 4;
  const padTop = showMinMax ? 16 : 6;
  const padBottom = showMinMax ? 16 : 6;

  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points[points.length - 1].date);
  const span = Math.max(1, t1 - t0);
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || Math.max(1, min * 0.02);

  const x = (p: Point) => padX + ((Date.parse(p.date) - t0) / span) * (W - padX * 2);
  const y = (v: number) => padTop + (1 - (v - min) / range) * (H - padTop - padBottom);

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const first = points[0].price;
  const last = points[points.length - 1].price;
  const color = last > first ? 'var(--red)' : last < first ? 'var(--blue)' : 'var(--text-3)';

  const iMin = prices.indexOf(min);
  const iMax = prices.indexOf(max);
  const anchor = (px: number) => (px < W * 0.2 ? 'start' : px > W * 0.8 ? 'end' : 'middle');

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden>
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {points.length <= 8 &&
          points.map((p) => <circle key={p.date} cx={x(p)} cy={y(p.price)} r="3" fill={color} />)}
        {showMinMax && iMax !== iMin && (
          <>
            <text x={x(points[iMax])} y={y(max) - 5} fontSize="11" fill="var(--text-3)" textAnchor={anchor(x(points[iMax]))}>
              {won(max)}
            </text>
            <text x={x(points[iMin])} y={y(min) + 13} fontSize="11" fill="var(--text-3)" textAnchor={anchor(x(points[iMin]))}>
              {won(min)}
            </text>
          </>
        )}
      </svg>
      {showDates && (
        <div className="chart-dates">
          <span>{shortDate(points[0].date)}</span>
          <span>{shortDate(points[points.length - 1].date)}</span>
        </div>
      )}
    </div>
  );
}

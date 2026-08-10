'use client';

import { cn } from '@vocaliq/ui';

/**
 * Zero-dependency SVG charts (Day 41). Purpose-built + lightweight (no Recharts/visx bundle)
 * so a self-hosted CodeCanyon buyer ships a lean app. They follow DESIGN-SYSTEM §5d — calm,
 * data-dense, a one-shot draw-in (CSS), mono numbers. See BUILD-LOG for the Recharts note.
 */

export interface Point {
  label: string;
  value: number;
}

const W = 320;
const H = 96;
const PAD = 8;

/** A smooth-ish line/area chart for a trend (sentiment, calls). */
export function LineChart({
  data,
  color = 'var(--vq-violet, #7c5cff)',
  format = (n: number) => n.toFixed(2),
}: {
  data: Point[];
  color?: string;
  format?: (n: number) => string;
}) {
  if (data.length === 0) return <Empty />;
  const values = data.map((d) => d.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0.0001);
  const span = max - min || 1;
  const x = (i: number) =>
    PAD + (data.length === 1 ? (W - 2 * PAD) / 2 : (i / (data.length - 1)) * (W - 2 * PAD));
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.value)}`).join(' ');
  const area = `${line} L${x(data.length - 1)},${H - PAD} L${x(0)},${H - PAD} Z`;

  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="img" aria-label="Trend chart">
        <path d={area} fill={color} opacity={0.12} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="vq-draw"
          pathLength={1}
        />
        {data.map((d, i) => (
          <circle key={d.label} cx={x(i)} cy={y(d.value)} r={2.5} fill={color} />
        ))}
      </svg>
      <div className="flex justify-between font-mono text-[10px] text-vq-text-lo">
        <span>{data[0]?.label}</span>
        <span>
          {format(min)} – {format(max)}
        </span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </figure>
  );
}

/** A horizontal bar chart for categorical values (outcomes, cost by day). */
export function BarChart({
  data,
  color = 'var(--vq-cyan, #22d3ee)',
  format = (n: number) => String(n),
}: {
  data: Point[];
  color?: string;
  format?: (n: number) => string;
}) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 0.0001);
  return (
    <div className="flex flex-col gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-vq-text-lo text-xs" title={d.label}>
            {d.label}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-vq-pill bg-vq-bg-base">
            <div
              className="vq-grow h-full rounded-vq-pill"
              style={{ width: `${(d.value / max) * 100}%`, background: color }}
            />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-vq-text-hi text-xs">
            {format(d.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A two-segment ratio bar (talk vs listen). */
export function RatioBar({
  ratio,
  leftLabel,
  rightLabel,
}: { ratio: number; leftLabel: string; rightLabel: string }) {
  const pct = Math.round(ratio * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-4 overflow-hidden rounded-vq-pill">
        <div
          className="vq-grow flex items-center justify-start bg-vq-violet pl-2 text-[10px] text-white"
          style={{ width: `${pct}%` }}
        >
          {pct >= 15 ? `${pct}%` : ''}
        </div>
        <div className="flex flex-1 items-center justify-end bg-vq-cyan pr-2 text-[10px] text-vq-bg-base">
          {100 - pct >= 15 ? `${100 - pct}%` : ''}
        </div>
      </div>
      <div className="flex justify-between text-vq-text-lo text-xs">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className={cn('flex h-24 items-center justify-center text-sm text-vq-text-lo')}>
      No data in this range
    </div>
  );
}

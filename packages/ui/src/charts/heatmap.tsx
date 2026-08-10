'use client';

import { cn } from '../lib/cn';

/**
 * Heatmap (UX-09b) — a day×hour grid of call volume (or any 7×24-ish matrix). Cell opacity encodes the
 * value against the matrix max, tinted with the primary token. Native `<title>` tooltips per cell keep
 * it accessible + zero-JS. `rows`/`cols` label the axes.
 */
export function Heatmap({
  matrix,
  rows,
  cols,
  color = 'var(--primary-500)',
  format = (v: number) => `${v}`,
  className,
  label,
}: {
  /** matrix[row][col] value. */
  matrix: number[][];
  rows: string[];
  cols: string[];
  color?: string;
  format?: (v: number) => string;
  className?: string;
  label?: string;
}) {
  const max = Math.max(1, ...matrix.flat());

  return (
    <div
      className={cn('flex flex-col gap-1', className)}
      role="img"
      aria-label={label ?? 'Heatmap'}
    >
      <div className="flex gap-1">
        <div className="w-10 shrink-0" />
        <div
          className="grid flex-1 gap-0.5"
          style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}
        >
          {cols.map((c, i) => (
            <span
              key={c}
              className={cn('text-center text-[9px] text-vq-text-lo', i % 3 !== 0 && 'opacity-0')}
            >
              {c}
            </span>
          ))}
        </div>
      </div>
      {matrix.map((row, ri) => (
        <div key={rows[ri] ?? ri} className="flex items-center gap-1">
          <span className="w-10 shrink-0 text-right text-[10px] text-vq-text-lo">{rows[ri]}</span>
          <div
            className="grid flex-1 gap-0.5"
            style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}
          >
            {row.map((v, ci) => (
              <div
                key={`${rows[ri]}-${cols[ci]}`}
                className="aspect-square rounded-[3px]"
                style={{
                  background: color,
                  opacity: v === 0 ? 0.06 : 0.12 + (v / max) * 0.88,
                }}
                title={`${rows[ri]} ${cols[ci]}: ${format(v)}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

import type { Range } from '../store'

interface Props {
  label: string
  min: number
  max: number
  step: number
  value: Range
  format: (v: number) => string
  onChange: (value: Range) => void
  endLabels?: [string, string]
}

export function RangeSlider({ label, min, max, step, value, format, onChange, endLabels }: Props) {
  const [lo, hi] = value
  const left = ((lo - min) / (max - min)) * 100
  const right = ((hi - min) / (max - min)) * 100
  const full = lo === min && hi === max

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-[13px] tabular-nums text-fg-2">{full ? 'Any' : `${format(lo)} – ${format(hi)}`}</span>
      </div>
      <div className="dual-range">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-fill-2" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${left}%`, right: `${100 - right}%` }}
        />
        <input
          type="range"
          aria-label={`${label} minimum`}
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
        />
        <input
          type="range"
          aria-label={`${label} maximum`}
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
        />
      </div>
      {endLabels && (
        <div className="mt-1 flex justify-between text-[11px] text-fg-3">
          <span>{endLabels[0]}</span>
          <span>{endLabels[1]}</span>
        </div>
      )}
    </div>
  )
}

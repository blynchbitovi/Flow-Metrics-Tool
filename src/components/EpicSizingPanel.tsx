import type { EpicEstimate, EpicSize } from '../metrics'
import { InfoTooltip } from './Tooltip'

interface EpicSizingPanelProps {
  epicEstimates: EpicEstimate[]
  selectedSize: EpicSize
  onSelectSize: (size: EpicSize) => void
  hasCycleTimeData: boolean
  epicCount?: number
}

const SIZE_ORDER: EpicSize[] = ['small', 'medium', 'big']

const SIZE_THEME: Record<EpicSize, {
  border: string
  borderSelected: string
  bg: string
  bgSelected: string
  label: string
  labelSelected: string
  badge: string
  stat: string
}> = {
  small: {
    border: 'border-green-200',
    borderSelected: 'border-green-500',
    bg: 'bg-white',
    bgSelected: 'bg-green-50',
    label: 'text-green-800',
    labelSelected: 'text-green-700',
    badge: 'bg-green-100 text-green-700',
    stat: 'text-green-900',
  },
  medium: {
    border: 'border-blue-200',
    borderSelected: 'border-blue-500',
    bg: 'bg-white',
    bgSelected: 'bg-blue-50',
    label: 'text-blue-800',
    labelSelected: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-700',
    stat: 'text-blue-900',
  },
  big: {
    border: 'border-orange-200',
    borderSelected: 'border-orange-500',
    bg: 'bg-white',
    bgSelected: 'bg-orange-50',
    label: 'text-orange-800',
    labelSelected: 'text-orange-700',
    badge: 'bg-orange-100 text-orange-700',
    stat: 'text-orange-900',
  },
}

function formatDuration(calendarDays: number): string {
  const weeks = Math.floor(calendarDays / 7)
  const days = calendarDays % 7
  if (weeks === 0) return `${days}d`
  if (days === 0) return `${weeks}w`
  return `${weeks}w ${days}d`
}

const STAT_TOOLTIPS: Record<string, string> = {
  'Dev Days': 'Total developer-days estimated for this epic size. Calculated as: median cycle time × expected issue count. Represents the raw effort before accounting for team size.',
  'Calendar Days': 'Wall-clock days to complete the epic. Calculated as: dev days ÷ number of developers/tracks. Assumes parallel work across all tracks.',
  'Duration': 'Calendar days expressed as weeks and days for easier sprint and roadmap planning.',
}

const SIZE_TOOLTIPS: Record<EpicSize, string> = {
  small: 'A small epic — issue count based on the 25th percentile of historical epics in this project. Smaller than 75% of your past epics.',
  medium: 'A medium epic — issue count based on the median (50th percentile) of historical epics. Represents a typical epic in your project.',
  big: 'A large epic — issue count based on the 75th percentile of historical epics. Larger than 75% of your past epics.',
}

function StatRow({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-t border-gray-100">
      <span className="text-xs text-gray-500 flex items-center">
        {label}
        {STAT_TOOLTIPS[label] && <InfoTooltip text={STAT_TOOLTIPS[label]} />}
      </span>
      <span className={`text-sm font-medium ${valueClass}`}>{value}</span>
    </div>
  )
}

export default function EpicSizingPanel({ epicEstimates, selectedSize, onSelectSize, hasCycleTimeData, epicCount }: EpicSizingPanelProps) {
  const estimateMap = new Map(epicEstimates.map(e => [e.size, e]))

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-800">Epic Size Estimation</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {epicCount != null
            ? `Issue counts derived from ${epicCount} epics · based on median cycle time`
            : 'Estimated delivery time based on median cycle time and developer count'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {SIZE_ORDER.map(size => {
          const estimate = estimateMap.get(size)
          const isSelected = size === selectedSize
          const theme = SIZE_THEME[size]

          return (
            <button
              key={size}
              onClick={() => onSelectSize(size)}
              className={`text-left rounded-lg border-2 p-4 transition-colors ${
                isSelected
                  ? `${theme.borderSelected} ${theme.bgSelected}`
                  : `${theme.border} hover:border-opacity-70 ${theme.bg}`
              }`}
            >
              <div className="mb-3">
                <span className={`text-lg font-bold ${isSelected ? theme.labelSelected : theme.label}`}>
                  {estimate?.label ?? size.charAt(0).toUpperCase() + size.slice(1)}
                </span>
                <InfoTooltip text={SIZE_TOOLTIPS[size]} />
                <div className="flex items-center gap-1.5 mt-0.5">
                  {estimate && (
                    <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${theme.badge}`}>
                      {estimate.percentileLabel}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    ~{estimate?.issueCount ?? '—'} issues
                  </span>
                </div>
              </div>

              {estimate ? (
                <>
                  <StatRow label="Dev Days" value={`${estimate.expectedDevDays}d`} valueClass={theme.stat} />
                  <StatRow label="Calendar Days" value={`${estimate.expectedCalendarDays}d`} valueClass={theme.stat} />
                  <StatRow label="Duration" value={formatDuration(estimate.expectedCalendarDays)} valueClass={theme.stat} />
                </>
              ) : (
                <>
                  <StatRow label="Dev Days" value="—" valueClass="text-gray-400" />
                  <StatRow label="Calendar Days" value="—" valueClass="text-gray-400" />
                  <StatRow label="Duration" value="—" valueClass="text-gray-400" />
                  {!hasCycleTimeData && (
                    <p className="text-xs text-gray-400 mt-2">Fetch data first</p>
                  )}
                  {hasCycleTimeData && (
                    <p className="text-xs text-gray-400 mt-2">Click Calculate Forecast</p>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

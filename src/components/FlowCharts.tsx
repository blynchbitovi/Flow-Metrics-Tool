import { useMemo } from 'react'
import type { JiraIssue } from '../jira/types'
import { getInProgressDate } from '../metrics'
import { InfoTooltip } from './Tooltip'

interface FlowChartsProps {
  doneIssues: JiraIssue[]
  wipIssues: JiraIssue[]
  medianCycleTime: number | null
  cycleTimeRangeDays: number
  statusCategoryMap: Map<string, string>
}

const W = 500
const H = 180
const PAD_L = 40
const PAD_R = 14
const PAD_T = 14
const PAD_B = 30
const PW = W - PAD_L - PAD_R
const PH = H - PAD_T - PAD_B

const ISSUE_TYPE_COLORS: Record<string, string> = {
  'Epic':     '#ec4899', // pink
  'Bug':      '#ef4444', // red
  'Task':     '#3b82f6', // blue
  'Story':    '#22c55e', // green
  'Subtask':  '#7dd3fc', // light blue
  'Sub-task': '#7dd3fc', // light blue (alternate spelling)
}
const PIE_FALLBACK_COLORS = ['#f59e0b', '#8b5cf6', '#f97316', '#14b8a6', '#a855f7', '#06b6d4', '#84cc16', '#d97706']

function issueTypeColor(type: string, fallbackIndex: number): string {
  return ISSUE_TYPE_COLORS[type] ?? PIE_FALLBACK_COLORS[fallbackIndex % PIE_FALLBACK_COLORS.length]
}
const PIE_CX = 82
const PIE_CY = 88
const PIE_R = 68

function niceMax(val: number): number {
  if (val <= 0) return 10
  const mag = Math.pow(10, Math.floor(Math.log10(val)))
  return Math.ceil(val / mag) * mag
}

function yTicks(max: number): number[] {
  const step = max / 4
  return [0, step, step * 2, step * 3, max]
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function slicePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const s = polarToCartesian(cx, cy, r, startAngle)
  const e = polarToCartesian(cx, cy, r, endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z`
}

const DAY_MS = 86400000

export default function FlowCharts({ doneIssues, wipIssues, medianCycleTime, cycleTimeRangeDays, statusCategoryMap }: FlowChartsProps) {
  // --- Scatter: compute raw points then derive dynamic display range ---
  const scatterData = useMemo(() => {
    const now = Date.now()
    const queryStart = now - cycleTimeRangeDays * DAY_MS

    const raw: { dateMs: number; days: number }[] = []
    for (const issue of doneIssues) {
      const inProgressDate = getInProgressDate(issue, statusCategoryMap)
      const resolutionDate = issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate) : null
      if (!inProgressDate || !resolutionDate) continue
      const ct = Math.floor((resolutionDate.getTime() - inProgressDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const dateMs = resolutionDate.getTime()
      if (dateMs < queryStart || dateMs > now) continue
      raw.push({ dateMs, days: ct })
    }

    if (raw.length === 0) return null

    const minDate = Math.min(...raw.map(p => p.dateMs))
    const maxDate = Math.max(...raw.map(p => p.dateMs))
    const displayStart = Math.max(queryStart, minDate - 5 * DAY_MS)
    const displayEnd = Math.min(now, maxDate + 5 * DAY_MS)
    const displayRange = displayEnd - displayStart

    return {
      points: raw.map(p => ({
        xFrac: displayRange > 0 ? (p.dateMs - displayStart) / displayRange : 0.5,
        days: p.days,
      })),
      displayStart,
      displayEnd,
    }
  }, [doneIssues, cycleTimeRangeDays, statusCategoryMap])

  const scatterMax = useMemo(() => {
    const maxCt = scatterData ? Math.max(...scatterData.points.map(p => p.days)) : 0
    return Math.ceil(Math.max(maxCt, medianCycleTime ?? 0) * 1.15)
  }, [scatterData, medianCycleTime])

  // --- Pie: group WIP issues by type ---
  const pieData = useMemo(() => {
    const counts = new Map<string, number>()
    for (const issue of wipIssues) {
      const type = issue.fields.issuetype.name
      counts.set(type, (counts.get(type) ?? 0) + 1)
    }
    const entries = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
    let fallbackIndex = 0
    const colored = entries.map(([type, count]) => {
      const color = issueTypeColor(type, fallbackIndex)
      if (!(type in ISSUE_TYPE_COLORS)) fallbackIndex++
      return { type, count, color }
    })
    const total = colored.reduce((s, d) => s + d.count, 0)
    return { entries: colored, total }
  }, [wipIssues])

  const hasScatterData = scatterData !== null
  const hasPieData = pieData.entries.length > 0

  if (!hasScatterData && !hasPieData) return null

  const medianY = medianCycleTime !== null && scatterData !== null
    ? PAD_T + PH - (medianCycleTime / scatterMax) * PH
    : null

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Scatter plot */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-0.5">
          Cycle Time Scatter
          <InfoTooltip text="Each dot represents a completed item. The x-axis is the date it was completed; the y-axis is how many days it took (from last To Do → In Progress transition to done). The dashed amber line shows the median cycle time. Clusters high on the chart indicate slower items." />
        </h3>
        <p className="text-xs text-gray-400 mb-3">Completed items over last {cycleTimeRangeDays} days</p>
        {hasScatterData && scatterData ? (
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
            {/* Gridlines + Y axis labels */}
            {yTicks(scatterMax).map(tick => {
              const y = PAD_T + PH - (tick / scatterMax) * PH
              return (
                <g key={tick}>
                  <line x1={PAD_L} y1={y} x2={PAD_L + PW} y2={y} stroke="#f3f4f6" strokeWidth="1" />
                  <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
                    {Math.round(tick)}
                  </text>
                </g>
              )
            })}

            {/* X axis date labels */}
            {([0, 0.5, 1] as const).map(frac => {
              const dateMs = scatterData.displayStart + frac * (scatterData.displayEnd - scatterData.displayStart)
              const label = new Date(dateMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              return (
                <text key={frac} x={PAD_L + frac * PW} y={H - 4} textAnchor="middle" fontSize="10" fill="#9ca3af">
                  {label}
                </text>
              )
            })}

            {/* Axes */}
            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + PH} stroke="#e5e7eb" strokeWidth="1" />
            <line x1={PAD_L} y1={PAD_T + PH} x2={PAD_L + PW} y2={PAD_T + PH} stroke="#e5e7eb" strokeWidth="1" />

            {/* Median line */}
            {medianY !== null && (
              <>
                <line
                  x1={PAD_L} y1={medianY} x2={PAD_L + PW} y2={medianY}
                  stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 3"
                />
                <text x={PAD_L + PW - 3} y={medianY - 4} textAnchor="end" fontSize="9" fill="#f59e0b">
                  Median
                </text>
              </>
            )}

            {/* Data points */}
            {scatterData.points.map((pt, i) => (
              <circle
                key={i}
                cx={PAD_L + pt.xFrac * PW}
                cy={PAD_T + PH - (pt.days / scatterMax) * PH}
                r="3.5"
                fill="#3b82f6"
                fillOpacity="0.5"
                stroke="#2563eb"
                strokeWidth="0.5"
                strokeOpacity="0.5"
              />
            ))}
          </svg>
        ) : (
          <p className="text-sm text-gray-400">No completed items in range.</p>
        )}
      </div>

      {/* Pie chart — WIP by type */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-0.5">
          WIP by Issue Type
          <InfoTooltip text="Breakdown of all currently in-progress items by issue type. Reflects the active filter — unchecking an issue type in Filter Results removes it from this chart. A large proportion of one type may indicate an imbalanced queue." />
        </h3>
        <p className="text-xs text-gray-400 mb-3">Current items in progress</p>
        {hasPieData ? (
          <div className="flex items-center gap-6">
            <svg width={PIE_R * 2 + 4} height={PIE_R * 2 + 4} style={{ flexShrink: 0 }}>
              {pieData.entries.length === 1 ? (
                <circle cx={PIE_R + 2} cy={PIE_R + 2} r={PIE_R} fill={pieData.entries[0].color} fillOpacity="0.85" />
              ) : (
                (() => {
                  const slices: React.ReactNode[] = []
                  let angle = 0
                  for (const entry of pieData.entries) {
                    const sweep = (entry.count / pieData.total) * 360
                    slices.push(
                      <path
                        key={entry.type}
                        d={slicePath(PIE_R + 2, PIE_R + 2, PIE_R, angle, angle + sweep)}
                        fill={entry.color}
                        fillOpacity="0.85"
                        stroke="white"
                        strokeWidth="1.5"
                      />
                    )
                    angle += sweep
                  }
                  return slices
                })()
              )}
            </svg>
            <div className="flex flex-col gap-1.5 min-w-0">
              {pieData.entries.map((d) => {
                const pct = Math.round((d.count / pieData.total) * 100)
                return (
                  <div key={d.type} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: d.color, opacity: 0.85 }}
                    />
                    <span className="text-gray-700 truncate">{d.type}</span>
                    <span className="text-gray-400 shrink-0 ml-auto pl-2">{d.count} ({pct}%)</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No items currently in progress.</p>
        )}
      </div>
    </div>
  )
}

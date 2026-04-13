import { useState, useMemo } from 'react'
import { runMonteCarloSimulation, getSimulationPercentile } from '../metrics'
import type { EpicEstimate, EpicSize } from '../metrics'
import { InfoTooltip } from './Tooltip'

interface ConfidenceForecastProps {
  samples: number[]
  developerCount: number
  epicEstimates: EpicEstimate[]
}

type InputMode = 'epic-size' | 'issue-count'

const SIZE_ORDER: EpicSize[] = ['small', 'medium', 'big']
// Fixed output percentiles — confidence changes the spread, not which bands are shown.
const BEST_CASE_PERCENTILE = 10
const LIKELY_PERCENTILE = 80
const WORST_CASE_PERCENTILE = 95
const BINS = 50
const SVG_W = 400
const SVG_H = 56

function todayString() {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + Math.round(days))
  return d
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function buildCurvePath(pts: [number, number][], close: boolean): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const cpX = (x0 + x1) / 2
    d += ` C ${cpX} ${y0} ${cpX} ${y1} ${x1} ${y1}`
  }
  if (close) d += ' Z'
  return d
}

export default function ConfidenceForecast({ samples, developerCount, epicEstimates }: ConfidenceForecastProps) {
  const [inputMode, setInputMode] = useState<InputMode>('epic-size')
  const [selectedSize, setSelectedSize] = useState<EpicSize>('medium')
  const [customIssueCount, setCustomIssueCount] = useState(10)
  const [confidenceInput, setConfidenceInput] = useState('80')
  const confidenceValue = Number(confidenceInput)
  const confidenceValid = confidenceInput !== '' && confidenceValue >= 1 && confidenceValue <= 99
  const [startDate, setStartDate] = useState(todayString)

  const estimateMap = new Map(epicEstimates.map(e => [e.size, e]))
  const issueCount = inputMode === 'epic-size'
    ? (estimateMap.get(selectedSize)?.issueCount ?? null)
    : customIssueCount

  const simulationResults = useMemo(() => {
    if (!samples.length || !issueCount || issueCount < 1 || !confidenceValid) return null
    return runMonteCarloSimulation(samples, issueCount, developerCount, confidenceValue)
  }, [samples, issueCount, developerCount, confidenceValid, confidenceValue])

  const forecast = useMemo(() => {
    if (!simulationResults || !startDate) return null
    const bestDays = getSimulationPercentile(simulationResults, BEST_CASE_PERCENTILE)
    const likelyDays = getSimulationPercentile(simulationResults, LIKELY_PERCENTILE)
    const worstDays = getSimulationPercentile(simulationResults, WORST_CASE_PERCENTILE)
    return {
      best: { days: Math.round(bestDays), date: addDays(startDate, bestDays) },
      likely: { days: Math.round(likelyDays), date: addDays(startDate, likelyDays) },
      worst: { days: Math.round(worstDays), date: addDays(startDate, worstDays) },
    }
  }, [simulationResults, startDate])

  const chartData = useMemo(() => {
    if (!simulationResults || !forecast) return null

    const displayMin = getSimulationPercentile(simulationResults, 1)
    const displayMax = getSimulationPercentile(simulationResults, 99)
    const displayRange = displayMax - displayMin
    if (displayRange <= 0) return null

    const counts = new Array(BINS).fill(0)
    for (const val of simulationResults) {
      const bin = Math.min(Math.floor(((val - displayMin) / displayRange) * BINS), BINS - 1)
      if (bin >= 0) counts[bin]++
    }
    const maxCount = Math.max(...counts)

    const toX = (days: number) =>
      Math.max(0, Math.min(SVG_W, ((days - displayMin) / displayRange) * SVG_W))

    const curvePts: [number, number][] = counts.map((count, i) => [
      ((i + 0.5) / BINS) * SVG_W,
      SVG_H - (count / maxCount) * SVG_H * 0.92,
    ])

    const fillPts: [number, number][] = [
      [0, SVG_H],
      ...curvePts,
      [SVG_W, SVG_H],
    ]

    const likelyX = toX(forecast.likely.days)
    const likelyPct = (likelyX / SVG_W) * 100

    return {
      fillPath: buildCurvePath(fillPts, true),
      strokePath: buildCurvePath(curvePts, false),
      bestX: toX(forecast.best.days),
      likelyX,
      worstX: toX(forecast.worst.days),
      likelyPct,
    }
  }, [simulationResults, forecast])

  const hasData = samples.length > 0
  const hasEstimates = epicEstimates.length > 0

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-800">
          Confidence-Based Forecast
          <InfoTooltip text="Uses Monte Carlo simulation: 5,000 iterations randomly sampling from historical cycle times to produce a probability distribution of completion dates. The spread of results reflects real variability in your team's delivery history." />
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Monte Carlo simulation · median cycle time · {samples.length} historical samples · 5,000 iterations
        </p>
      </div>

      {!hasData ? (
        <p className="text-sm text-gray-400">Click Calculate to load cycle time data.</p>
      ) : (
        <div className="flex gap-8 min-w-0">
          {/* Inputs */}
          <div className="flex flex-col gap-4 w-60 shrink-0">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">
                Start Date
                <InfoTooltip text="The date work begins. Forecast dates are calculated by adding simulated calendar days to this date." />
              </p>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">
                Input Type
                <InfoTooltip text="Epic Size uses issue counts derived from your historical epics (25th/50th/75th percentile). Issue Count lets you enter an exact number of issues to forecast." />
              </p>
              <div className="flex rounded border border-gray-300 overflow-hidden text-sm">
                <button
                  onClick={() => setInputMode('epic-size')}
                  className={`flex-1 py-1.5 font-medium ${inputMode === 'epic-size' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  Epic Size
                </button>
                <button
                  onClick={() => setInputMode('issue-count')}
                  className={`flex-1 py-1.5 font-medium border-l border-gray-300 ${inputMode === 'issue-count' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  Issue Count
                </button>
              </div>
            </div>

            {inputMode === 'epic-size' && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">
                  Epic Size
                  <InfoTooltip text="Selects the issue count for the simulation based on your project's historical epic sizes. Small = 25th %ile, Medium = 50th %ile, Large = 75th %ile of child issue counts." />
                </p>
                {!hasEstimates ? (
                  <p className="text-xs text-gray-400">Run Calculate to derive sizes.</p>
                ) : (
                  <div className="flex gap-2">
                    {SIZE_ORDER.map(size => {
                      const est = estimateMap.get(size)
                      return (
                        <button
                          key={size}
                          onClick={() => setSelectedSize(size)}
                          className={`flex-1 rounded border-2 py-2 text-xs font-medium transition-colors ${
                            selectedSize === size
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <div>{est?.label ?? size}</div>
                          <div className="text-gray-400 font-normal mt-0.5">~{est?.issueCount ?? '—'}</div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {inputMode === 'issue-count' && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">
                  Issue Count
                  <InfoTooltip text="The number of issues in the work you're forecasting. The simulation samples a cycle time for each issue and sums them to produce a total duration." />
                </p>
                <input
                  type="number"
                  value={customIssueCount}
                  min={1}
                  onChange={(e) => setCustomIssueCount(Math.max(1, Number(e.target.value)))}
                  className="w-24 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">
                Confidence in Estimates (%)
                <InfoTooltip text="How stable you expect your cycle time and issue count to be. High confidence (e.g. 90%) tightens the simulation spread — outcomes cluster near the historical median. Low confidence (e.g. 20%) widens the spread, reflecting more uncertainty. Does not affect which percentile bands are shown." />
              </p>
              <input
                type="number"
                value={confidenceInput}
                onChange={(e) => setConfidenceInput(e.target.value)}
                className={`w-24 border rounded px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                  confidenceValid
                    ? 'border-gray-300 focus:ring-blue-500'
                    : 'border-red-400 focus:ring-red-400 text-red-600'
                }`}
              />
              <p className="text-xs text-gray-400 mt-1">How stable you expect cycle time and issue count to be</p>
            </div>
          </div>

          {/* Result */}
          <div className="flex-1 flex flex-col justify-center min-w-0 overflow-hidden">
            {forecast && chartData ? (
              <div className="space-y-4">
                {/* Primary result — always the 80th percentile "likely" date */}
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
                    Likely ({LIKELY_PERCENTILE}th %ile) · {issueCount} issues · {confidenceValue}% confidence in estimates
                    <InfoTooltip text={`The recommended planning date. ${LIKELY_PERCENTILE}% of the 5,000 simulated outcomes complete by this date. A reliable target that balances optimism and risk.`} />
                  </p>
                  <p className="text-3xl font-bold text-gray-900">
                    {formatDate(forecast.likely.date)}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {forecast.likely.days} calendar days · {Math.round((forecast.likely.days / 7) * 10) / 10} weeks
                  </p>
                </div>

                {/* Distribution chart */}
                <div className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                  <svg
                    width="100%"
                    height="64"
                    viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                    preserveAspectRatio="none"
                    style={{ display: 'block', overflow: 'hidden' }}
                  >
                    <defs>
                      <linearGradient id="distFill" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.75" />
                        <stop offset={`${chartData.likelyPct}%`} stopColor="#22c55e" stopOpacity="0.75" />
                        <stop offset={`${Math.min(chartData.likelyPct + 0.5, 100)}%`} stopColor="#d1d5db" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#d1d5db" stopOpacity="0.2" />
                      </linearGradient>
                      <linearGradient id="distStroke" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset={`${chartData.likelyPct}%`} stopColor="#22c55e" />
                        <stop offset={`${Math.min(chartData.likelyPct + 0.5, 100)}%`} stopColor="#9ca3af" />
                        <stop offset="100%" stopColor="#9ca3af" />
                      </linearGradient>
                    </defs>

                    <path d={chartData.fillPath} fill="url(#distFill)" />
                    <path d={chartData.strokePath} fill="none" stroke="url(#distStroke)" strokeWidth="1.2" />

                    {/* Best case marker (10th %ile) */}
                    <line x1={chartData.bestX} y1="0" x2={chartData.bestX} y2={SVG_H}
                      stroke="#93c5fd" strokeWidth="1" strokeDasharray="3 2" />

                    {/* Likely marker (80th %ile) */}
                    <line x1={chartData.likelyX} y1="0" x2={chartData.likelyX} y2={SVG_H}
                      stroke="#16a34a" strokeWidth="1.5" />

                    {/* Worst case marker (95th %ile) */}
                    <line x1={chartData.worstX} y1="0" x2={chartData.worstX} y2={SVG_H}
                      stroke="#9ca3af" strokeWidth="1" strokeDasharray="3 2" />
                  </svg>

                  {/* Labels — flex row, contained within parent */}
                  <div className="flex justify-between px-2 pb-2 pt-1 text-xs">
                    <div>
                      <div className="text-blue-400 font-medium">
                        Best Case
                        <InfoTooltip text={`${BEST_CASE_PERCENTILE}th percentile — only ${BEST_CASE_PERCENTILE}% of simulations finish this quickly. An optimistic scenario; do not commit to this date.`} />
                      </div>
                      <div className="text-gray-700 font-semibold">{formatDate(forecast.best.date)}</div>
                      <div className="text-gray-400">{forecast.best.days}d</div>
                    </div>
                    <div className="text-center">
                      <div className="text-green-600 font-medium">
                        Likely ({LIKELY_PERCENTILE}th %ile)
                        <InfoTooltip text={`${LIKELY_PERCENTILE}th percentile — ${LIKELY_PERCENTILE}% of simulations finish by this date. The recommended target for planning and stakeholder commitments.`} />
                      </div>
                      <div className="text-gray-700 font-semibold">{formatDate(forecast.likely.date)}</div>
                      <div className="text-gray-400">{forecast.likely.days}d</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-400 font-medium">
                        Worst Case
                        <InfoTooltip text={`${WORST_CASE_PERCENTILE}th percentile — ${WORST_CASE_PERCENTILE}% of simulations finish by this date. A conservative buffer for high-stakes commitments where overrun risk must be minimized.`} />
                      </div>
                      <div className="text-gray-700 font-semibold">{formatDate(forecast.worst.date)}</div>
                      <div className="text-gray-400">{forecast.worst.days}d</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-gray-100 bg-gray-50 rounded-lg p-6">
                <p className="text-sm text-gray-400">
                  {inputMode === 'epic-size' && !hasEstimates
                    ? 'Run Calculate to derive epic sizes, then a forecast will appear here.'
                    : 'Configure inputs to see a forecast.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import type { JiraIssue, ChangelogHistory } from './jira/types'

// --- In-Progress Date ---

// Core logic: last transition from "new" (To Do) → "indeterminate" (In Progress).
// Using the *last* such transition means accidental starts sent back to To Do don't count.
// Done → In Progress transitions are ignored — resolution date covers re-opened work.
export function getInProgressDateFromHistories(
  histories: ChangelogHistory[],
  statusCategoryMap: Map<string, string>
): Date | null {
  const sorted = [...histories].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
  )
  let result: Date | null = null
  for (const history of sorted) {
    for (const item of history.items) {
      if (item.field !== 'status' || !item.from || !item.to) continue
      const fromCategory = statusCategoryMap.get(item.from)
      const toCategory = statusCategoryMap.get(item.to)
      if (fromCategory === 'new' && toCategory === 'indeterminate') {
        result = new Date(history.created)
      }
    }
  }
  return result
}

export function getInProgressDate(
  issue: JiraIssue,
  statusCategoryMap: Map<string, string>
): Date | null {
  return getInProgressDateFromHistories(issue.changelog.histories, statusCategoryMap)
}

// --- Cycle Time ---

export interface CycleTimeStats {
  avg: number
  median: number
  p85: number // 85th percentile — used as SLE
  count: number // issues with calculable cycle time
  throughput: number // all done issues in the period
  samples: number[] // sorted raw cycle times for Monte Carlo bootstrap sampling
}

// Parses a "YYYY-MM-DD" date string as local midnight.
// new Date("YYYY-MM-DD") parses as UTC midnight, which shifts the date in non-UTC timezones.
export function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

export function calculateCycleTimeStats(issues: JiraIssue[], statusCategoryMap: Map<string, string>): CycleTimeStats | null {
  const cycleTimes: number[] = []

  for (const issue of issues) {
    const inProgressDate = getInProgressDate(issue, statusCategoryMap)
    const resolutionDate = issue.fields.resolutiondate
      ? new Date(issue.fields.resolutiondate)
      : null
    if (inProgressDate && resolutionDate) {
      const ct = Math.floor((resolutionDate.getTime() - inProgressDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      cycleTimes.push(ct)
    }
  }

  if (cycleTimes.length === 0) return null

  cycleTimes.sort((a, b) => a - b)

  return {
    avg: Math.round((cycleTimes.reduce((s, ct) => s + ct, 0) / cycleTimes.length) * 10) / 10,
    median: Math.round(percentile(cycleTimes, 50) * 10) / 10,
    p85: Math.round(percentile(cycleTimes, 85) * 10) / 10,
    count: cycleTimes.length,
    throughput: issues.length,
    samples: cycleTimes,
  }
}

// --- WIP Age ---

export interface WipItem {
  key: string
  age: number // in days
}

export interface WipAgeResult {
  items: WipItem[]
  avgAge: number
  medianAge: number
  maxAge: number
  maxAgeKey: string
}

export function calculateWipAge(issues: JiraIssue[], statusCategoryMap: Map<string, string>): WipAgeResult | null {
  const items: WipItem[] = []

  for (const issue of issues) {
    const inProgressDate = getInProgressDate(issue, statusCategoryMap)
    if (inProgressDate) {
      const age = Math.floor((Date.now() - inProgressDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      items.push({ key: issue.key, age })
    }
  }

  if (items.length === 0) return null

  const sortedAges = [...items].map(i => i.age).sort((a, b) => a - b)
  const avgAge = Math.round((sortedAges.reduce((s, a) => s + a, 0) / sortedAges.length) * 10) / 10
  const medianAge = Math.round(percentile(sortedAges, 50) * 10) / 10
  const maxItem = items.reduce((max, item) => (item.age > max.age ? item : max))
  return { items, avgAge, medianAge, maxAge: maxItem.age, maxAgeKey: maxItem.key }
}

// --- Monte Carlo Simulation ---

// Maps confidence % to a log-normal σ (standard deviation).
// Mirrors the auto-scheduler approach: 100% confidence → no spread, 10% → max spread.
// Linear: σ = (100 - confidence) × (1.3 / 90)
// Maps the user's confidence in their estimates (0–100%) to a log-normal σ.
// High confidence → small σ → simulation outcomes cluster tightly around historical median.
// Low confidence  → large σ → simulation outcomes spread widely, reflecting more uncertainty.
// Scale matches the auto-scheduler: 100% → σ=0 (deterministic), 10% → σ=1.3 (maximum spread).
function confidenceToStd(confidence: number): number {
  const slope = 1.3 / 90
  return Math.max(0, (100 - confidence) * slope)
}

// Box-Muller transform → log-normal(μ=0, σ=std) sample.
// Always positive, so multiplied cycle times stay valid.
function sampleLogNormal(std: number): number {
  if (std === 0) return 1
  const u1 = Math.max(Math.random(), 1e-10)
  const u2 = Math.random()
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return Math.exp(std * normal)
}

// Monte Carlo simulation using bootstrap sampling from historical cycle times.
// Each sampled cycle time is scaled by a log-normal multiplier whose spread is
// controlled by the user's confidence in their estimates:
//   90% confidence → tight spread (user trusts cycle time and issue count are stable)
//   50% confidence → moderate spread
//   20% confidence → wide spread (high uncertainty in inputs)
// Output percentiles (best/likely/worst) are fixed; confidence changes the distribution width.
export function runMonteCarloSimulation(
  samples: number[],
  issueCount: number,
  developerCount: number,
  confidence: number,
  iterations = 5000
): number[] {
  const std = confidenceToStd(confidence)
  const n = samples.length
  const results: number[] = []
  for (let i = 0; i < iterations; i++) {
    let totalDevDays = 0
    for (let j = 0; j < issueCount; j++) {
      totalDevDays += samples[Math.floor(Math.random() * n)] * sampleLogNormal(std)
    }
    results.push(totalDevDays / developerCount)
  }
  return results.sort((a, b) => a - b)
}

export function getSimulationPercentile(sortedResults: number[], confidence: number): number {
  return percentile(sortedResults, confidence)
}

// --- Epic Estimation ---

export type EpicSize = 'big' | 'medium' | 'small'

export const EPIC_SIZES: Record<EpicSize, { label: string; issueCount: number; percentileLabel: string }> = {
  small: { label: 'Small', issueCount: 6, percentileLabel: '25th %ile' },
  medium: { label: 'Medium', issueCount: 15, percentileLabel: '50th %ile' },
  big: { label: 'Large', issueCount: 28, percentileLabel: '75th %ile' },
}

export interface EpicEstimate {
  size: EpicSize
  label: string
  issueCount: number
  expectedDevDays: number
  expectedCalendarDays: number
  formula: string
  weeks: number
  percentileLabel: string
}

export interface DerivedEpicIssueCounts {
  small: number
  medium: number
  big: number
  epicCount: number
}

export function deriveEpicSizeIssueCounts(childCounts: number[]): DerivedEpicIssueCounts {
  const sorted = [...childCounts].sort((a, b) => a - b)
  return {
    small: Math.round(percentile(sorted, 25)),
    medium: Math.round(percentile(sorted, 50)),
    big: Math.round(percentile(sorted, 75)),
    epicCount: childCounts.length,
  }
}

export function calculateEpicEstimates(
  medianCycleTime: number,
  developerCount: number,
  issueCounts?: DerivedEpicIssueCounts
): EpicEstimate[] {
  const SIZE_ORDER: EpicSize[] = ['small', 'medium', 'big']
  return SIZE_ORDER.map(size => {
    const config = EPIC_SIZES[size]
    const count = issueCounts ? issueCounts[size] : config.issueCount
    const expectedDevDays = medianCycleTime * count
    const expectedCalendarDays = expectedDevDays / developerCount
    return {
      size,
      label: config.label,
      issueCount: count,
      expectedDevDays: Math.ceil(expectedDevDays),
      expectedCalendarDays: Math.ceil(expectedCalendarDays),
      formula: `${medianCycleTime} × ${count} ÷ ${developerCount}`,
      weeks: Math.round((expectedCalendarDays / 7) * 10) / 10,
      percentileLabel: config.percentileLabel,
    }
  })
}

// testConnection() was used in Phase 2 to verify proxy routing + credentials.
// import { useEffect } from 'react'
// import { testConnection } from './jira/testConnection'
// useEffect(() => { testConnection().catch(console.error) }, [])

// public/icons.svg — Vite starter icon sprite (Bluesky, Discord, GitHub, X, docs icons).
// Was referenced by the original App.tsx scaffold. No longer used.

import { useState, useMemo } from 'react'
import { searchIssues } from './jira/search'
import { getStatusCategoryMap } from './jira/statusMap'
import { calculateCycleTimeStats, calculateWipAge, calculateEpicEstimates, deriveEpicSizeIssueCounts } from './metrics'
import type { EpicSize, DerivedEpicIssueCounts } from './metrics'
import { fetchProjectEpicsWithChildCounts } from './jira/epics'
import type { JiraIssue } from './jira/types'
import ConfigPanel from './components/ConfigPanel'
import MetricsCards from './components/MetricsCards'
import IssueDebugModal from './components/IssueDebugModal'
import EpicSizingPanel from './components/EpicSizingPanel'
import EpicsModal from './components/EpicsModal'
import ConfidenceForecast from './components/ConfidenceForecast'
import FlowCharts from './components/FlowCharts'
import type { EpicWithChildCount } from './jira/epics'

type Tab = 'flow-metrics' | 'forecasting'

export default function App() {
  const [tab, setTab] = useState<Tab>('flow-metrics')

  // Config
  const [queryMode, setQueryMode] = useState<'simple' | 'custom'>('simple')
  const [projectKey, setProjectKey] = useState('')
  const [cycleTimeRangeDays, setCycleTimeRangeDays] = useState(30)
  const [developerCount, setDeveloperCount] = useState(4)
  const [customQuery, setCustomQuery] = useState('')

  const builtQuery = projectKey
    ? `(project = ${projectKey} AND statusCategory = "In Progress") OR ` +
      `(project = ${projectKey} AND statusCategory = Done AND updatedDate >= -${cycleTimeRangeDays}d)`
    : ''

  const activeQuery = queryMode === 'custom' ? customQuery : builtQuery

  // Results
  const [selectedSize, setSelectedSize] = useState<EpicSize>('medium')
  const [queryIssues, setQueryIssues] = useState<JiraIssue[]>([])
  const [statusCategoryMap, setStatusCategoryMap] = useState<Map<string, string>>(new Map())

  // Filters
  const [excludedIssueTypes, setExcludedIssueTypes] = useState<Set<string>>(new Set())
  const [excludedStatuses, setExcludedStatuses] = useState<Set<string>>(new Set())

  const availableIssueTypes = useMemo(
    () => Array.from(new Set(queryIssues.map(i => i.fields.issuetype.name))).sort(),
    [queryIssues]
  )
  const availableStatuses = useMemo(
    () => Array.from(new Set(queryIssues.map(i => i.fields.status.name))).sort(),
    [queryIssues]
  )

  const filteredIssues = useMemo(
    () => queryIssues.filter(
      i => !excludedIssueTypes.has(i.fields.issuetype.name) && !excludedStatuses.has(i.fields.status.name)
    ),
    [queryIssues, excludedIssueTypes, excludedStatuses]
  )

  const cycleTimeStats = useMemo(
    () => calculateCycleTimeStats(filteredIssues.filter(i => i.fields.status.statusCategory.key === 'done'), statusCategoryMap),
    [filteredIssues, statusCategoryMap]
  )
  const wipAgeResult = useMemo(
    () => calculateWipAge(filteredIssues.filter(i => i.fields.status.statusCategory.key === 'indeterminate'), statusCategoryMap),
    [filteredIssues, statusCategoryMap]
  )

  const [derivedIssueCounts, setDerivedIssueCounts] = useState<DerivedEpicIssueCounts | null>(null)
  const [epicData, setEpicData] = useState<EpicWithChildCount[]>([])

  const epicEstimates = useMemo(
    () => cycleTimeStats
      ? calculateEpicEstimates(cycleTimeStats.median, developerCount, derivedIssueCounts ?? undefined)
      : [],
    [cycleTimeStats, developerCount, derivedIssueCounts]
  )

  // UI
  const [isLoading, setIsLoading] = useState(false)
  const [isForecastLoading, setIsForecastLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [modalIssues, setModalIssues] = useState<JiraIssue[]>([])
  const [modalHighlightKeys, setModalHighlightKeys] = useState<Set<string>>(new Set())
  const [showEpicsModal, setShowEpicsModal] = useState(false)

  const handleFetch = async () => {
    setIsLoading(true)
    setError(null)
    setEpicData([])
    setDerivedIssueCounts(null)
    setQueryIssues([])
    setStatusCategoryMap(new Map())
    setExcludedIssueTypes(new Set(['Epic']))
    setExcludedStatuses(new Set())

    const DEFAULT_EXCLUDED_STATUSES = ['blocked', 'on hold', 'canceled', 'cancelled']

    let issues: JiraIssue[] = []
    try {
      const [newScm, fetchedIssues] = await Promise.all([
        getStatusCategoryMap(),
        searchIssues(activeQuery),
      ])
      issues = fetchedIssues
      setQueryIssues(issues)
      setStatusCategoryMap(newScm)
      const statusNames = Array.from(new Set(issues.map(i => i.fields.status.name)))
      const toExclude = statusNames.filter(n => DEFAULT_EXCLUDED_STATUSES.includes(n.toLowerCase()))
      setExcludedStatuses(new Set(toExclude))
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (queryMode === 'custom') {
        setError(msg || 'An unknown error occurred')
      } else {
        setError(msg.includes('400')
          ? 'Project not found. Please double check the spelling of your Project Key'
          : msg || 'An unknown error occurred'
        )
      }
      setIsLoading(false)
      return
    }

    if (issues.length === 0) {
      setError(queryMode === 'custom'
        ? 'No results found. Please check your query'
        : 'Project not found. Please double check the spelling of your Project Key'
      )
      setIsLoading(false)
      return
    }
    setIsLoading(false)

    // Auto-run epic size calculations after fetching issues (requires a project key)
    if (!projectKey) return
    setIsForecastLoading(true)
    try {
      const epics = await fetchProjectEpicsWithChildCounts(projectKey, statusCategoryMap)
      setEpicData(epics)
      const counts = epics.length >= 4
        ? deriveEpicSizeIssueCounts(epics.map(e => e.childCount))
        : null
      setDerivedIssueCounts(counts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch epic data')
    } finally {
      setIsForecastLoading(false)
    }
  }

  const handleToggleIssueType = (type: string) => {
    setExcludedIssueTypes(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  const handleToggleStatus = (status: string) => {
    setExcludedStatuses(prev => {
      const next = new Set(prev)
      next.has(status) ? next.delete(status) : next.add(status)
      return next
    })
  }

  const handleCalculate = async () => {
    if (!projectKey || cycleTimeRangeDays < 1) return

    // If no issues loaded yet, a full fetch covers everything
    if (queryIssues.length === 0) {
      await handleFetch()
      return
    }

    setError(null)
    setIsForecastLoading(true)
    try {
      const epics = await fetchProjectEpicsWithChildCounts(projectKey, statusCategoryMap)
      setEpicData(epics)
      const counts = epics.length >= 4
        ? deriveEpicSizeIssueCounts(epics.map(e => e.childCount))
        : null
      setDerivedIssueCounts(counts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch epic data')
    } finally {
      setIsForecastLoading(false)
    }
  }

  const handleCountClick = () => {
    setModalIssues(filteredIssues.filter(i => i.fields.status.statusCategory.key === 'done'))
    setModalHighlightKeys(new Set())
    setShowIssueModal(true)
  }

  const handleWipCountClick = () => {
    const sle = cycleTimeStats?.p85 ?? null
    const wipIssues = filteredIssues.filter(i => i.fields.status.statusCategory.key === 'indeterminate')
    const exceedingKeys = sle !== null && wipAgeResult
      ? new Set(wipAgeResult.items.filter(i => i.age > sle).map(i => i.key))
      : new Set<string>()
    setModalIssues(wipIssues)
    setModalHighlightKeys(exceedingKeys)
    setShowIssueModal(true)
  }

  const handleSleExceedingClick = () => {
    const sle = cycleTimeStats?.p85 ?? null
    const wipIssues = filteredIssues.filter(i => i.fields.status.statusCategory.key === 'indeterminate')
    const exceedingKeys = sle !== null && wipAgeResult
      ? new Set(wipAgeResult.items.filter(i => i.age > sle).map(i => i.key))
      : new Set<string>()
    setModalIssues(wipIssues)
    setModalHighlightKeys(exceedingKeys)
    setShowIssueModal(true)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-blue-800 text-white px-6 py-3 flex items-center gap-4">
        <span className="font-bold text-lg">Flow Metrics Forecasting Tool</span>
      </header>

      <div className="flex flex-1">
        <aside className="w-80 shrink-0 bg-white border-r border-gray-200 p-5">
          <ConfigPanel
            queryMode={queryMode}
            onQueryModeChange={(mode) => { setQueryMode(mode); setError(null) }}
            projectKey={projectKey}
            onProjectKeyChange={(val) => { setProjectKey(val); setError(null) }}
            cycleTimeRangeDays={cycleTimeRangeDays}
            onCycleTimeRangeDaysChange={setCycleTimeRangeDays}
            customQuery={customQuery}
            onCustomQueryChange={(val) => { setCustomQuery(val); setError(null) }}
            developerCount={developerCount}
            onDeveloperCountChange={setDeveloperCount}
            builtQuery={builtQuery}
            onFetch={handleFetch}
            onCalculate={handleCalculate}
            isLoading={isLoading}
            isForecastLoading={isForecastLoading}
            showForecastingControls={tab === 'forecasting'}
            availableIssueTypes={availableIssueTypes}
            availableStatuses={availableStatuses}
            excludedIssueTypes={excludedIssueTypes}
            excludedStatuses={excludedStatuses}
            onToggleIssueType={handleToggleIssueType}
            onToggleStatus={handleToggleStatus}
            projectKeyError={queryMode === 'simple' && error?.startsWith('Project not found') ? error : null}
            customQueryError={queryMode === 'custom' ? error : null}
          />
        </aside>

        <main className="flex-1 p-6 overflow-auto">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                {tab === 'flow-metrics' ? 'Current Flow Metrics' : 'Epic Delivery Forecasting'}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {tab === 'flow-metrics'
                  ? 'Cycle time, throughput, and work in progress for the selected project'
                  : 'Use cycle time metrics to forecast epic delivery timelines without traditional estimates'}
              </p>
            </div>
            <div className="flex rounded border border-gray-200 overflow-hidden">
              <button
                onClick={() => setTab('flow-metrics')}
                className={`px-4 py-2 text-sm font-medium ${tab === 'flow-metrics' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Flow Metrics
              </button>
              <button
                onClick={() => setTab('forecasting')}
                className={`px-4 py-2 text-sm font-medium border-l border-gray-200 ${tab === 'forecasting' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Forecasting
              </button>
            </div>
          </div>

          {error && queryMode === 'simple' && !error.startsWith('Project not found') && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {tab === 'flow-metrics' && (
            <div className="flex flex-col gap-6">
              <MetricsCards
                cycleTimeStats={cycleTimeStats}
                wipAgeResult={wipAgeResult}
                cycleTimeRangeDays={cycleTimeRangeDays}
                onCountClick={handleCountClick}
                onWipCountClick={handleWipCountClick}
                onSleExceedingClick={handleSleExceedingClick}
              />
              <FlowCharts
                doneIssues={filteredIssues.filter(i => i.fields.status.statusCategory.key === 'done')}
                wipIssues={filteredIssues.filter(i => i.fields.status.statusCategory.key === 'indeterminate')}
                medianCycleTime={cycleTimeStats?.median ?? null}
                cycleTimeRangeDays={cycleTimeRangeDays}
                statusCategoryMap={statusCategoryMap}
              />
            </div>
          )}

          {tab === 'forecasting' && (
            <div className="flex flex-col gap-6">
              <div className="flex gap-6">
                <div className="flex-1">
                  <EpicSizingPanel
                    epicEstimates={epicEstimates}
                    selectedSize={selectedSize}
                    onSelectSize={setSelectedSize}
                    hasCycleTimeData={cycleTimeStats !== null}
                    epicCount={derivedIssueCounts?.epicCount}
                  />
                </div>
                <div className="w-56 shrink-0 bg-white border border-gray-200 rounded-lg p-5 flex flex-col">
                  <h2 className="text-sm font-semibold text-gray-800 mb-4">Epics Analyzed</h2>
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    {epicData.length > 0 ? (
                      <>
                        <button
                          onClick={() => setShowEpicsModal(true)}
                          className="flex items-baseline gap-1 text-blue-700 hover:text-blue-900 hover:underline"
                        >
                          <span className="text-3xl font-bold">{epicData.length}</span>
                          <span className="text-sm">epics</span>
                        </button>
                        <p className="text-xs text-gray-400 mt-2">Updated in the last year</p>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl font-bold text-gray-300">—</span>
                        <p className="text-xs text-gray-400 mt-2">Click Calculate to load</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <ConfidenceForecast
                samples={cycleTimeStats?.samples ?? []}
                developerCount={developerCount}
                epicEstimates={epicEstimates}
              />
            </div>
          )}
        </main>
      </div>
      {showIssueModal && (
        <IssueDebugModal
          issues={modalIssues}
          statusCategoryMap={statusCategoryMap}
          onClose={() => setShowIssueModal(false)}
          highlightKeys={modalHighlightKeys}
          sle={cycleTimeStats?.p85 ?? null}
        />
      )}
      {showEpicsModal && (
        <EpicsModal
          epics={epicData}
          onClose={() => setShowEpicsModal(false)}
        />
      )}
    </div>
  )
}

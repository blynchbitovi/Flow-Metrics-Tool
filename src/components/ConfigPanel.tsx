import { useState } from 'react'
import { InfoTooltip } from './Tooltip'

interface ConfigPanelProps {
  queryMode: 'simple' | 'custom'
  onQueryModeChange: (mode: 'simple' | 'custom') => void
  projectKey: string
  onProjectKeyChange: (val: string) => void
  cycleTimeRangeDays: number
  onCycleTimeRangeDaysChange: (val: number) => void
  customQuery: string
  onCustomQueryChange: (val: string) => void
  developerCount: number
  onDeveloperCountChange: (val: number) => void
  builtQuery: string
  onFetch: () => void
  onCalculate: () => void
  isLoading: boolean
  isForecastLoading: boolean
  showForecastingControls: boolean
  availableIssueTypes: string[]
  availableStatuses: string[]
  excludedIssueTypes: Set<string>
  excludedStatuses: Set<string>
  onToggleIssueType: (type: string) => void
  onToggleStatus: (status: string) => void
  projectKeyError?: string | null
  customQueryError?: string | null
}

const FILTER_TOOLTIPS: Record<string, string> = {
  'Issue Types': 'Uncheck a type to exclude it from all metrics and charts. Epics are excluded by default since their cycle time differs significantly from standard work items.',
  'Statuses': 'Uncheck a status to remove those items from metrics. Blocked, On Hold, Canceled, and Cancelled are excluded by default as they skew cycle time and WIP age calculations.',
}

function FilterGroup({ label, items, excluded, onToggle }: {
  label: string
  items: string[]
  excluded: Set<string>
  onToggle: (item: string) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1.5">
        {label}
        {FILTER_TOOLTIPS[label] && <InfoTooltip text={FILTER_TOOLTIPS[label]} />}
      </p>
      <div className="space-y-1">
        {items.map(item => (
          <label key={item} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!excluded.has(item)}
              onChange={() => onToggle(item)}
              className="accent-blue-700"
            />
            <span className="text-xs text-gray-600">{item}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

export default function ConfigPanel({
  queryMode,
  onQueryModeChange,
  projectKey,
  onProjectKeyChange,
  cycleTimeRangeDays,
  onCycleTimeRangeDaysChange,
  customQuery,
  onCustomQueryChange,
  developerCount,
  onDeveloperCountChange,
  builtQuery,
  onFetch,
  onCalculate,
  isLoading,
  isForecastLoading,
  showForecastingControls,
  availableIssueTypes,
  availableStatuses,
  excludedIssueTypes,
  excludedStatuses,
  onToggleIssueType,
  onToggleStatus,
  projectKeyError,
  customQueryError,
}: ConfigPanelProps) {
  const hasFilterData = availableIssueTypes.length > 0 || availableStatuses.length > 0
  const [filtersOpen, setFiltersOpen] = useState(true)

  const canFetch = queryMode === 'custom'
    ? customQuery.trim().length > 0
    : !!projectKey && cycleTimeRangeDays >= 1

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Configuration</h2>
        <div className="flex rounded border border-gray-200 overflow-hidden text-xs">
          <button
            onClick={() => onQueryModeChange('simple')}
            className={`px-3 py-1 font-medium ${queryMode === 'simple' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Simple
          </button>
          <button
            onClick={() => onQueryModeChange('custom')}
            className={`px-3 py-1 font-medium border-l border-gray-200 ${queryMode === 'custom' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            Custom
          </button>
        </div>
      </div>

      {queryMode === 'simple' ? (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Key
              <InfoTooltip text="The Jira project key (e.g. PLAT, BUY). Found in the project URL or next to the project name in Jira. Used to scope all issue queries to a single project." />
            </label>
            <input
              type="text"
              value={projectKey}
              onChange={(e) => onProjectKeyChange(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canFetch && !isLoading && !isForecastLoading) {
                  showForecastingControls ? onCalculate() : onFetch()
                }
              }}
              placeholder="e.g. PLAT"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {projectKeyError && (
              <p className="text-xs text-red-600 mt-1">{projectKeyError}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cycle Time Range in Days
              <InfoTooltip text="How far back to look for completed items when calculating cycle time. Only items resolved within this window are included. In Progress items are always fetched regardless of this range." />
            </label>
            <input
              type="number"
              value={cycleTimeRangeDays}
              onChange={(e) => onCycleTimeRangeDaysChange(Number(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Completed items updated within this range will be used for cycle time calculation
            </p>
          </div>

          {builtQuery && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">
            Query Preview
            <InfoTooltip text="The JQL query that will be sent to Jira. Fetches all In Progress items and all Done items updated within your selected range." />
          </p>
              <p className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded px-3 py-2 break-all">
                {builtQuery}
              </p>
            </div>
          )}
        </>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            JQL Query
            <InfoTooltip text="A full Jira Query Language expression. Should include both In Progress and Done items to populate cycle time and WIP metrics. Press Enter to submit, Shift+Enter for a new line." />
          </label>
          <textarea
            value={customQuery}
            onChange={(e) => onCustomQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && canFetch && !isLoading && !isForecastLoading) {
                e.preventDefault()
                showForecastingControls ? onCalculate() : onFetch()
              }
            }}
            placeholder={`e.g. project = PLAT AND statusCategory in ("In Progress", Done)`}
            rows={5}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-mono"
          />
          {customQueryError && (
            <p className="text-xs text-red-600 mt-1">{customQueryError}</p>
          )}
        </div>
      )}

      {showForecastingControls && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Developers / Tracks
            <InfoTooltip text="The number of developers or parallel workstreams actively completing issues. Used to convert total dev days into calendar days. Higher values shorten estimated delivery time." />
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={developerCount}
              min={1}
              max={20}
              onChange={(e) => onDeveloperCountChange(Math.max(1, Number(e.target.value)))}
              className="w-14 border border-gray-300 rounded px-2 py-1 text-sm text-center"
            />
            <input
              type="range"
              value={developerCount}
              min={1}
              max={20}
              onChange={(e) => onDeveloperCountChange(Number(e.target.value))}
              className="flex-1 accent-blue-700"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Number of developers actively working on epics
          </p>
        </div>
      )}

      <button
        onClick={showForecastingControls ? onCalculate : onFetch}
        disabled={isLoading || isForecastLoading || !canFetch}
        className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded"
      >
        {isLoading ? 'Fetching…' : isForecastLoading ? 'Calculating…' : showForecastingControls ? 'Calculate' : 'Get Metrics'}
      </button>

      {hasFilterData && (
        <div className="border-t border-gray-100 pt-1">
          <button
            onClick={() => setFiltersOpen(o => !o)}
            className="flex items-center justify-between w-full text-xs font-medium text-gray-500 py-1 hover:text-gray-700"
          >
            <span>Filter Results</span>
            <span className="text-gray-400">{filtersOpen ? '▲' : '▼'}</span>
          </button>

          {filtersOpen && (
            <div className="space-y-4 mt-2">
              {availableIssueTypes.length > 0 && (
                <FilterGroup
                  label="Issue Types"
                  items={availableIssueTypes}
                  excluded={excludedIssueTypes}
                  onToggle={onToggleIssueType}
                />
              )}
              {availableStatuses.length > 0 && (
                <FilterGroup
                  label="Statuses"
                  items={availableStatuses}
                  excluded={excludedStatuses}
                  onToggle={onToggleStatus}
                />
              )}
            </div>
          )}
        </div>
      )}

    </div>
  )
}

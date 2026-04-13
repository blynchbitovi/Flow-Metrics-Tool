import { getInProgressDate } from '../metrics'
import type { JiraIssue } from '../jira/types'

interface IssueDebugModalProps {
  issues: JiraIssue[]
  statusCategoryMap: Map<string, string>
  onClose: () => void
  highlightKeys?: Set<string>
  sle?: number | null
}

function fmt(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function IssueDebugModal({ issues, statusCategoryMap, onClose, highlightKeys, sle }: IssueDebugModalProps) {
  const isWip = issues.length > 0 && issues.every(i => i.fields.status.statusCategory.key === 'indeterminate')


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Query Issues ({issues.length})</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Key</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Summary</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Type</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Category</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">In Progress Date</th>
                {isWip
                  ? <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Item Age</th>
                  : <>
                      <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Done Date</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Cycle Time</th>
                    </>
                }
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => {
                const inProgressDate = getInProgressDate(issue, statusCategoryMap)
                const doneDate = issue.fields.resolutiondate
                  ? new Date(issue.fields.resolutiondate as string)
                  : null
                const cycleTime =
                  inProgressDate && doneDate
                    ? Math.floor((doneDate.getTime() - inProgressDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
                    : null
                const itemAge = inProgressDate
                  ? Math.floor((Date.now() - inProgressDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
                  : null
                const exceedsSle = isWip && sle != null && itemAge != null && itemAge > sle
                const isHighlighted = (highlightKeys?.has(issue.key) ?? false) || exceedsSle
                return (
                  <tr key={issue.key} className={`border-t border-gray-100 hover:bg-gray-50 ${isHighlighted ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-2 font-mono text-blue-700 whitespace-nowrap">{issue.key}</td>
                    <td className="px-4 py-2 text-gray-700 max-w-xs truncate">{issue.fields.summary}</td>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{issue.fields.issuetype.name}</td>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{issue.fields.status.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          issue.fields.status.statusCategory.key === 'done'
                            ? 'bg-green-100 text-green-700'
                            : issue.fields.status.statusCategory.key === 'indeterminate'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {issue.fields.status.statusCategory.key === 'indeterminate'
                          ? 'In Progress'
                          : issue.fields.status.statusCategory.key}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{fmt(inProgressDate)}</td>
                    {isWip ? (
                      <td className={`px-4 py-2 whitespace-nowrap font-medium ${exceedsSle ? 'text-red-600' : 'text-gray-800'}`}>
                        {itemAge !== null ? `${itemAge}d` : '—'}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{fmt(doneDate)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {cycleTime !== null
                            ? <span className="text-gray-800">{cycleTime}d</span>
                            : <span className="text-gray-400">—</span>
                          }
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

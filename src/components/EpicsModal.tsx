import type { EpicWithChildCount } from '../jira/epics'

interface EpicsModalProps {
  epics: EpicWithChildCount[]
  onClose: () => void
}

export default function EpicsModal({ epics, onClose }: EpicsModalProps) {
  const sorted = [...epics].sort((a, b) => b.childCount - a.childCount)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-[70vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Epics Analyzed ({epics.length})</h2>
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
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Status</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Child Issues</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">In Progress</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Resolved</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Cycle Time</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((epic) => (
                <tr key={epic.key} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-blue-700 whitespace-nowrap">{epic.key}</td>
                  <td className="px-4 py-2 text-gray-700 max-w-xs truncate">{epic.summary}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        epic.statusCategory === 'done'
                          ? 'bg-green-100 text-green-700'
                          : epic.statusCategory === 'indeterminate'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {epic.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-gray-800">{epic.childCount}</td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                    {epic.inProgressDate
                      ? new Date(epic.inProgressDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                    {epic.resolutionDate
                      ? new Date(epic.resolutionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-800">
                    {epic.inProgressDate && epic.resolutionDate
                      ? `${Math.floor((new Date(epic.resolutionDate).getTime() - new Date(epic.inProgressDate).getTime()) / (1000 * 60 * 60 * 24)) + 1}d`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

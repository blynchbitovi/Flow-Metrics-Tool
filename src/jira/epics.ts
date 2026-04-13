import { jiraFetch } from './client'
import type { ChangelogHistory } from './types'
import { getInProgressDateFromHistories } from '../metrics'

interface EpicSearchResponse {
  issues: Array<{
    key: string
    fields: {
      summary: string
      status: { name: string; statusCategory: { key: string } }
      resolutiondate: string | null
    }
    changelog: { histories: ChangelogHistory[] }
  }>
  isLast: boolean
  nextPageToken?: string
}

interface ChildrenSearchResponse {
  issues: Array<{
    fields: { parent?: { key: string } }
  }>
  isLast: boolean
  nextPageToken?: string
}

export interface EpicWithChildCount {
  key: string
  summary: string
  status: string
  statusCategory: string
  inProgressDate: string | null
  resolutionDate: string | null
  childCount: number
}

export async function fetchProjectEpicsWithChildCounts(
  projectKey: string,
  statusCategoryMap: Map<string, string>
): Promise<EpicWithChildCount[]> {
  // 1. Fetch all epics updated in the last year, with changelog for in-progress date detection
  const epics: Omit<EpicWithChildCount, 'childCount'>[] = []
  let nextPageToken: string | undefined = undefined

  while (true) {
    const params = new URLSearchParams({
      jql: `project = ${projectKey} AND issuetype = Epic AND statusCategory in ("In Progress", Done) AND updatedDate >= -365d ORDER BY updated DESC`,
      fields: 'summary,status,resolutiondate',
      expand: 'changelog',
      maxResults: '100',
    })
    if (nextPageToken) params.set('nextPageToken', nextPageToken)

    const response = await jiraFetch<EpicSearchResponse>(`/rest/api/3/search/jql?${params}`)
    for (const issue of response.issues) {
      const inProgressDate = getInProgressDateFromHistories(
        issue.changelog.histories,
        statusCategoryMap
      )
      epics.push({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        statusCategory: issue.fields.status.statusCategory.key,
        inProgressDate: inProgressDate ? inProgressDate.toISOString() : null,
        resolutionDate: issue.fields.resolutiondate ?? null,
      })
    }

    if (response.isLast || response.issues.length === 0) break
    nextPageToken = response.nextPageToken
  }

  if (epics.length === 0) return []

  // 2. Single batch query for all child issues — count by parent key
  const epicKeys = epics.map(e => `"${e.key}"`).join(', ')
  const childCountMap = new Map<string, number>()
  let childNextPageToken: string | undefined = undefined

  while (true) {
    const params = new URLSearchParams({
      jql: `parent in (${epicKeys})`,
      fields: 'parent',
      maxResults: '100',
    })
    if (childNextPageToken) params.set('nextPageToken', childNextPageToken)

    const response = await jiraFetch<ChildrenSearchResponse>(`/rest/api/3/search/jql?${params}`)
    for (const issue of response.issues) {
      const parentKey = issue.fields.parent?.key
      if (parentKey) {
        childCountMap.set(parentKey, (childCountMap.get(parentKey) ?? 0) + 1)
      }
    }

    if (response.isLast || response.issues.length === 0) break
    childNextPageToken = response.nextPageToken
  }

  return epics
    .map(epic => ({ ...epic, childCount: childCountMap.get(epic.key) ?? 0 }))
    .filter(e => e.childCount > 0)
}

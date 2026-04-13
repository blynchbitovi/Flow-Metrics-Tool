import { jiraFetch } from './client'
import type { JiraIssue, SearchResponse } from './types'

const FIELDS = [
  'summary', 'updated', 'status', 'issuetype', 'parent',
  'statuscategorychangedate', 'resolutiondate',
]
const MAX_RESULTS = 100

export async function searchIssues(jql: string): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = []
  let nextPageToken: string | undefined = undefined

  while (true) {
    const params = new URLSearchParams({
      jql,
      expand: 'changelog',
      fields: FIELDS.join(','),
      maxResults: String(MAX_RESULTS),
    })

    if (nextPageToken) params.set('nextPageToken', nextPageToken)

    const response = await jiraFetch<SearchResponse>(`/rest/api/3/search/jql?${params}`)

    issues.push(...response.issues)

    if (response.isLast || response.issues.length === 0) break

    nextPageToken = response.nextPageToken
  }

  return issues
}

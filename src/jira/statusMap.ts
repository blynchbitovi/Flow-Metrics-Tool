import { jiraFetch } from './client'

interface JiraStatusResponse {
  id: string
  statusCategory: {
    key: string
  }
}

// Returns a map of status ID → statusCategory.key
// Used by metrics to classify changelog transitions without hardcoding status names
export async function getStatusCategoryMap(): Promise<Map<string, string>> {
  const statuses = await jiraFetch<JiraStatusResponse[]>('/rest/api/3/status')
  return new Map(statuses.map((s) => [s.id, s.statusCategory.key]))
}

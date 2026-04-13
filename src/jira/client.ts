const email = import.meta.env.VITE_JIRA_EMAIL
const apiToken = import.meta.env.VITE_JIRA_API_TOKEN

if (!email || !apiToken) {
  throw new Error('Missing VITE_JIRA_EMAIL or VITE_JIRA_API_TOKEN in .env')
}

const authHeader = 'Basic ' + btoa(`${email}:${apiToken}`)

export async function jiraFetch<T>(path: string): Promise<T> {
  const response = await fetch(`/api/jira${path}`, {
    cache: 'no-store',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Jira API error ${response.status}: ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

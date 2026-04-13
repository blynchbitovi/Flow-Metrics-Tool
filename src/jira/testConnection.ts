import { jiraFetch } from './client'

interface JiraUser {
  accountId: string
  displayName: string
  emailAddress: string
}

export async function testConnection(): Promise<void> {
  console.log('Testing Jira connection...')
  const user = await jiraFetch<JiraUser>('/rest/api/3/myself')
  console.log('Connection successful:', user.displayName, `(${user.emailAddress})`)
}

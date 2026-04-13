export interface StatusCategory {
  key: 'new' | 'indeterminate' | 'done'
  name: string
  colorName: string
}

export interface Status {
  id: string
  name: string
  statusCategory: StatusCategory
}

export interface ChangelogItem {
  field: string
  fieldtype: string
  from: string | null
  fromString: string | null
  to: string | null
  toString: string | null
}

export interface ChangelogHistory {
  id: string
  created: string
  items: ChangelogItem[]
}

export interface IssueParent {
  key: string
  fields: {
    summary: string
    status: Status
  }
}

export interface IssueType {
  id: string
  name: string
}

export interface JiraIssue {
  key: string
  fields: {
    summary: string
    updated: string
    status: Status
    issuetype: IssueType
    parent?: IssueParent
    statuscategorychangedate: string | null
    resolutiondate: string | null
    [key: string]: unknown // custom fields accessed dynamically via config
  }
  changelog: {
    histories: ChangelogHistory[]
  }
}

export interface SearchResponse {
  issues: JiraIssue[]
  isLast: boolean
  nextPageToken?: string
}

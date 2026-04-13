# Flow Metrics Tool - Implementation Plan

## Decisions

- **Framework**: Standalone React app (Vite + React + TypeScript)
- **Auth**: Jira API token + email (Basic Auth) — no OAuth
- **Location**: All files in `/Flow Metrics Tool/`
- **Data storage**: React state (in-memory) — see Phase 4 for rationale

---

## Phase 1: Project Setup

### Step 1: Initialize Vite + React + TypeScript
- [x] Scaffold project with `npm create vite@latest . -- --template react-ts`
- [x] Downgrade to Vite 5 / `@vitejs/plugin-react@4` for Node v22.9.0 compatibility
- [x] Run `npm install`

### Step 2: Install and configure dependencies
- [x] Install `tailwindcss` and `@tailwindcss/vite`
- [x] Add `tailwindcss()` plugin to `vite.config.ts`
- [x] Replace `src/index.css` with `@import "tailwindcss"`
- [x] Move `tailwindcss` and `@tailwindcss/vite` to `devDependencies`
- [x] Rename package from `"tmp"` to `"flow-metrics-tool"`

### Step 3: Configure Jira credentials
- [x] Create `.env` file with `VITE_JIRA_EMAIL`, `VITE_JIRA_API_TOKEN`, `VITE_JIRA_SITE_URL`
- [x] Add `.env` and `.env.local` to `.gitignore`

### Step 4: Configure Vite proxy (CORS workaround)
- [x] Add proxy config to `vite.config.ts` using `loadEnv` to read `VITE_JIRA_SITE_URL`
- [x] All Jira API calls use `/api/jira/rest/api/3/...` as base URL

### Step 5: Clean up Vite starter files
- [x] Replace `App.tsx` with minimal placeholder
- [x] Delete `App.css`
- [x] Delete unused assets (`react.svg`, `vite.svg`, `hero.png`)

---

## Phase 2: Jira Connection Module

### Step 1: Create Jira API client — `src/jira/client.ts`
- [x] Read credentials from `import.meta.env` at module load time
- [x] Throw on missing credentials to catch misconfiguration early
- [x] Build Basic Auth header with `btoa(email:apiToken)`
- [x] Export `jiraFetch<T>(path)` — prefixes `/api/jira`, attaches auth + content headers

### Step 2: Create TypeScript types — `src/jira/types.ts`
- [x] `StatusCategory` interface (`key: 'new' | 'indeterminate' | 'done'`)
- [x] `Status` interface
- [x] `ChangelogItem` and `ChangelogHistory` interfaces
- [x] `IssueParent` interface
- [x] `JiraIssue` interface (key, fields, changelog) with optional `parent`
- [x] `SearchResponse` interface (paginated results)

### Step 3: Verify connection — `src/jira/testConnection.ts`
- [x] Call `/rest/api/3/myself` via `jiraFetch`
- [x] Import and call from `App.tsx` inside a `useEffect`, log result to console
- [x] Confirmed working: proxy routing, credentials, and CORS all resolved

### Step 4: Create JQL search function — `src/jira/search.ts`
- [x] Implement `searchIssues(jql: string): Promise<JiraIssue[]>`
- [x] Request fields: `summary`, `updated`, `status`, `parent`
- [x] Use `/rest/api/3/search/jql` with `expand=changelog` (updated from `/search` — deprecated by Atlassian)
- [x] Handle pagination (loop until `issues.length === total`)

**Fields and their source:**

| Field | Jira source | Custom? |
|---|---|---|
| Issue ID / Key | `key` (top-level on issue object) | No — standard |
| Summary | `fields.summary` | No — standard |
| Updated Date | `fields.updated` | No — standard |
| Parent | `fields.parent` | No — standard |
| In Progress Date | Derived from `changelog` — first transition to `statusCategory.key === "indeterminate"` | No — computed |
| Work Item Age | Calculated: In Progress Date → now (incomplete items only) | No — computed |
| Cycle Time | Calculated: In Progress Date → first transition to `statusCategory.key === "done"` | No — computed |

---

## Phase 3: Metrics Calculation

> All metric functions consolidated into `src/metrics.ts` (not separate files).
> `src/jira/statusMap.ts` added as a prerequisite — fetches all Jira statuses once
> to build a `Map<statusId, categoryKey>` used by transition parsing.

### Step 1: Parse status transitions
- [x] Extract status change timestamps from changelog
- [x] Use `statusCategory.key` via `statusMap` to identify transition points:
  - `"indeterminate"` = In Progress
  - `"done"` = Done
  - `"new"` = To Do
- [x] Return first In Progress date and first Done date per issue
- [x] Sort histories chronologically before iterating (API order not guaranteed)

### Step 2: Calculate cycle time
- [x] Cycle time = first "In Progress" → first "Done" in days
- [x] Only include completed issues (those with a Done date)
- [x] Derive: average, median, 85th percentile (SLE)
- [x] Include `count` field (number of issues used in calculation)

### Step 3: Calculate WIP age
- [x] Age = first "In Progress" → now (incomplete items only)
- [x] Identify the item with the highest age and its issue key
- [x] Return all WIP items so UI can flag those exceeding SLE

### Step 4: Epic size estimation
- [x] Formula: Expected Dev Days = Cycle Time × Issue Count
- [x] Formula: Expected Calendar Days = Dev Days ÷ Developer Count
- [x] Apply for Big (~28 issues), Average (~15 issues), Small (~6 issues)
- [x] Return estimated weeks (5 working days per week)

---

## Phase 4: React UI

### Data storage approach: React state (in-memory)
For this POC, all fetched data lives in `useState` hooks at the top-level `App` component
and is passed down as props. No URL params, no localStorage, no external store.
Data resets on page refresh, which is acceptable for a POC.

State shape (as implemented):
```ts
// Config
projectKey: string              // replaces activeItemsJQL + cycleTimeJQL
cycleTimeRangeDays: number      // replaces free-form JQL date range
developerCount: number

// Derived query (built from projectKey + cycleTimeRangeDays, not stored in state)
// (project = X AND statusCategory = "In Progress") OR
// (project = X AND statusCategory = Done AND updatedDate <= -Yd)

// Results (raw issues not stored — only computed outputs)
cycleTimeStats: CycleTimeStats | null
wipAgeResult: WipAgeResult | null

// UI
isLoading: boolean
hasCycleTimeData: boolean
tab: 'estimation' | 'pace-review'
```

### Step 1: Build layout — `src/App.tsx`
- [x] Header with app title
- [x] Left panel: fixed 320px sidebar
- [x] Right panel: page title, Estimation/Pace Review tabs, metric cards and estimation placeholder sections

### Step 2: Configuration panel — `src/components/ConfigPanel.tsx`
- [x] Project Key input (auto-uppercases, disables Fetch until populated)
- [x] Cycle Time Range in Days input (numeric, defaults to 30)
- [x] Query Preview — shows constructed JQL before fetching
- [x] Fetch button
- [x] Input Type toggle (Epic Size / Issue Count) — UI only, not wired to calculations yet
- [x] Developer Count number input + range slider

### Step 3: Metrics cards — `src/components/MetricsCards.tsx`
- [x] Avg Cycle Time card
- [x] Med Cycle Time card
- [x] SLE (85th percentile) card
- [x] Max WIP Age card — red border + warning when exceeding SLE, shows offending issue key

### Step 4: Epic Size Estimation — `src/components/EpicSizeEstimation.tsx`
- [ ] Deferred to a future phase

### Step 5: Confidence-Based Forecast — `src/components/ConfidenceForecast.tsx`
- [ ] Deferred to a future phase

### Step 6: Formulas Reference — `src/components/FormulasReference.tsx`
- [ ] Deferred to a future phase

---

## Phase 5: Wire Up & Validate

- [ ] Remove `testConnection` stub from `App.tsx`
- [ ] Replace `setTimeout` stub in `handleFetch` with real `searchIssues(builtQuery)` call
- [ ] Fetch `statusCategoryMap` alongside issues
- [ ] Split results by `statusCategory.key`: `"indeterminate"` → WIP age, `"done"` → cycle time
- [ ] Pipe issues through `calculateCycleTimeStats` and `calculateWipAge`
- [ ] Update `cycleTimeStats` and `wipAgeResult` state with results
- [ ] Wire `handleCalculateForecast` to `calculateEpicEstimates`
- [ ] Add error handling and display to the UI
- [ ] Validate calculations manually against Jira UI

---

## Success Criteria

- [x] Credentials loaded from `.env` at startup (no UI entry required)
- [x] Jira connection verified through proxy
- [ ] Fetch button retrieves issues from Jira
- [ ] Avg, median, and 85th percentile cycle time display correctly
- [ ] Max WIP age identified and flagged if over SLE
- [ ] Epic size estimation calculates for Big/Average/Small
- [ ] Confidence-based forecast updates based on selected size

---

## Future Phases

- Epic Size Estimation component (Phase 4 Step 4)
- Confidence-Based Forecast component (Phase 4 Step 5)
- Formulas Reference component (Phase 4 Step 6)
- Wire Input Type toggle (Epic Size / Issue Count) to calculations
- Persist credentials to localStorage (skip re-entry on reload)
- URL param support for shareable configurations
- Pace Review tab
- Historical data tracking
- Export to CSV


## Notes for Me
- Get Work Item Age from In Progress Date to Today +1
- In that case, Cycle time would be calculated for In Progress Date to Status Category changed date +1?
- ---> could just add a "completion date" to minimize effort? 
- For Epic size count, pull all completed epics for project in the last year, count children
- Add json for automations to be added to Jira
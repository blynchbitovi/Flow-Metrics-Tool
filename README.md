# Flow Metrics Forecasting Tool

A browser-based flow metrics dashboard that connects to Jira Cloud to surface cycle time, WIP age, throughput, and epic delivery forecasts using Monte Carlo simulation.

## Features

- **Cycle Time** — average, median, and 85th percentile (SLE) across completed items
- **WIP Age** — tracks how long in-progress items have been active using changelog-based start dates
- **Throughput** — count of items completed in a configurable date range
- **Epic Forecasting** — delivery estimates based on historical epic sizes and Monte Carlo simulation
- **Confidence-Based Forecast** — probability distribution of completion dates at best/likely/worst case
- **Custom JQL** — query by project key or write your own JQL
- **Filters** — toggle issue types and statuses in/out of all metrics

## Prerequisites

- Node.js 18+
- A Jira Cloud account with API access
- A Jira API token — generate one at https://id.atlassian.com/manage-profile/security/api-tokens

## Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/blynchbitovi/Flow-Metrics-Tool.git
   cd Flow-Metrics-Tool
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy the `.env` file template and fill in your credentials:
   ```bash
   cp .env .env.local
   ```
   Open `.env.local` and set:
   - `VITE_JIRA_EMAIL` — your Jira login email
   - `VITE_JIRA_API_TOKEN` — your API token
   - `VITE_JIRA_SITE_URL` — your Jira site URL (e.g. `https://your-org.atlassian.net`)

4. **Start the dev server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

## Usage

### Simple Mode
Enter a **Project Key** (e.g. `PLAT`) and a **Cycle Time Range** in days, then click **Get Metrics**. The tool will fetch all in-progress and recently completed items for that project.

### Custom Mode
Switch to **Custom** in the configuration panel and enter any valid JQL query. Your query should include both in-progress and done items to populate all metrics, for example:
```
project = PLAT AND statusCategory in ("In Progress", Done) AND updatedDate >= -60d
```

### How Dates Are Calculated
In-progress dates are derived from the Jira changelog — specifically the **last transition from a To Do status into an In Progress status**. This means accidental starts that were reverted don't affect your metrics.

## Tech Stack

- [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vitejs.dev) (dev server + proxy for Jira API)
- [Tailwind CSS](https://tailwindcss.com)
- Jira Cloud REST API v3

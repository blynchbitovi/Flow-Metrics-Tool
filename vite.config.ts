import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api/jira': {
          target: env.VITE_JIRA_SITE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/jira/, ''),
        },
      },
    },
  }
})

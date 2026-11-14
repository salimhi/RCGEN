import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function localApiPlugin(): Plugin {
  return {
    name: 'local-api-middleware',
    apply: 'serve',
    async configureServer(server) {
      try {
        // @ts-ignore
        const { createDevApiMiddleware } = await import('./server/dev-server.js');
        server.middlewares.use(createDevApiMiddleware());
      } catch (err) {
        console.error('[Vite] Failed to initialize local dev API middleware:', err);
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), tailwindcss(), localApiPlugin()];
  try {
    // @ts-ignore
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {}

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
  };
})

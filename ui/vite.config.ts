import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Local data provider plugin
const pickupApiPlugin = () => {
  return {
    name: 'pickup-api',
    configureServer(server: any) {
      server.middlewares.use('/api/checkpoints', async (_req: any, res: any) => {
        const storePath = process.env.PICKUP_STORE || path.join(os.homedir(), '.pickup', 'checkpoints.jsonl');
        try {
          if (!fs.existsSync(storePath)) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify([]));
          }
          const content = await fs.promises.readFile(storePath, 'utf-8');
          const records = [];
          for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            try {
              records.push(JSON.parse(line.trim()));
            } catch (e) {
              // Ignore
            }
          }
          // Return newest first
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(records.reverse()));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), pickupApiPlugin()],
  server: {
    port: 3000,
    open: true
  }
})

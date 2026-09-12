/**
 * Serves /api/* during `npm run dev` using the same handler code Vercel runs in
 * production, so local development exercises the real OCR path.
 */
import type { Plugin } from 'vite'
import { runOcr, providerConfig } from './ocrHandler'

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      // Match the production limit so a too-large photo fails the same way.
      if (data.length > 8_000_000) reject(new Error('Request body too large.'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

export function devApi(): Plugin {
  return {
    name: 'spelling-coach-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/config', (_req, res) => {
        const cfg = providerConfig()
        res.setHeader('content-type', 'application/json')
        res.end(
          JSON.stringify({ ocrConfigured: cfg.configured, provider: cfg.configured ? cfg.provider : 'tesseract' }),
        )
      })

      server.middlewares.use('/api/ocr', async (req, res) => {
        res.setHeader('content-type', 'application/json')
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ ok: false, code: 'invalid_request', message: 'POST required' }))
          return
        }
        try {
          const raw = await readBody(req)
          const result = await runOcr(JSON.parse(raw))
          res.statusCode = result.ok ? 200 : result.code === 'no_provider' ? 503 : 502
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = 400
          res.end(
            JSON.stringify({ ok: false, code: 'invalid_request', message: (error as Error).message }),
          )
        }
      })
    },
  }
}

/**
 * Production serverless endpoint (Vercel).
 *
 * Deploy alongside the static build and set OCR_PROVIDER / OCR_MODEL /
 * OCR_API_KEY as SERVER-SIDE environment variables. Without it the app still
 * works — it falls back to the in-browser Tesseract engine.
 */
import { runOcr } from '../server/ocrHandler'

interface VercelLikeRequest {
  method?: string
  body?: unknown
}
interface VercelLikeResponse {
  status(code: number): VercelLikeResponse
  json(payload: unknown): void
}

export const config = { api: { bodyParser: { sizeLimit: '6mb' } } }

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, code: 'invalid_request', message: 'POST required' })
    return
  }
  let body: unknown
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  } catch {
    res.status(400).json({ ok: false, code: 'invalid_request', message: 'Body was not valid JSON.' })
    return
  }
  const result = await runOcr(body as never)
  const status = result.ok ? 200 : result.code === 'no_provider' ? 503 : result.code === 'invalid_request' ? 400 : 502
  res.status(status).json(result)
}

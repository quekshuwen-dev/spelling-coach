/**
 * Tells the client which OCR engine it will get, so the UI can say so honestly
 * before the first scan. It never returns the key itself.
 */
import { providerConfig } from '../server/ocrHandler'

interface VercelLikeResponse {
  status(code: number): VercelLikeResponse
  json(payload: unknown): void
}

export default function handler(_req: unknown, res: VercelLikeResponse) {
  const cfg = providerConfig()
  res.status(200).json({
    ocrConfigured: cfg.configured,
    provider: cfg.configured ? cfg.provider : 'tesseract',
  })
}

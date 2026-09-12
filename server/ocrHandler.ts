/**
 * Server-side OCR.
 *
 * This is the ONLY place an OCR provider key is used. The browser posts a
 * downscaled base64 photo here, the photo is forwarded to the configured
 * provider, and only structured JSON goes back. Nothing is written to disk or
 * to any database at this layer — the image lives in memory for the length of
 * the request and is then garbage-collected.
 *
 * Switching provider/model is configuration, not code:
 *   OCR_PROVIDER=anthropic|openai|google-vision|none
 *   OCR_MODEL=<model id>
 *   OCR_API_KEY=<secret>
 */
import {
  OCR_SYSTEM_PROMPT,
  OCR_USER_PROMPT,
  extractJson,
  validateOcrResponse,
  type OcrPayload,
} from '../src/services/ocrSchema'

export interface OcrRequest {
  /** data URL or bare base64 JPEG/PNG */
  image: string
  mimeType?: string
}

export type OcrFailureCode =
  | 'no_provider'
  | 'invalid_request'
  | 'provider_error'
  | 'invalid_ai_response'
  | 'timeout'
  | 'too_large'

export type OcrResponse =
  | { ok: true; result: OcrPayload; provider: string }
  | { ok: false; code: OcrFailureCode; message: string }

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o-mini',
}

/** Vercel's request body limit is 4.5 MB; refuse before the platform does. */
const MAX_BASE64_BYTES = 4_000_000

export function providerConfig(env: NodeJS.ProcessEnv = process.env) {
  const provider = (env.OCR_PROVIDER ?? (env.OCR_API_KEY ? 'anthropic' : 'none')).toLowerCase()
  const apiKey = env.OCR_API_KEY ?? ''
  const model = env.OCR_MODEL || DEFAULT_MODELS[provider] || ''
  return {
    provider,
    apiKey,
    model,
    baseUrl: env.OCR_BASE_URL ?? '',
    configured: provider !== 'none' && Boolean(apiKey),
    timeoutMs: Number(env.OCR_TIMEOUT_MS ?? 45000),
  }
}

function splitDataUrl(image: string, fallbackMime = 'image/jpeg') {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(image)
  if (match) return { mimeType: match[1], base64: match[2] }
  return { mimeType: fallbackMime, base64: image }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300)
  } catch {
    return '(no body)'
  }
}

type Cfg = ReturnType<typeof providerConfig>

async function callAnthropic(cfg: Cfg, body: OcrRequest, signal: AbortSignal): Promise<string> {
  const { mimeType, base64 } = splitDataUrl(body.image, body.mimeType)
  const response = await fetch(`${cfg.baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 4000,
      system: OCR_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: OCR_USER_PROMPT },
          ],
        },
      ],
    }),
  })
  if (!response.ok) throw new Error(`Anthropic API error ${response.status}: ${await safeText(response)}`)
  const json = (await response.json()) as { content?: { type: string; text?: string }[] }
  const text = (json.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
  if (!text) throw new Error('Anthropic API returned no text content.')
  return text
}

async function callOpenAI(cfg: Cfg, body: OcrRequest, signal: AbortSignal): Promise<string> {
  const { mimeType, base64 } = splitDataUrl(body.image, body.mimeType)
  const response = await fetch(`${cfg.baseUrl || 'https://api.openai.com'}/v1/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: OCR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: OCR_USER_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
    }),
  })
  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${await safeText(response)}`)
  const json = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const text = json.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('OpenAI API returned no content.')
  return text
}

/**
 * Google Cloud Vision DOCUMENT_TEXT_DETECTION. Returns plain text rather than
 * our JSON shape, so it is adapted here instead of going through extractJson.
 */
async function callGoogleVision(cfg: Cfg, body: OcrRequest, signal: AbortSignal): Promise<OcrPayload> {
  const { base64 } = splitDataUrl(body.image, body.mimeType)
  const url = `${cfg.baseUrl || 'https://vision.googleapis.com'}/v1/images:annotate?key=${encodeURIComponent(cfg.apiKey)}`
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['en', 'zh-Hans'] },
        },
      ],
    }),
  })
  if (!response.ok) throw new Error(`Vision API error ${response.status}: ${await safeText(response)}`)
  const json = (await response.json()) as {
    responses?: { fullTextAnnotation?: { text?: string }; error?: { message?: string } }[]
  }
  const first = json.responses?.[0]
  if (first?.error?.message) throw new Error(`Vision API error: ${first.error.message}`)
  const text = first?.fullTextAnnotation?.text ?? ''
  // Word splitting is done client-side so every engine goes through the same
  // cleaning rules; Vision just supplies the text.
  return { text, words: [], notRecognised: text.trim().length === 0 }
}

/** Framework-agnostic core so the same code serves Vite dev and production. */
export async function runOcr(body: OcrRequest, env: NodeJS.ProcessEnv = process.env): Promise<OcrResponse> {
  if (!body?.image || typeof body.image !== 'string') {
    return { ok: false, code: 'invalid_request', message: 'No image was provided.' }
  }
  if (body.image.length > MAX_BASE64_BYTES) {
    return { ok: false, code: 'too_large', message: 'That photo is too large. Try again a little further back.' }
  }

  const cfg = providerConfig(env)
  if (!cfg.configured) {
    return {
      ok: false,
      code: 'no_provider',
      message: 'No OCR provider is configured on the server. The app will read the photo on the device instead.',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  try {
    let result: OcrPayload
    switch (cfg.provider) {
      case 'anthropic':
        result = validateOcrResponse(extractJson(await callAnthropic(cfg, body, controller.signal)))
        break
      case 'openai':
        result = validateOcrResponse(extractJson(await callOpenAI(cfg, body, controller.signal)))
        break
      case 'google-vision':
        result = await callGoogleVision(cfg, body, controller.signal)
        break
      default:
        return {
          ok: false,
          code: 'no_provider',
          message: `Unknown OCR_PROVIDER "${cfg.provider}". Use "anthropic", "openai", "google-vision" or "none".`,
        }
    }
    return { ok: true, result, provider: cfg.provider }
  } catch (error) {
    const err = error as Error
    if (err.name === 'AbortError') {
      return { ok: false, code: 'timeout', message: 'The OCR service took too long to respond.' }
    }
    if (err.name === 'InvalidOcrResponseError') {
      return { ok: false, code: 'invalid_ai_response', message: err.message }
    }
    // Log server-side only — never leak provider errors (or keys) to the client.
    console.error('[ocr] provider failure:', err.message)
    return { ok: false, code: 'provider_error', message: 'The OCR service is unavailable right now.' }
  } finally {
    clearTimeout(timer)
    // Drop the reference to the image payload as soon as the call is done.
    body.image = ''
  }
}

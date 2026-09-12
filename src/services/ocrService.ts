/**
 * Client-side OCR.
 *
 * Two engines, one interface:
 *
 *   1. SERVER (preferred) — POSTs the temporary photo to our own /api/ocr,
 *      which holds the provider key. Best accuracy on photos of paper and
 *      handwriting, and the key never touches the browser.
 *   2. TESSERACT (fallback) — runs entirely in the browser. No key, no server,
 *      works offline once cached. Weaker on handwriting, fine on printed lists.
 *
 * The app deliberately ships usable with NO credentials at all: if /api/ocr
 * says "no_provider", we quietly switch to Tesseract rather than failing.
 */
import { forceLocalOcr } from '../config/env'
import { cleanWord, detectLang, isPlausibleWord, splitIntoWords, wordQuality } from '../lib/words'
import type { OcrResult, OcrWord } from '../types'
import type { PreparedImage } from './imageProcessingService'
import type { OcrPayload } from './ocrSchema'

export type OcrFailureCode = 'offline' | 'timeout' | 'unreadable' | 'too_large' | 'engine_failed' | 'unknown'

export class OcrError extends Error {
  code: OcrFailureCode
  constructor(code: OcrFailureCode, message: string) {
    super(message)
    this.code = code
    this.name = 'OcrError'
  }
}

let serverAvailable: boolean | null = null

/** Cheap probe so the UI can say which engine will be used before the first scan. */
export async function isServerOcrConfigured(): Promise<boolean> {
  if (forceLocalOcr) return false
  if (serverAvailable !== null) return serverAvailable
  try {
    const response = await fetch('/api/config')
    if (!response.ok) {
      serverAvailable = false
      return false
    }
    const json = (await response.json()) as { ocrConfigured?: boolean }
    serverAvailable = Boolean(json.ocrConfigured)
  } catch {
    serverAvailable = false
  }
  return serverAvailable
}

export interface RecogniseOptions {
  /** Called with 0..1 so the UI can show real progress, not a fake spinner. */
  onProgress?: (fraction: number, label: string) => void
}

/**
 * Reads an image and returns selectable word candidates.
 * The caller owns the image and must call discardImage() afterwards.
 */
export async function recognise(image: PreparedImage, options: RecogniseOptions = {}): Promise<OcrResult> {
  const { onProgress } = options

  if (!forceLocalOcr && navigator.onLine !== false) {
    try {
      onProgress?.(0.15, 'Reading the photo')
      const payload = await callServer(image)
      if (payload) {
        onProgress?.(1, 'Done')
        return toResult(payload.result, payload.provider, false)
      }
    } catch (error) {
      // A configured-but-broken server is worth surfacing; anything else just
      // means "use the device engine instead".
      if (error instanceof OcrError && error.code !== 'engine_failed') throw error
    }
  }

  onProgress?.(0.05, 'Starting the on-device reader')
  const payload = await runTesseract(image, onProgress)
  onProgress?.(1, 'Done')
  return toResult(payload, 'tesseract', true)
}

async function callServer(
  image: PreparedImage,
): Promise<{ result: OcrPayload; provider: OcrResult['engine'] } | null> {
  let response: Response
  try {
    response = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: image.dataUrl, mimeType: image.mimeType }),
    })
  } catch {
    // No server (static hosting, offline, dev without the plugin) — fall back.
    return null
  }

  let body: {
    ok?: boolean
    code?: string
    message?: string
    provider?: string
    result?: OcrPayload
  }
  try {
    body = await response.json()
  } catch {
    return null
  }

  if (body.ok && body.result) {
    serverAvailable = true
    return { result: body.result, provider: (body.provider as OcrResult['engine']) ?? 'anthropic' }
  }

  if (body.code === 'no_provider') {
    serverAvailable = false
    return null
  }
  if (body.code === 'too_large') {
    throw new OcrError('too_large', body.message ?? 'That photo is too large.')
  }
  if (body.code === 'timeout') {
    throw new OcrError('timeout', 'Reading the photo took too long. Try again.')
  }
  // Provider error / invalid response: the device engine is a better outcome
  // for the child than an error screen.
  return null
}

/**
 * Lazily imports Tesseract so its ~3 MB wasm core is only downloaded by users
 * who actually need the offline engine.
 */
async function runTesseract(
  image: PreparedImage,
  onProgress?: RecogniseOptions['onProgress'],
): Promise<OcrPayload> {
  let createWorker: typeof import('tesseract.js').createWorker
  try {
    ;({ createWorker } = await import('tesseract.js'))
  } catch {
    throw new OcrError('engine_failed', 'The on-device reader could not be loaded. Check your connection once.')
  }

  // eng+chi_sim so a 听写 list works too. Tesseract downloads each language
  // pack once and the service worker caches it.
  //
  // Starting the worker is its own failure mode — it fetches a wasm core and a
  // language pack from a CDN — and must be reported as "the reader could not
  // start", not as an unhandled error.
  let worker: Awaited<ReturnType<typeof createWorker>>
  try {
    worker = await createWorker(['eng', 'chi_sim'], 1, {
      logger: (m: { status?: string; progress?: number }) => {
        if (typeof m.progress !== 'number') return
        const label = m.status === 'recognizing text' ? 'Reading the words' : 'Getting the reader ready'
        // Reserve the first 30% for loading the engine, the rest for recognition.
        const fraction = m.status === 'recognizing text' ? 0.3 + m.progress * 0.7 : m.progress * 0.3
        onProgress?.(Math.min(0.99, fraction), label)
      },
    })
  } catch {
    throw new OcrError(
      'engine_failed',
      'The on-device reader could not start. It needs the internet once to download, then it works offline.',
    )
  }

  try {
    const { data } = await worker.recognize(image.dataUrl)
    const text = data.text ?? ''
    if (!text.trim()) {
      throw new OcrError('unreadable', 'No words could be read from that photo.')
    }
    return { text, words: [], notRecognised: false }
  } catch (error) {
    if (error instanceof OcrError) throw error
    throw new OcrError('engine_failed', 'The on-device reader could not read that photo.')
  } finally {
    await worker.terminate()
  }
}

/**
 * Turns raw engine output into de-duplicated, selectable word candidates.
 * Every engine goes through this, so cleaning rules are identical regardless
 * of which one ran.
 */
export function toResult(payload: OcrPayload, engine: string, local: boolean): OcrResult {
  const candidates = payload.words.length ? payload.words : splitIntoWords(payload.text)

  const seen = new Set<string>()
  const words: OcrWord[] = []
  for (const raw of candidates) {
    const text = cleanWord(raw)
    if (!isPlausibleWord(text)) continue
    const key = detectLang(text) === 'zh' ? text : text.toLocaleLowerCase('en')
    if (seen.has(key)) continue
    seen.add(key)
    words.push({
      id: `ocr_${words.length}_${key}`,
      raw,
      text,
      lang: detectLang(text),
      // Nothing is pre-selected: the parent chooses, which is the whole point
      // of the review step.
      selected: false,
      quality: wordQuality(text),
    })
  }

  // Confident candidates first, each group still in reading order, so the words
  // the parent is looking for are at the top instead of scattered through the
  // fragments a photo of packaging or a book cover produces.
  const ordered = [
    ...words.filter((w) => w.quality === 'likely'),
    ...words.filter((w) => w.quality === 'unsure'),
  ]

  return { text: payload.text, words: ordered, engine: engine as OcrResult['engine'], local }
}

export const ocrService = { recognise, isServerOcrConfigured }
export default ocrService

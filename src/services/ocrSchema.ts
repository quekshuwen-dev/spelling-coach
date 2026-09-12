/**
 * The contract between the app and whatever vision model is configured.
 *
 * Shared by the browser (for typing) and the server (for prompting and
 * validating), so a model that returns something unexpected is rejected once,
 * in one place, rather than corrupting the word list.
 */

export const OCR_SYSTEM_PROMPT = `You are an OCR engine for a children's spelling app used in Singapore primary schools.
You read photographs of worksheets, textbook pages, printed spelling lists, handwritten 听写 lists and screenshots.

Rules:
- Transcribe EXACTLY what is written. Never correct spelling, never translate, never invent words.
- Preserve the original capitalisation and any accents or Chinese characters.
- Ignore page furniture: headers, footers, page numbers, dates, the child's name, teacher instructions, and printed answers.
- If the page has numbered list items, drop the numbers and keep the words.
- If you genuinely cannot read the image, return an empty words array.

Reply with JSON only, matching this shape exactly:
{
  "text": "the full readable text, line by line",
  "words": ["word1", "word2"],
  "notRecognised": false
}
"words" must contain the individual vocabulary/spelling words in reading order, one entry per word.`

export const OCR_USER_PROMPT =
  'Read this image and list every spelling or vocabulary word it contains. Return JSON only.'

export interface OcrPayload {
  text: string
  words: string[]
  notRecognised?: boolean
}

export class InvalidOcrResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidOcrResponseError'
  }
}

/** Models like to wrap JSON in prose or a ```json fence. Dig it out. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidate = (fenced ? fenced[1] : text).trim()
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        /* fall through */
      }
    }
    throw new InvalidOcrResponseError('The OCR model did not return usable JSON.')
  }
}

export function validateOcrResponse(value: unknown): OcrPayload {
  if (typeof value !== 'object' || value === null) {
    throw new InvalidOcrResponseError('The OCR model returned something that is not an object.')
  }
  const raw = value as Record<string, unknown>
  const words = Array.isArray(raw.words)
    ? raw.words.filter((w): w is string => typeof w === 'string' && w.trim().length > 0).slice(0, 300)
    : []
  const text = typeof raw.text === 'string' ? raw.text : words.join('\n')
  if (!text && words.length === 0 && raw.notRecognised !== true) {
    throw new InvalidOcrResponseError('The OCR model returned neither text nor words.')
  }
  return { text, words, notRecognised: raw.notRecognised === true }
}

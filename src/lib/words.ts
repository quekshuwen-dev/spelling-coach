/**
 * Pure word helpers. No DOM, no network — these are the functions the unit
 * tests pin down, because everything downstream (de-duplication, OCR cleanup,
 * which voice to use) depends on them behaving predictably.
 */
import type { WordLang } from '../types'

const HANZI = /[一-鿿]/
/** Pinyin tone-marked vowels. Their presence is what distinguishes "mǎ" from "ma". */
const TONE_MARKS = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/

export function detectLang(word: string): WordLang {
  if (HANZI.test(word)) return 'zh'
  if (TONE_MARKS.test(word)) return 'py'
  return 'en'
}

/**
 * Strips the punctuation OCR loves to glue onto words, while keeping the
 * punctuation that is genuinely part of a word.
 *
 *   "Beautiful,"  -> "Beautiful"
 *   "butterfly."  -> "butterfly"
 *   "don't"       -> "don't"      (apostrophe kept)
 *   "well-known"  -> "well-known" (internal hyphen kept)
 *   "--word--"    -> "word"       (edge hyphens dropped)
 */
export function cleanWord(raw: string): string {
  let w = raw.normalize('NFC').trim()
  // Curly quotes to straight, so "don’t" and "don't" de-duplicate to one word.
  w = w.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"')
  // Drop a leading list marker: "1.", "12)", "•", "-" followed by space.
  w = w.replace(/^\s*(?:\d{1,3}\s*[.)\]]|[•*•●–—-])\s+/, '')
  // Trim anything that is not a letter, digit or CJK from both ends.
  w = w.replace(/^[^\p{L}\p{N}一-鿿]+/u, '').replace(/[^\p{L}\p{N}一-鿿']+$/u, '')
  // A trailing apostrophe is only legitimate in possessives like "James'".
  if (w.endsWith("'") && !/[sS]'$/.test(w)) w = w.slice(0, -1)
  return w.trim()
}

/** The de-duplication key. Case- and accent-insensitive for Latin scripts. */
export function normalizeWord(word: string): string {
  const cleaned = cleanWord(word)
  if (detectLang(cleaned) === 'zh') return cleaned
  return cleaned.toLocaleLowerCase('en')
}

/**
 * Is this a plausible spelling word rather than OCR noise?
 * Rejects stray glyphs, page numbers and run-on scan artefacts.
 */
export function isPlausibleWord(word: string): boolean {
  const w = cleanWord(word)
  if (!w) return false
  if (detectLang(w) === 'zh') return w.length <= 8
  if (w.length < 2 || w.length > 28) return false
  // Letters, with an apostrophe or hyphen only between letters, plus an
  // optional possessive apostrophe. Rejects "x/y", "a1b2c3", "12" and "--".
  return /^\p{L}+(?:['-]\p{L}+)*'?$/u.test(w)
}

/** Split a block of OCR text into individual candidate words, in reading order. */
export function splitIntoWords(text: string): string[] {
  const out: string[] = []
  for (const token of text.split(/[\s,;:!?()[\]{}"“”/\\|]+|[，、。；：！？（）「」《》]+/)) {
    const cleaned = cleanWord(token)
    if (!cleaned) continue
    if (detectLang(cleaned) === 'zh' && cleaned.length > 4) {
      // A long hanzi run is usually a sentence; offer the characters instead.
      for (const ch of cleaned) out.push(ch)
    } else {
      out.push(cleaned)
    }
  }
  return out
}

/** Compare a child's typed answer with the target. Forgiving about case and spacing only. */
export function answerMatches(answer: string, target: string): boolean {
  const a = cleanWord(answer)
  const b = cleanWord(target)
  if (!a) return false
  if (detectLang(b) === 'zh') return a === b
  return a.toLocaleLowerCase('en') === b.toLocaleLowerCase('en')
}

/**
 * Character-level diff used to show the child *where* they went wrong.
 * Returns one marker per character of the correct answer.
 */
export function diffAnswer(answer: string, target: string): { char: string; ok: boolean }[] {
  const a = cleanWord(answer)
  const b = cleanWord(target)
  const same = detectLang(b) === 'zh' ? a : a.toLocaleLowerCase('en')
  const goal = detectLang(b) === 'zh' ? b : b.toLocaleLowerCase('en')
  return [...b].map((char, i) => ({ char, ok: same[i] === goal[i] }))
}

/**
 * Pure word helpers. No DOM, no network — these are the functions the unit
 * tests pin down, because everything downstream (de-duplication, OCR cleanup,
 * which voice to use) depends on them behaving predictably.
 */
import type { WordLang, WordQuality } from '../types'

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
 * The only two-letter strings that are really words. Photographing packaging or
 * a textbook throws off dozens of two-letter fragments ("Un", "ig", "er") as the
 * engine clips the edge of a larger word, and without this list every one of
 * them reaches the picker looking exactly like a real spelling word.
 */
const TWO_LETTER_WORDS = new Set([
  'am', 'an', 'as', 'at', 'ax', 'be', 'by', 'do', 'go', 'ha', 'he', 'hi', 'id', 'if', 'in', 'is',
  'it', 'me', 'my', 'no', 'of', 'oh', 'ok', 'on', 'or', 'ox', 'pi', 'so', 'to', 'up', 'us', 'we',
])

/** Diacritics removed, so "mǎ" tests as "ma" and "café" as "cafe". */
function deaccent(word: string): string {
  return word.normalize('NFD').replace(/\p{M}/gu, '')
}

/**
 * Is this a plausible spelling word rather than OCR noise?
 *
 * The rules below are tuned against the way OCR actually fails on a photo of
 * printed packaging: it returns short consonant runs from logos ("RN", "CC",
 * "TR"), all-caps fragments of stylised text ("EWN"), and two-letter slivers of
 * longer words. Each one would otherwise land in the picker indistinguishable
 * from a word the child is meant to learn.
 */
export function isPlausibleWord(word: string): boolean {
  const w = cleanWord(word)
  if (!w) return false
  if (detectLang(w) === 'zh') return w.length <= 8
  if (w.length < 2 || w.length > 28) return false
  // Letters, with an apostrophe or hyphen only between letters, plus an
  // optional possessive apostrophe. Rejects "x/y", "a1b2c3", "12" and "--".
  if (!/^\p{L}+(?:['-]\p{L}+)*'?$/u.test(w)) return false
  // A tone mark is never something OCR invents, so tone-marked pinyin is
  // deliberate text — and short syllables like "mǎ" must survive the rules below.
  if (detectLang(w) === 'py') return true

  const letters = deaccent(w).replace(/[^\p{L}]/gu, '')
  // The remaining rules read Latin script only; they would wrongly reject
  // Greek, Cyrillic, Arabic and the rest, which have their own vowel systems.
  if (!/^[A-Za-z]+$/.test(letters)) return true

  // No English word is written without a vowel, so "RN", "CC" and "df" are noise.
  if (!/[aeiouy]/i.test(letters)) return false
  // A short all-caps run is a logo or a cropped heading, not a spelling word.
  if (letters.length <= 3 && letters === letters.toUpperCase()) return false
  // Two letters is only a word when it genuinely is one.
  if (letters.length === 2 && !TWO_LETTER_WORDS.has(letters.toLowerCase())) return false
  // Three of the same letter in a row is a scan artefact ("IIl", "oooo").
  if (/(\p{L})\1\1/iu.test(letters)) return false
  return true
}

/**
 * How confident we are that a candidate is a real spelling word.
 *
 * `isPlausibleWord` is the hard gate; this is the soft one. Everything that
 * survives is still offered to the parent, but only the confident words are
 * shown up front — a photo of a book cover or a medicine box yields far more
 * fragments than words, and burying the real list under them is what makes the
 * picker unusable.
 */
export function wordQuality(word: string): WordQuality {
  const w = cleanWord(word)
  if (!w) return 'unsure'
  // A single character is the normal unit of a Chinese 听写 list, not a fragment.
  if (detectLang(w) === 'zh') return 'likely'

  const letters = deaccent(w).replace(/[^\p{L}]/gu, '')
  if (!/^[A-Za-z]+$/.test(letters)) return 'likely'
  if (letters.length <= 2) return 'unsure'
  // Packaging and headings are set in capitals far more often than word lists.
  if (letters === letters.toUpperCase()) return 'unsure'
  // Mid-word capitals ("EWn", "gAd") mean the engine lost the letter shapes.
  if (!/^[A-Z]?[a-z]+$/.test(letters)) return 'unsure'
  return 'likely'
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

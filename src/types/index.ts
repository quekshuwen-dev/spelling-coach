/** Shared domain types. Kept free of Firebase imports so they work anywhere. */

export type WordLang = 'en' | 'zh' | 'py'

/**
 * How confident we are that an OCR candidate is a real spelling word.
 * 'unsure' candidates are still offered, but behind a "show more" toggle.
 */
export type WordQuality = 'likely' | 'unsure'

/** What we can tell a child about a Chinese word. Either field may be missing. */
export interface ChineseInfo {
  word: string
  /** Tone-marked, read in context: 止咳 is "zhǐ ké", not "zhǐ hāi". */
  pinyin: string | null
  meaning: string | null
}

export type WordSource = 'image' | 'manual' | 'voice' | 'sample'

export type MasteryStatus = 'new' | 'needs-practice' | 'learning' | 'good' | 'mastered'

/** The fixed set of subject folders a word can be filed into. See config/folders.ts. */
export type FolderId = 'school-english' | 'school-chinese' | 'tuition'

/**
 * "Who is practising." Up to a handful of people can share one device or
 * account, each with their own word list, filed into the same three folders.
 */
export interface Profile {
  id: string
  name: string
  /** A kid-friendly avatar rather than a photo — see profileService's picker. */
  emoji: string
  createdAt: number
}

/**
 * One saved spelling word. Mirrors the Firestore document at
 * users/{userId}/spellingWords/{wordId} exactly — see README "Firestore shape".
 */
export interface SpellingWord {
  id: string
  /** As the user wants to see it, e.g. "Beautiful". */
  word: string
  /** Lower-cased, punctuation-stripped key used for de-duplication. */
  normalizedWord: string
  lang: WordLang
  createdAt: number
  updatedAt: number
  source: WordSource
  /** Set when the word came from a scan, so attempts can be traced to an image. */
  sourceImageId?: string
  status: 'active' | 'archived'
  practiceCount: number
  correctCount: number
  incorrectCount: number
  /** Timestamp of the most recent attempt, used by the practice scheduler. */
  lastPractisedAt?: number
  /** Consecutive correct answers — what "mastered" is really measuring. */
  streak: number
  /** Optional extras a future AI feature can fill in without a migration. */
  notes?: string
  /** Whose list this is. Part of the document id, so two profiles can each save "cat". */
  profileId: string
  /** Which of the three subject folders this word is filed under. */
  folderId: FolderId
}

/** users/{userId}/spellingWords/{wordId}/attempts/{attemptId} */
export interface Attempt {
  id: string
  wordId: string
  word: string
  answer: string
  correct: boolean
  createdAt: number
  /** Milliseconds from hearing the word to pressing Check. */
  elapsedMs?: number
  /** Optional so attempts recorded before profiles existed still load. */
  profileId?: string
}

export interface WordStats {
  accuracy: number
  status: MasteryStatus
  /** 0..1 — higher means the word should come up more often. */
  priority: number
}

export type PracticeMode = 'all' | 'selected' | 'needs-practice' | 'random'

export interface TestQuestion {
  word: SpellingWord
  index: number
  total: number
}

export interface OcrWord {
  id: string
  /** Exactly as OCR read it, before any cleaning. */
  raw: string
  /** Cleaned candidate the user will actually save. Editable. */
  text: string
  lang: WordLang
  selected: boolean
  /** 0..1 when the engine reports one. */
  confidence?: number
  /** 'unsure' candidates are real enough to offer, but are hidden until asked for. */
  quality: WordQuality
}

export interface OcrResult {
  /** Full text, newline-separated, as read from the image. */
  text: string
  words: OcrWord[]
  engine: 'anthropic' | 'openai' | 'google-vision' | 'tesseract'
  /** True when the engine is the offline in-browser fallback. */
  local: boolean
}

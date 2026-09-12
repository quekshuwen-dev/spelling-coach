/**
 * Every threshold that decides "how is this child doing" lives here, and
 * nowhere else. Change a number here and the whole app agrees with itself.
 */
import type { MasteryStatus, SpellingWord, WordStats } from '../types'

export const scoringConfig = {
  /** Accuracy bands, as fractions. A word below `learning` needs practice. */
  accuracy: {
    learning: 0.7, // >= this is "Learning"
    good: 0.9, // >= this is "Good"
    mastered: 1.0, // == this (with enough attempts) is "Mastered"
  },
  /** A word is only "Mastered" once it has been answered right this many times running. */
  masteryStreak: 3,
  /** Below this many attempts a word is still "new" rather than judged. */
  minAttemptsToJudge: 1,

  /** Weights for the practice scheduler (see priorityFor). They need not sum to 1. */
  priority: {
    neverPractised: 0.9,
    recentlyAdded: 0.6,
    /** How much a low accuracy pushes a word up the queue. */
    inaccuracyWeight: 1.0,
    /** How much "we have not seen this in a while" pushes a word up. */
    stalenessWeight: 0.35,
    /** Days after which a word counts as fully stale. */
    stalenessDays: 7,
    /** Mastered words still appear occasionally so they are not forgotten. */
    masteredFloor: 0.08,
  },

  /** Default number of words in a practice session when the user does not choose. */
  defaultSessionSize: 10,
} as const

export const STATUS_LABEL: Record<MasteryStatus, string> = {
  new: 'Not tried yet',
  'needs-practice': 'Needs practice',
  learning: 'Learning',
  good: 'Good',
  mastered: 'Mastered',
}

export const STATUS_EMOJI: Record<MasteryStatus, string> = {
  new: '🌱',
  'needs-practice': '💪',
  learning: '📘',
  good: '👍',
  mastered: '🏆',
}

export function accuracyOf(word: Pick<SpellingWord, 'practiceCount' | 'correctCount'>): number {
  if (word.practiceCount <= 0) return 0
  return word.correctCount / word.practiceCount
}

export function statusOf(word: SpellingWord): MasteryStatus {
  const { accuracy, masteryStreak, minAttemptsToJudge } = scoringConfig
  if (word.practiceCount < minAttemptsToJudge) return 'new'
  const acc = accuracyOf(word)
  if (acc >= accuracy.mastered && word.streak >= masteryStreak) return 'mastered'
  if (acc >= accuracy.good) return 'good'
  if (acc >= accuracy.learning) return 'learning'
  return 'needs-practice'
}

/**
 * How badly does this word want to be asked next? 0..1.
 *
 * Deliberately simple and explainable: frequently-wrong words rise, mastered
 * words sink but never vanish, and a word we have not seen for a week drifts
 * back up. This is the hook a smarter (AI) scheduler would later replace.
 */
export function priorityFor(word: SpellingWord, now = Date.now()): number {
  const p = scoringConfig.priority
  if (word.practiceCount === 0) {
    const isNew = now - word.createdAt < 3 * 86400000
    return clamp01(isNew ? p.neverPractised : Math.max(p.neverPractised, p.recentlyAdded))
  }

  const inaccuracy = 1 - accuracyOf(word)
  const days = (now - (word.lastPractisedAt ?? word.createdAt)) / 86400000
  const staleness = clamp01(days / p.stalenessDays)

  const score = inaccuracy * p.inaccuracyWeight + staleness * p.stalenessWeight
  if (statusOf(word) === 'mastered') {
    // A mastered word sits low but never at zero, so spaced revision still
    // brings it back round — that is the difference between "spaced practice"
    // and "only ever drill the hard words".
    return clamp01(p.masteredFloor + staleness * 0.2)
  }
  return clamp01(score)
}

export function statsFor(word: SpellingWord, now = Date.now()): WordStats {
  return { accuracy: accuracyOf(word), status: statusOf(word), priority: priorityFor(word, now) }
}

export function needsPractice(word: SpellingWord): boolean {
  const s = statusOf(word)
  return s === 'needs-practice' || s === 'new'
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

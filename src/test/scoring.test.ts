import { describe, expect, it } from 'vitest'
import { accuracyOf, needsPractice, priorityFor, scoringConfig, statusOf } from '../config/scoring'
import type { SpellingWord } from '../types'

const base: SpellingWord = {
  id: 'w',
  word: 'beautiful',
  normalizedWord: 'beautiful',
  lang: 'en',
  createdAt: 0,
  updatedAt: 0,
  source: 'manual',
  status: 'active',
  practiceCount: 0,
  correctCount: 0,
  incorrectCount: 0,
  streak: 0,
}

const word = (patch: Partial<SpellingWord>): SpellingWord => ({ ...base, ...patch })

describe('statusOf', () => {
  it('uses the configured accuracy bands', () => {
    expect(statusOf(word({}))).toBe('new')
    expect(statusOf(word({ practiceCount: 10, correctCount: 5 }))).toBe('needs-practice') // 50%
    expect(statusOf(word({ practiceCount: 10, correctCount: 8 }))).toBe('learning') // 80%
    expect(statusOf(word({ practiceCount: 10, correctCount: 9 }))).toBe('good') // 90%
  })

  it('requires a streak as well as perfect accuracy for mastery', () => {
    expect(statusOf(word({ practiceCount: 5, correctCount: 5, streak: 1 }))).toBe('good')
    expect(
      statusOf(word({ practiceCount: 5, correctCount: 5, streak: scoringConfig.masteryStreak })),
    ).toBe('mastered')
  })

  it('follows the thresholds when they are changed', () => {
    // The point of scoring.ts is that the bands are data, not scattered ifs.
    expect(accuracyOf(word({ practiceCount: 4, correctCount: 3 }))).toBe(0.75)
    expect(scoringConfig.accuracy.learning).toBe(0.7)
  })
})

describe('priorityFor', () => {
  const now = 10 * 86400000

  it('puts never-practised words near the top', () => {
    expect(priorityFor(word({ createdAt: now }), now)).toBeGreaterThan(0.8)
  })

  it('ranks a frequently-wrong word above a frequently-right one', () => {
    const wrong = word({ practiceCount: 10, correctCount: 2, lastPractisedAt: now })
    const right = word({ practiceCount: 10, correctCount: 10, streak: 10, lastPractisedAt: now })
    expect(priorityFor(wrong, now)).toBeGreaterThan(priorityFor(right, now))
  })

  it('never drops a mastered word to zero, so it is revisited', () => {
    const mastered = word({ practiceCount: 10, correctCount: 10, streak: 10, lastPractisedAt: now })
    expect(priorityFor(mastered, now)).toBeGreaterThan(0)
  })

  it('raises a word that has not been seen for a while', () => {
    const fresh = word({ practiceCount: 4, correctCount: 3, lastPractisedAt: now })
    const stale = word({ practiceCount: 4, correctCount: 3, lastPractisedAt: now - 9 * 86400000 })
    expect(priorityFor(stale, now)).toBeGreaterThan(priorityFor(fresh, now))
  })
})

describe('needsPractice', () => {
  it('covers both untried and weak words', () => {
    expect(needsPractice(word({}))).toBe(true)
    expect(needsPractice(word({ practiceCount: 4, correctCount: 1 }))).toBe(true)
    expect(needsPractice(word({ practiceCount: 4, correctCount: 4, streak: 4 }))).toBe(false)
  })
})

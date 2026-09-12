/**
 * Which words does this session ask, and in what order?
 *
 * Deliberately a pure function of the word list: no storage, no randomness
 * beyond an injectable RNG, so the behaviour is unit-testable and the "smart
 * practice" rules stay inspectable rather than mysterious.
 */
import { priorityFor, needsPractice, scoringConfig } from '../config/scoring'
import type { PracticeMode, SpellingWord } from '../types'

export interface BuildSessionOptions {
  mode: PracticeMode
  /** Required when mode is 'selected'. */
  selectedIds?: string[]
  size?: number
  rng?: () => number
  now?: number
}

/**
 * Weighted random selection without replacement.
 *
 * A word's weight is its priority (see scoring.ts) plus a floor, so a mastered
 * word still surfaces occasionally instead of disappearing forever — which is
 * what makes this "spaced practice" rather than "only the hard words".
 */
export function weightedSample(
  words: SpellingWord[],
  size: number,
  rng: () => number = Math.random,
  now = Date.now(),
): SpellingWord[] {
  const pool = words.map((word) => ({ word, weight: priorityFor(word, now) + 0.05 }))
  const picked: SpellingWord[] = []

  while (picked.length < size && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0)
    let target = rng() * total
    let index = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      target -= pool[i].weight
      if (target <= 0) {
        index = i
        break
      }
    }
    picked.push(pool[index].word)
    pool.splice(index, 1)
  }

  return picked
}

export function buildSession(words: SpellingWord[], options: BuildSessionOptions): SpellingWord[] {
  const { mode, selectedIds = [], rng = Math.random, now = Date.now() } = options
  const size = options.size ?? scoringConfig.defaultSessionSize
  const active = words.filter((w) => w.status === 'active')

  switch (mode) {
    case 'selected': {
      const wanted = new Set(selectedIds)
      // Preserve the order the user ticked them in where possible.
      const chosen = active.filter((w) => wanted.has(w.id))
      return weightedSample(chosen, chosen.length, rng, now)
    }
    case 'needs-practice': {
      const hard = active.filter(needsPractice)
      // If nothing needs practice, fall back to the weakest words rather than
      // showing the child an empty test.
      const pool = hard.length
        ? hard
        : [...active].sort((a, b) => priorityFor(b, now) - priorityFor(a, now)).slice(0, size)
      return weightedSample(pool, Math.min(size, pool.length), rng, now)
    }
    case 'random':
      return weightedSample(active, Math.min(size, active.length), rng, now)
    case 'all':
    default:
      return weightedSample(active, active.length, rng, now)
  }
}

export function describeMode(mode: PracticeMode): string {
  switch (mode) {
    case 'all':
      return 'Every word on my list'
    case 'selected':
      return 'Only the words I ticked'
    case 'needs-practice':
      return 'The tricky ones'
    case 'random':
      return 'A quick mixed round'
  }
}

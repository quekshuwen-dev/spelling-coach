/**
 * A regression fixture taken from a real failed scan.
 *
 * A parent photographed a cough-medicine box and the picker filled with 24
 * candidates, most of them fragments of logo and packaging text, with no way to
 * tell which were words. These are those exact candidates.
 */
import { describe, expect, it } from 'vitest'
import { isPlausibleWord, wordQuality } from '../lib/words'

const SCANNED = [
  'Un', 'ig', 'er', 'he', 'RN', 'CC', '治', '咳', '川', '贝', '枇杷', '滴',
  '丸', 'df', 'TR', 'EWN', 'Chuan', 'Bei', 'Pi', 'Pa', 'Cough', 'Reliever', 'RE', 'gad',
]

describe('the medicine-box scan', () => {
  const kept = SCANNED.filter(isPlausibleWord)
  const upFront = kept.filter((w) => wordQuality(w) === 'likely')

  it('throws away the packaging fragments', () => {
    for (const noise of ['Un', 'ig', 'er', 'RN', 'CC', 'df', 'TR', 'EWN', 'RE']) {
      expect(kept, noise).not.toContain(noise)
    }
  })

  it('keeps the real words and the Chinese characters', () => {
    for (const word of ['Cough', 'Reliever', '咳', '枇杷']) {
      expect(upFront, word).toContain(word)
    }
  })

  it('leaves the parent a short list instead of a wall of chips', () => {
    expect(upFront.length).toBeLessThan(SCANNED.length / 1.5)
  })
})

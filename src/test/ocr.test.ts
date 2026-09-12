import { describe, expect, it } from 'vitest'
import { toResult } from '../services/ocrService'
import { extractJson, validateOcrResponse, InvalidOcrResponseError } from '../services/ocrSchema'

describe('toResult', () => {
  it('turns a sentence into selectable, unselected words', () => {
    const result = toResult(
      { text: 'Beautiful butterflies fly around the garden.', words: [] },
      'tesseract',
      true,
    )
    expect(result.words.map((w) => w.text)).toEqual([
      'Beautiful',
      'butterflies',
      'fly',
      'around',
      'the',
      'garden',
    ])
    // Nothing is pre-ticked: choosing is the whole point of the review step.
    expect(result.words.every((w) => !w.selected)).toBe(true)
  })

  it('prefers the model word list over splitting the text', () => {
    const result = toResult(
      { text: 'ignore this line entirely', words: ['beautiful', 'garden'] },
      'anthropic',
      false,
    )
    expect(result.words.map((w) => w.text)).toEqual(['beautiful', 'garden'])
  })

  it('de-duplicates case-insensitively and drops noise', () => {
    const result = toResult({ text: '', words: ['Cat', 'cat', 'CAT,', '7', 'a', 'dog'] }, 'tesseract', true)
    expect(result.words.map((w) => w.text)).toEqual(['Cat', 'dog'])
  })

  it('cleans punctuation before saving', () => {
    const result = toResult({ text: '', words: ['1. Beautiful,', 'butterfly.'] }, 'tesseract', true)
    expect(result.words.map((w) => w.text)).toEqual(['Beautiful', 'butterfly'])
  })
})

describe('extractJson', () => {
  it('reads plain JSON', () => {
    expect(extractJson('{"text":"a","words":["a"]}')).toEqual({ text: 'a', words: ['a'] })
  })

  it('digs JSON out of a fenced block', () => {
    expect(extractJson('Sure!\n```json\n{"text":"a","words":[]}\n```')).toEqual({ text: 'a', words: [] })
  })

  it('throws rather than guessing when there is no JSON', () => {
    expect(() => extractJson('I cannot read this image.')).toThrow(InvalidOcrResponseError)
  })
})

describe('validateOcrResponse', () => {
  it('keeps only string words', () => {
    const payload = validateOcrResponse({ text: 'a b', words: ['a', 2, null, 'b'] })
    expect(payload.words).toEqual(['a', 'b'])
  })

  it('accepts an honest "could not read it"', () => {
    expect(validateOcrResponse({ text: '', words: [], notRecognised: true }).notRecognised).toBe(true)
  })

  it('rejects an empty response that does not admit failure', () => {
    expect(() => validateOcrResponse({ text: '', words: [] })).toThrow(InvalidOcrResponseError)
  })
})

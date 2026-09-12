import { describe, expect, it } from 'vitest'
import {
  answerMatches,
  cleanWord,
  detectLang,
  diffAnswer,
  isPlausibleWord,
  wordQuality,
  normalizeWord,
  splitIntoWords,
} from '../lib/words'

describe('cleanWord', () => {
  it('strips the punctuation OCR glues onto words', () => {
    expect(cleanWord('Beautiful,')).toBe('Beautiful')
    expect(cleanWord('butterfly.')).toBe('butterfly')
    expect(cleanWord('"garden"')).toBe('garden')
    expect(cleanWord('  fly!  ')).toBe('fly')
  })

  it('keeps punctuation that belongs to the word', () => {
    expect(cleanWord("don't")).toBe("don't")
    expect(cleanWord('well-known')).toBe('well-known')
    expect(cleanWord("James'")).toBe("James'")
  })

  it('normalises curly apostrophes so they de-duplicate', () => {
    expect(cleanWord('don’t')).toBe("don't")
    expect(normalizeWord('Don’t')).toBe(normalizeWord("don't"))
  })

  it('drops list markers', () => {
    expect(cleanWord('1. beautiful')).toBe('beautiful')
    expect(cleanWord('12) garden')).toBe('garden')
    expect(cleanWord('• fly')).toBe('fly')
  })
})

describe('normalizeWord', () => {
  it('is the de-duplication key', () => {
    expect(normalizeWord('Beautiful')).toBe('beautiful')
    expect(normalizeWord('BEAUTIFUL,')).toBe('beautiful')
    expect(normalizeWord(' beautiful ')).toBe('beautiful')
  })

  it('leaves Chinese untouched', () => {
    expect(normalizeWord('水')).toBe('水')
  })
})

describe('detectLang', () => {
  it('separates English, Chinese and pinyin', () => {
    expect(detectLang('beautiful')).toBe('en')
    expect(detectLang('水')).toBe('zh')
    expect(detectLang('shuǐ')).toBe('py')
    // Pinyin without tone marks is indistinguishable from English; treating it
    // as English is the safe default because an English voice can say it.
    expect(detectLang('shui')).toBe('en')
  })
})

describe('isPlausibleWord', () => {
  it('accepts real words and rejects OCR noise', () => {
    expect(isPlausibleWord('beautiful')).toBe(true)
    expect(isPlausibleWord('水')).toBe(true)
    expect(isPlausibleWord('a')).toBe(false)
    expect(isPlausibleWord('12')).toBe(false)
    expect(isPlausibleWord('x/y')).toBe(false)
    expect(isPlausibleWord('')).toBe(false)
  })

  // Every string here came off a real scan of a medicine box, where the engine
  // read logo and packaging text as if it were a word list.
  it('rejects the fragments a photo of packaging produces', () => {
    for (const noise of ['RN', 'CC', 'TR', 'df', 'EWN', 'RE', 'Un', 'ig', 'er']) {
      expect(isPlausibleWord(noise), noise).toBe(false)
    }
  })

  it('keeps short words that really are words', () => {
    for (const word of ['he', 'go', 'am', 'is', 'up', 'we']) {
      expect(isPlausibleWord(word), word).toBe(true)
    }
  })

  it('keeps accented and tone-marked words, which have vowels once decomposed', () => {
    expect(isPlausibleWord('café')).toBe(true)
    expect(isPlausibleWord('mǎ')).toBe(true)
  })

  it('rejects a run of the same letter', () => {
    expect(isPlausibleWord('aaa')).toBe(false)
    expect(isPlausibleWord('oooo')).toBe(false)
    // Two in a row is ordinary English and must survive.
    expect(isPlausibleWord('letter')).toBe(true)
  })
})

describe('wordQuality', () => {
  it('trusts ordinary words and single Chinese characters', () => {
    expect(wordQuality('butterfly')).toBe('likely')
    expect(wordQuality('Garden')).toBe('likely')
    expect(wordQuality('川')).toBe('likely')
    expect(wordQuality('枇杷')).toBe('likely')
  })

  it('doubts capitals and mid-word case changes, which come from stylised text', () => {
    expect(wordQuality('COUGH')).toBe('unsure')
    expect(wordQuality('gAd')).toBe('unsure')
    expect(wordQuality('he')).toBe('unsure')
  })
})

describe('splitIntoWords', () => {
  it('splits a sentence into selectable words', () => {
    expect(splitIntoWords('Beautiful butterflies fly around the garden.')).toEqual([
      'Beautiful',
      'butterflies',
      'fly',
      'around',
      'the',
      'garden',
    ])
  })

  it('splits a long Chinese run into characters', () => {
    expect(splitIntoWords('我喜欢学习中文')).toEqual(['我', '喜', '欢', '学', '习', '中', '文'])
  })
})

describe('answerMatches', () => {
  it('ignores case and stray spaces but not spelling', () => {
    expect(answerMatches('Beautiful', 'beautiful')).toBe(true)
    expect(answerMatches('  beautiful ', 'beautiful')).toBe(true)
    expect(answerMatches('beutiful', 'beautiful')).toBe(false)
    expect(answerMatches('', 'beautiful')).toBe(false)
  })
})

describe('diffAnswer', () => {
  it('marks the letters that went wrong', () => {
    const diff = diffAnswer('beutiful', 'beautiful')
    expect(diff.map((d) => d.char).join('')).toBe('beautiful')
    expect(diff[0].ok).toBe(true)
    expect(diff[2].ok).toBe(false) // 'a' was missing
  })
})

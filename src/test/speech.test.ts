/**
 * These tests pin down the two decisions that caused the old app to sound
 * wrong: which voice gets chosen, and what text is actually sent to it.
 */
import { describe, expect, it } from 'vitest'
import { pickVoice, resolveUtterance } from '../services/speechService'

const voice = (name: string, lang: string, extra: Partial<SpeechSynthesisVoice> = {}) =>
  ({ name, lang, localService: true, default: false, voiceURI: name, ...extra }) as SpeechSynthesisVoice

const SG_CHAIN = ['en-SG', 'en-GB', 'en-AU', 'en-IN', 'en-US', 'en']
const ZH_CHAIN = ['zh-CN', 'zh-SG', 'cmn-Hans-CN', 'zh-Hans', 'zh', 'zh-TW', 'zh-HK']

describe('pickVoice', () => {
  it('prefers the requested accent over the system default', () => {
    const voices = [voice('Alex', 'en-US', { default: true }), voice('Daniel', 'en-GB')]
    expect(pickVoice(voices, SG_CHAIN)?.name).toBe('Daniel')
  })

  it('falls back down the accent chain rather than giving up', () => {
    // No en-SG voice exists on almost any device; en-GB is the right next best.
    const voices = [voice('Samantha', 'en-US'), voice('Serena', 'en-GB')]
    expect(pickVoice(voices, SG_CHAIN)?.name).toBe('Serena')
  })

  it('refuses novelty voices even when nothing else matches exactly', () => {
    const voices = [voice('Zarvox', 'en-US'), voice('Bad News', 'en-US'), voice('Samantha', 'en-US')]
    expect(pickVoice(voices, SG_CHAIN)?.name).toBe('Samantha')
  })

  it('never returns an English voice for Chinese text', () => {
    // This is the bug that made Chinese words come out as gibberish: the old
    // code fell through to the default voice when no zh voice was found.
    const voices = [voice('Samantha', 'en-US', { default: true })]
    expect(pickVoice(voices, ZH_CHAIN)).toBeNull()
  })

  it('picks Mandarin over Cantonese for zh-CN', () => {
    const voices = [voice('Sin-ji', 'zh-HK'), voice('Ting-Ting', 'zh-CN')]
    expect(pickVoice(voices, ZH_CHAIN)?.name).toBe('Ting-Ting')
  })

  it('returns null when the device has no voices at all', () => {
    expect(pickVoice([], SG_CHAIN)).toBeNull()
  })
})

describe('resolveUtterance', () => {
  it('speaks English as-is', () => {
    expect(resolveUtterance('beautiful', 'en')).toEqual({ text: 'beautiful', voiceLang: 'en' })
  })

  it('speaks Chinese with a Chinese voice', () => {
    expect(resolveUtterance('水', 'zh')).toEqual({ text: '水', voiceLang: 'zh' })
  })

  it('turns pinyin into the character it spells', () => {
    // The old app fed "shuǐ" straight to a Mandarin engine, which read the
    // Latin letters. Converting to 水 is the only way it sounds like the word.
    expect(resolveUtterance('shuǐ', 'py')).toEqual({ text: '水', voiceLang: 'zh' })
    expect(resolveUtterance('mao', 'py')).toEqual({ text: '猫', voiceLang: 'zh' })
  })

  it('refuses to speak pinyin it cannot resolve, rather than making noise', () => {
    expect(resolveUtterance('zhuāngzhì', 'py')).toBeNull()
  })
})

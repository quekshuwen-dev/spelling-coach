/**
 * Text-to-speech.
 *
 * The Web Speech API is easy to call and hard to call *correctly*. Every
 * workaround below is here because of a specific way the naive version
 * (`new SpeechSynthesisUtterance(w); speak(u)`) sounds wrong on real devices:
 *
 *  1. VOICE LIST RACE — on Chrome the first getVoices() returns []. Code that
 *     picks a voice synchronously gets `undefined`, so Chinese text is read by
 *     whatever the default English voice is: gibberish. We await the list.
 *  2. NOVELTY VOICES — macOS ships "Bad News", "Bells", "Trinoids", "Zarvox"…
 *     If one is the system default, every word is sung or robotic. Denylisted.
 *  3. CANCEL RACE — cancel() immediately followed by speak() drops the new
 *     utterance in Chrome. We cancel, yield, then speak.
 *  4. OVERLAP — the old code spoke the word, then 600 ms later cancel()ed it to
 *     read the definition, chopping the word in half. Everything now goes
 *     through one serial queue.
 *  5. CHROME 15-SECOND CUTOFF — desktop Chrome silently stops long utterances.
 *     A resume() heartbeat keeps them alive.
 *  6. iOS GESTURE LOCK — Safari refuses speech that did not originate in a user
 *     gesture. We unlock on the first tap anywhere.
 *  7. RATE — the old rate of 0.7 is slurred, not slow-and-clear. Default is now
 *     0.9, with an explicit "say it slowly" control at 0.6.
 *  8. ACCENT — a Singapore child was hearing en-US. Accent is now a setting,
 *     defaulting to English (Singapore) with a sensible fallback chain.
 *  9. ROBOTIC VOICES — the fixes above make the device voice as good as it can
 *     be, which still is not good enough: the built-in voices are synthetic
 *     enough that a child mishears the word. Real neural audio is now the
 *     primary engine (see neuralVoice.ts) and everything below is the fallback.
 */
import { detectLang } from '../lib/words'
import { pinyinToHanzi } from '../data/chineseDictionary'
import type { WordLang } from '../types'
import { fetchClip, neuralEnabled, playClip, stopClip, unlockNeuralVoice, voiceFor } from './neuralVoice'

export type Accent = 'en-SG' | 'en-GB' | 'en-US' | 'en-AU'

export const ACCENTS: { value: Accent; label: string; flag: string }[] = [
  { value: 'en-SG', label: 'English (Singapore)', flag: '🇸🇬' },
  { value: 'en-GB', label: 'English (UK)', flag: '🇬🇧' },
  { value: 'en-US', label: 'English (US)', flag: '🇺🇸' },
  { value: 'en-AU', label: 'English (Australia)', flag: '🇦🇺' },
]

export const SPEEDS = [
  { value: 0.6, label: 'Slow' },
  { value: 0.9, label: 'Normal' },
  { value: 1.1, label: 'Fast' },
] as const

/**
 * If a device has no en-SG voice (most do not), fall back in an order that
 * still sounds right to a Singaporean ear: SG -> GB -> AU -> US.
 */
const ACCENT_FALLBACKS: Record<Accent, string[]> = {
  'en-SG': ['en-SG', 'en-GB', 'en-AU', 'en-IN', 'en-US', 'en'],
  'en-GB': ['en-GB', 'en-SG', 'en-AU', 'en-US', 'en'],
  'en-US': ['en-US', 'en-CA', 'en-GB', 'en'],
  'en-AU': ['en-AU', 'en-GB', 'en-SG', 'en-US', 'en'],
}

const ZH_FALLBACKS = ['zh-CN', 'zh-SG', 'cmn-Hans-CN', 'zh-Hans', 'zh', 'zh-TW', 'zh-HK']

/**
 * Voices that are technically valid but sound wrong to a child. macOS and some
 * Android builds will happily make one of these the default.
 */
const NOVELTY_VOICES =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|hysterical|pipe organ|junior|ralph|fred|grandma|grandpa|rocko|shelley|sandy|eddy|reed|flo/i

/** Voices known to be clear and natural; nudged to the front when present. */
const PREFERRED_VOICES =
  /google (uk|us) english|google 普通话|samantha|karen|moira|tessa|serena|daniel|ting-?ting|mei-?jia|sin-?ji|kyoko|microsoft (zira|hazel|george|libby|sonia|aria)/i

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * Resolves once the browser has actually populated its voice list.
 * Chrome fires `voiceschanged` asynchronously; Safari populates synchronously;
 * a few Android builds never fire the event at all, hence the timeout.
 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([])
  if (voicesPromise) return voicesPromise

  voicesPromise = new Promise((resolve) => {
    const synth = window.speechSynthesis
    const immediate = synth.getVoices()
    if (immediate.length) {
      resolve(immediate)
      return
    }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      synth.onvoiceschanged = null
      resolve(synth.getVoices())
    }
    synth.onvoiceschanged = finish
    // Some Android WebViews never fire the event. Do not hang forever.
    setTimeout(finish, 2000)
  })
  return voicesPromise
}

function scoreVoice(voice: SpeechSynthesisVoice, wanted: string[]): number {
  const tag = voice.lang.replace('_', '-')
  const rank = wanted.findIndex((w) => tag.toLowerCase() === w.toLowerCase())
  const looseRank = wanted.findIndex((w) => tag.toLowerCase().startsWith(w.toLowerCase()))
  const langScore = rank >= 0 ? 100 - rank * 10 : looseRank >= 0 ? 60 - looseRank * 5 : -1000
  let score = langScore
  if (NOVELTY_VOICES.test(voice.name)) score -= 500
  if (PREFERRED_VOICES.test(voice.name)) score += 25
  // Local voices start instantly and work offline; network voices are often
  // higher quality. Slight nudge to local so the app stays usable on a bus.
  if (voice.localService) score += 5
  if (voice.default) score += 2
  return score
}

export function pickVoice(voices: SpeechSynthesisVoice[], wanted: string[]): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null
  let bestScore = -Infinity
  for (const voice of voices) {
    const score = scoreVoice(voice, wanted)
    if (score > bestScore) {
      bestScore = score
      best = voice
    }
  }
  // A negative score means nothing matched the requested language at all.
  return bestScore > -500 && best ? best : null
}

export interface SpeakOptions {
  lang?: WordLang
  accent?: Accent
  rate?: number
  /** Say each letter separately, with a beat between them. */
  spellOut?: boolean
  /** Play after anything already queued instead of replacing it. */
  queue?: boolean
}

interface QueueItem {
  text: string
  lang: WordLang
  accent: Accent
  rate: number
  /**
   * Single letters go to the device voice even when the neural service is up.
   * A neural voice applies word-level pronunciation rules, so a lone "a" comes
   * back as the article "uh" rather than the letter name — the opposite of what
   * letter-by-letter spelling needs.
   */
  preferDevice: boolean
  resolve: () => void
}

let queue: QueueItem[] = []
let speaking = false
let keepAlive: ReturnType<typeof setInterval> | null = null
let unlocked = false
/**
 * Bumped by every stop. A neural clip is fetched asynchronously, so without
 * this a word cancelled mid-download would still play, over the next one.
 */
let generation = 0

/** Safari will not speak unless the first utterance came from a user gesture. */
export function unlockSpeech(): void {
  if (unlocked) return
  unlocked = true
  // Both engines need a gesture on iOS: the synth, and the <audio> element the
  // neural clips play through.
  unlockNeuralVoice()
  if (!speechSupported()) return
  try {
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    window.speechSynthesis.speak(u)
  } catch {
    /* nothing to unlock */
  }
  void loadVoices()
}

/** Drop everything queued, resolving the waiters so no caller hangs forever. */
function flushQueue(): void {
  const pending = queue
  queue = []
  pending.forEach((item) => item.resolve())
}

export function stopSpeaking(): void {
  generation++
  flushQueue()
  speaking = false
  stopKeepAlive()
  stopClip()
  if (speechSupported()) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* already stopped */
    }
  }
}

function startKeepAlive() {
  stopKeepAlive()
  // Chrome stops speaking after ~15 s unless nudged. resume() on a
  // non-paused synth is a no-op everywhere else, so this is safe.
  keepAlive = setInterval(() => {
    if (!speechSupported()) return
    const synth = window.speechSynthesis
    if (synth.speaking && !synth.paused) synth.resume()
  }, 5000)
}

function stopKeepAlive() {
  if (keepAlive) {
    clearInterval(keepAlive)
    keepAlive = null
  }
}

/**
 * Resolve what we are actually going to pronounce.
 *
 * Pinyin is the interesting case: "shuǐ" is Latin text, so an English voice
 * spells it out and a Mandarin voice mangles it. Converting it back to 水 is
 * the only way it sounds like the word the child is meant to hear.
 */
export function resolveUtterance(text: string, lang: WordLang): { text: string; voiceLang: 'en' | 'zh' } | null {
  if (lang === 'zh') return { text, voiceLang: 'zh' }
  if (lang === 'py') {
    const hanzi = pinyinToHanzi(text)
    // No character for this syllable: refuse rather than produce nonsense.
    return hanzi ? { text: hanzi, voiceLang: 'zh' } : null
  }
  return { text, voiceLang: 'en' }
}

async function runQueue(): Promise<void> {
  if (speaking) return
  const item = queue.shift()
  if (!item) {
    stopKeepAlive()
    return
  }
  speaking = true
  const mine = generation

  // Real neural audio first; the device voice is the fallback for offline use,
  // for single letters, and for when the service cannot be reached.
  const spoken = item.preferDevice ? false : await speakNeural(item, mine)
  if (!spoken && generation === mine) await speakOnDevice(item)

  speaking = false
  item.resolve()
  if (generation === mine) void runQueue()
}

/** Returns false when the caller should fall back to the device voice. */
async function speakNeural(item: QueueItem, mine: number): Promise<boolean> {
  if (!neuralEnabled()) return false
  const voiceLang = item.lang === 'zh' || item.lang === 'py' ? 'zh' : 'en'
  const blob = await fetchClip(item.text, voiceFor(voiceLang, item.accent))
  if (!blob) return false
  // The word may have been cancelled while its clip was downloading.
  if (generation !== mine) return true
  await playClip(blob, item.rate)
  return true
}

async function speakOnDevice(item: QueueItem): Promise<void> {
  const voices = await loadVoices()
  const wanted = item.lang === 'zh' || item.lang === 'py' ? ZH_FALLBACKS : ACCENT_FALLBACKS[item.accent]
  const voice = pickVoice(voices, wanted)

  await new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(item.text)
    utterance.rate = item.rate
    utterance.pitch = 1
    utterance.volume = 1
    utterance.lang = voice?.lang ?? wanted[0]
    if (voice) utterance.voice = voice

    let done = false
    // Belt and braces: if the engine never fires onend (it happens on some
    // Android builds), do not wedge the queue. Allow generous time for a long
    // definition read at a slow rate.
    const guard = setTimeout(() => finish(), 2000 + item.text.length * 220)
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(guard)
      resolve()
    }
    utterance.onend = finish
    utterance.onerror = finish

    startKeepAlive()
    try {
      window.speechSynthesis.speak(utterance)
    } catch {
      finish()
    }
  })
}

/**
 * Speak some text. Returns a promise that resolves when it has finished, so a
 * caller can chain "say the word, then read the meaning" without cutting the
 * word off.
 */
export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  // Neural clips play through an <audio> element, so a browser with no
  // speechSynthesis at all can still say the word.
  if (!speechSupported() && !neuralEnabled()) return
  const trimmed = text.trim()
  if (!trimmed) return

  const lang = options.lang ?? detectLang(trimmed)
  const accent = options.accent ?? 'en-SG'
  const rate = options.rate ?? 0.9

  const resolved = resolveUtterance(trimmed, lang)
  if (!resolved) return

  if (!options.queue) {
    generation++
    flushQueue()
    stopClip()
    if (speechSupported()) window.speechSynthesis.cancel()
    // Chrome drops an utterance queued in the same tick as cancel().
    await new Promise((r) => setTimeout(r, 120))
    speaking = false
  }

  const spellingOut = Boolean(options.spellOut) && resolved.voiceLang === 'en'
  const items: string[] = spellingOut
    ? // Separate utterances, not "b, u, t" in one string: many engines read
      // the commas aloud, and the pause between utterances is what makes
      // letter-by-letter spelling intelligible.
      [...resolved.text.replace(/[^\p{L}\p{N}'-]/gu, '')]
    : [resolved.text]

  const promises = items.map(
    (chunk) =>
      new Promise<void>((resolve) => {
        queue.push({
          text: chunk,
          lang: resolved.voiceLang === 'zh' ? 'zh' : 'en',
          accent,
          rate: spellingOut ? Math.min(rate, 0.8) : rate,
          preferDevice: spellingOut,
          resolve,
        })
      }),
  )

  void runQueue()
  await Promise.all(promises)
}

/** Does this device have any voice at all for the given language? */
export async function hasVoiceFor(lang: WordLang, accent: Accent = 'en-SG'): Promise<boolean> {
  const voices = await loadVoices()
  const wanted = lang === 'en' ? ACCENT_FALLBACKS[accent] : ZH_FALLBACKS
  return pickVoice(voices, wanted) !== null
}

/** Human-readable name of the voice that will actually be used. For Settings. */
export async function describeVoice(lang: WordLang, accent: Accent = 'en-SG'): Promise<string | null> {
  const voices = await loadVoices()
  const wanted = lang === 'en' ? ACCENT_FALLBACKS[accent] : ZH_FALLBACKS
  const voice = pickVoice(voices, wanted)
  return voice ? `${voice.name} (${voice.lang})` : null
}

if (typeof window !== 'undefined') {
  // A page that navigates away mid-word leaves the synth wedged on some
  // browsers; the next speak() then does nothing at all.
  window.addEventListener('pagehide', stopSpeaking)
  window.addEventListener('beforeunload', stopSpeaking)
}

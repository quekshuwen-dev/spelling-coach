/**
 * Neural voice clips — the primary way this app says a word.
 *
 * The Web Speech API's built-in voices are robotic enough that a child mishears
 * the word they are being asked to spell, which defeats the whole exercise. So,
 * exactly as the reading helper does, the word is fetched as real neural audio
 * (Amazon Polly, via StreamElements' free endpoint) and played as an <audio>
 * clip. The device voice stays as the fallback for offline use and for when the
 * service is unreachable.
 *
 * Two details carry most of the quality difference:
 *
 *  - `preservesPitch`. "Say it slowly" plays at 0.6x, and without this the
 *    pitch drops with the speed and the voice turns into a growl. This is the
 *    single biggest reason slowed-down speech sounds wrong.
 *  - Caching. A child hears the same ten words many times over, so each clip is
 *    fetched once. The service worker also caches the responses, which means a
 *    word heard once can still be heard offline.
 */

const ENDPOINT = 'https://api.streamelements.com/kappa/v2/speech'

/** How long to wait before giving up and letting the device voice take over. */
const FETCH_TIMEOUT_MS = 8000

/** A JSON error page is small; real MP3 audio never is. */
const MIN_CLIP_BYTES = 200

/**
 * Polly voices, picked for being clear to a child rather than for character.
 * There is no Singapore English voice, and British is much closer to the
 * classroom accent than American is.
 */
const VOICES = {
  'en-SG': 'Amy',
  'en-GB': 'Amy',
  'en-US': 'Joanna',
  'en-AU': 'Nicole',
  zh: 'Zhiyu',
} as const

export type NeuralVoice = (typeof VOICES)[keyof typeof VOICES]

export function voiceFor(voiceLang: 'en' | 'zh', accent: string): NeuralVoice {
  if (voiceLang === 'zh') return VOICES.zh
  return VOICES[accent as keyof typeof VOICES] ?? VOICES['en-GB']
}

/* ------------------------------ availability ------------------------------ */

/**
 * Flips to false the first time the service fails, so a child on a flaky
 * connection waits for the timeout once rather than before every single word.
 */
let serviceUp = true
let enabled = true

export function neuralEnabled(): boolean {
  return enabled && serviceUp
}

/** Settings toggle: off keeps every word on the device voice. */
export function setNeuralEnabled(value: boolean): void {
  enabled = value
  // Re-arm the circuit breaker, so turning it back on retries the service.
  if (value) serviceUp = true
}

/* -------------------------------- fetching -------------------------------- */

const clips = new Map<string, Blob>()
/** In-flight requests, so tapping "say it again" twice fetches once. */
const pending = new Map<string, Promise<Blob>>()

function cacheKey(text: string, voice: string): string {
  return `${voice}:${text}`
}

async function requestClip(text: string, voice: string): Promise<Blob> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const url = `${ENDPOINT}?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`tts ${response.status}`)
    const blob = await response.blob()
    if (blob.size < MIN_CLIP_BYTES) throw new Error('empty audio')
    return blob
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The clip for this text, or null if the service could not provide one — in
 * which case the caller should fall back to the device voice.
 */
export async function fetchClip(text: string, voice: string): Promise<Blob | null> {
  if (!neuralEnabled()) return null
  const key = cacheKey(text, voice)

  const cached = clips.get(key)
  if (cached) return cached

  const inFlight = pending.get(key)
  if (inFlight) {
    try {
      return await inFlight
    } catch {
      return null
    }
  }

  const request = requestClip(text, voice)
  pending.set(key, request)
  try {
    const blob = await request
    clips.set(key, blob)
    return blob
  } catch {
    // One failure means the service is unreachable for this session. Every
    // later word goes straight to the device voice instead of stalling first.
    serviceUp = false
    return null
  } finally {
    pending.delete(key)
  }
}

/* -------------------------------- playback -------------------------------- */

/**
 * One shared element, because iOS only treats audio as unlocked on the element
 * that a user gesture first played.
 */
let player: HTMLAudioElement | null = null
let playingUrl: string | null = null

function getPlayer(): HTMLAudioElement {
  if (!player) {
    player = new Audio()
    player.preload = 'auto'
  }
  return player
}

/** Keep the voice at its normal pitch when the speed changes. */
function preservePitch(el: HTMLAudioElement): void {
  type PitchKeys = 'preservesPitch' | 'mozPreservesPitch' | 'webkitPreservesPitch'
  const withPitch = el as HTMLAudioElement & Partial<Record<PitchKeys, boolean>>
  // Modern browsers default this to true, but older Safari needs it set, and
  // it is the difference between "slower" and "a growling monster".
  withPitch.preservesPitch = true
  withPitch.mozPreservesPitch = true
  withPitch.webkitPreservesPitch = true
}

function releaseUrl(): void {
  if (playingUrl) {
    URL.revokeObjectURL(playingUrl)
    playingUrl = null
  }
}

/** Silence, so the first gesture can unlock playback before any word is due. */
const SILENCE =
  'data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tAFRZRVIAAAAGAAADMjAwOAD/4xjEAAAAA0gAAAAATEFNRTMuOTguMlVVVVVVVVVVVUxBTUUzLjk4LjJVVVVVVVVVVVVVVVVVVVVVVQ=='

/** Safari refuses to play audio that no user gesture ever started. */
export function unlockNeuralVoice(): void {
  try {
    const el = getPlayer()
    el.src = SILENCE
    el.volume = 0
    // Promise.resolve, because older browsers return undefined from play().
    void Promise.resolve(el.play())
      .then(() => {
        el.pause()
        el.volume = 1
      })
      .catch(() => {
        el.volume = 1
      })
  } catch {
    /* playback stays locked; the device voice still works */
  }
}

export function stopClip(): void {
  if (!player) return
  try {
    player.pause()
    player.currentTime = 0
  } catch {
    /* already stopped */
  }
  releaseUrl()
}

/**
 * Play a clip through, resolving when it finishes. Resolves rather than
 * rejecting on a playback error: a caller that is mid-test should carry on to
 * the next word rather than break.
 */
export function playClip(blob: Blob, rate: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const el = getPlayer()
    try {
      el.pause()
    } catch {
      /* nothing playing */
    }
    releaseUrl()

    playingUrl = URL.createObjectURL(blob)
    el.src = playingUrl
    el.volume = 1
    preservePitch(el)
    // Set after src: some browsers reset playbackRate when the source changes.
    el.playbackRate = rate

    let done = false
    const finish = () => {
      if (done) return
      done = true
      el.onended = null
      el.onerror = null
      resolve()
    }
    el.onended = finish
    el.onerror = finish

    void Promise.resolve(el.play()).catch(finish)
  })
}

/** Testing seam — resets the module between cases. */
export function resetNeuralVoice(): void {
  clips.clear()
  pending.clear()
  serviceUp = true
  enabled = true
  stopClip()
}

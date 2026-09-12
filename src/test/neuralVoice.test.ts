/**
 * The neural voice is the primary engine, so what matters most is that it never
 * becomes a way for the app to go silent: every failure has to hand back to the
 * device voice rather than throw.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchClip, neuralEnabled, resetNeuralVoice, setNeuralEnabled, voiceFor } from '../services/neuralVoice'

const mp3 = (bytes = 4096) => new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' })

beforeEach(() => {
  resetNeuralVoice()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('voiceFor', () => {
  it('uses a British voice for Singapore, which has no voice of its own', () => {
    expect(voiceFor('en', 'en-SG')).toBe('Amy')
    expect(voiceFor('en', 'en-GB')).toBe('Amy')
  })

  it('matches the requested accent', () => {
    expect(voiceFor('en', 'en-US')).toBe('Joanna')
    expect(voiceFor('en', 'en-AU')).toBe('Nicole')
  })

  it('always uses the Mandarin voice for Chinese, whatever the accent setting', () => {
    expect(voiceFor('zh', 'en-US')).toBe('Zhiyu')
  })

  it('falls back to a real voice for an unknown accent', () => {
    expect(voiceFor('en', 'en-ZZ')).toBe('Amy')
  })
})

describe('fetchClip', () => {
  it('returns the clip and asks the service only once per word', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(mp3(), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchClip('butterfly', 'Amy')).toBeInstanceOf(Blob)
    expect(await fetchClip('butterfly', 'Amy')).toBeInstanceOf(Blob)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('caches per voice, so switching accent does not replay the old one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(mp3(), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchClip('butterfly', 'Amy')
    await fetchClip('butterfly', 'Joanna')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('de-duplicates requests made while one is still in flight', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(mp3(), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([fetchClip('garden', 'Amy'), fetchClip('garden', 'Amy'), fetchClip('garden', 'Amy')])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives back null rather than throwing when the service errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })))
    await expect(fetchClip('butterfly', 'Amy')).resolves.toBeNull()
  })

  it('gives back null when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchClip('butterfly', 'Amy')).resolves.toBeNull()
  })

  it('treats a tiny response as a failure, since an error page is not audio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(mp3(10), { status: 200 })))
    await expect(fetchClip('butterfly', 'Amy')).resolves.toBeNull()
  })

  it('stops asking after the first failure, so no word waits on a dead service', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    await fetchClip('one', 'Amy')
    await fetchClip('two', 'Amy')
    await fetchClip('three', 'Amy')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(neuralEnabled()).toBe(false)
  })
})

describe('the natural-voice setting', () => {
  it('sends nothing to the service when it is off', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    setNeuralEnabled(false)
    expect(await fetchClip('butterfly', 'Amy')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retries a service that had failed when switched back on', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await fetchClip('butterfly', 'Amy')
    expect(neuralEnabled()).toBe(false)

    setNeuralEnabled(true)
    expect(neuralEnabled()).toBe(true)
  })
})

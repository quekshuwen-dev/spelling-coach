/**
 * 笔画 — stroke order practice for one Chinese character.
 *
 * Two modes, because watching and doing teach different things:
 *  - "Show me" animates the strokes in the correct order.
 *  - "My turn" hides the character and the child traces it with a finger.
 *    Hanzi Writer checks each stroke, so a stroke drawn in the wrong order or
 *    the wrong direction is rejected — which is the whole point of 笔画.
 *
 * Hanzi Writer and its per-character stroke data are both loaded on demand.
 * The full stroke-data package is 31 MB, so characters are fetched one at a
 * time from the CDN and cached by the service worker; a character practised
 * once still works offline.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
// Type-only: erased at compile time, so the library itself stays lazy.
import type { CharacterJson, default as HanziWriterClass } from 'hanzi-writer'

type Mode = 'idle' | 'watching' | 'quizzing'
type Status = 'loading' | 'ready' | 'unavailable'

interface Props {
  char: string
  size?: number
}

export default function StrokeOrder({ char, size = 200 }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const writer = useRef<HanziWriterClass | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [mode, setMode] = useState<Mode>('idle')
  const [score, setScore] = useState<{ mistakes: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    const node = host.current
    if (!node) return

    setStatus('loading')
    setMode('idle')
    setScore(null)
    node.innerHTML = ''

    void (async () => {
      let HanziWriter: typeof import('hanzi-writer').default
      try {
        HanziWriter = (await import('hanzi-writer')).default
      } catch {
        if (!cancelled) setStatus('unavailable')
        return
      }
      if (cancelled || !host.current) return

      try {
        writer.current = HanziWriter.create(host.current, char, {
          width: size,
          height: size,
          padding: 8,
          showOutline: true,
          showCharacter: true,
          strokeAnimationSpeed: 1,
          delayBetweenStrokes: 280,
          strokeColor: '#2D1F0E',
          outlineColor: '#FFE0B2',
          radicalColor: '#FF5722',
          drawingColor: '#FF5722',
          drawingWidth: 28,
          // A child's finger is not precise; the default is unforgivingly tight.
          leniency: 1.4,
          charDataLoader: (character: string, onComplete: (data: CharacterJson) => void) => {
            void fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${character}.json`)
              .then((r) => {
                if (!r.ok) throw new Error(String(r.status))
                return r.json() as Promise<CharacterJson>
              })
              .then(onComplete)
              .catch(() => {
                if (!cancelled) setStatus('unavailable')
              })
          },
        })
        if (!cancelled) setStatus('ready')
      } catch {
        if (!cancelled) setStatus('unavailable')
      }
    })()

    return () => {
      cancelled = true
      try {
        writer.current?.cancelQuiz()
      } catch {
        /* nothing running */
      }
      writer.current = null
      if (node) node.innerHTML = ''
    }
  }, [char, size])

  const watch = useCallback(() => {
    if (!writer.current) return
    setScore(null)
    setMode('watching')
    writer.current.cancelQuiz()
    writer.current.showCharacter()
    writer.current.animateCharacter({ onComplete: () => setMode('idle') })
  }, [])

  const practise = useCallback(() => {
    if (!writer.current) return
    setScore(null)
    setMode('quizzing')
    writer.current.hideCharacter()
    writer.current.quiz({
      onComplete: ({ totalMistakes }) => {
        setScore({ mistakes: totalMistakes })
        setMode('idle')
        writer.current?.showCharacter()
      },
    })
  }, [])

  if (status === 'unavailable') {
    return (
      <div className="rounded-2xl bg-grape-50 p-4 text-center text-sm text-ink-soft">
        No stroke guide for <span className="text-lg font-bold text-ink">{char}</span> yet.
        {' '}It needs the internet once to download.
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative rounded-2xl border-[2.5px] border-grape-100 bg-white"
        style={{ width: size, height: size }}
      >
        {/* Guide lines, as on 田字格 practice paper. */}
        <svg className="pointer-events-none absolute inset-0" width={size} height={size} aria-hidden>
          <line x1={size / 2} y1="0" x2={size / 2} y2={size} stroke="#FFE0B2" strokeWidth="1" strokeDasharray="5 5" />
          <line x1="0" y1={size / 2} x2={size} y2={size / 2} stroke="#FFE0B2" strokeWidth="1" strokeDasharray="5 5" />
        </svg>
        <div ref={host} className="relative" />
        {status === 'loading' && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-soft">Loading…</p>
        )}
      </div>

      {mode === 'quizzing' && <p className="text-sm font-bold text-grape">✍️ Trace it with your finger</p>}
      {score && (
        <p className="text-sm font-bold text-leaf-600">
          {score.mistakes === 0 ? '🌟 Perfect! Every stroke in order.' : `Done — ${score.mistakes} to fix next time.`}
        </p>
      )}

      <div className="grid w-full grid-cols-2 gap-2">
        <button className="btn-ghost" onClick={watch} disabled={status !== 'ready'}>
          👀 Show me
        </button>
        <button className="btn-primary" onClick={practise} disabled={status !== 'ready'}>
          ✍️ My turn
        </button>
      </div>
    </div>
  )
}

/**
 * HEAR WORD -> TYPE ANSWER -> CHECK -> RESULT -> SAVE ATTEMPT -> NEXT WORD.
 *
 * The anti-cheating rule (spec §7) is enforced structurally, not by styling:
 * while `phase === 'answering'` the target word is never rendered into the DOM
 * at all — not blurred, not hidden, not in a title attribute — so it cannot be
 * revealed by Inspect Element, by selecting the page, or by a screen reader.
 * `autoComplete`/`autoCorrect`/`spellCheck` are off for the same reason: an
 * autocorrecting keyboard would otherwise spell the word for the child.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, Celebration, EmptyState, Notice, PageHeader, ProgressBar } from '../components/ui'
import { useApp } from '../context/AppContext'
import { scoringConfig } from '../config/scoring'
import { answerMatches, diffAnswer } from '../lib/words'
import { buildSession, describeMode } from '../services/practiceSelection'
import { hasVoiceFor, speak, stopSpeaking } from '../services/speechService'
import type { PracticeMode, SpellingWord } from '../types'

type Phase = 'choose' | 'answering' | 'feedback' | 'summary'

interface NavState {
  mode?: PracticeMode
  selectedIds?: string[]
}

export default function TestScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const navState = (location.state ?? {}) as NavState
  const { words, recordAttempt, settings, showToast, clearToast } = useApp()

  const [phase, setPhase] = useState<Phase>('choose')
  const [queue, setQueue] = useState<SpellingWord[]>([])
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [lastCorrect, setLastCorrect] = useState(false)
  const [results, setResults] = useState<{ word: SpellingWord; answer: string; correct: boolean }[]>([])
  const [noVoice, setNoVoice] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const askedAt = useRef<number>(0)

  const current = queue[index]

  const sayWord = useCallback(
    (options: { spellOut?: boolean; slow?: boolean } = {}) => {
      if (!current) return
      stopSpeaking()
      void speak(current.word, {
        lang: current.lang,
        accent: settings.accent,
        rate: options.slow ? 0.6 : settings.rate,
        spellOut: options.spellOut,
      })
    },
    [current, settings.accent, settings.rate],
  )

  const start = useCallback(
    (mode: PracticeMode, selectedIds: string[] = []) => {
      const session = buildSession(words, { mode, selectedIds, size: scoringConfig.defaultSessionSize })
      if (!session.length) {
        showToast('There are no words to practise yet.')
        return
      }
      setQueue(session)
      setIndex(0)
      setResults([])
      setAnswer('')
      setRevealed(false)
      setPhase('answering')
    },
    [words, showToast],
  )

  // Coming from My Words with a mode already chosen: start straight away.
  useEffect(() => {
    if (navState.mode && phase === 'choose' && words.length) {
      start(navState.mode, navState.selectedIds ?? [])
      // Clear the state so a back-navigation does not restart the same test.
      navigate('.', { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState.mode, words.length])

  // Say the word as soon as it comes up, and focus the box so the child can type.
  useEffect(() => {
    if (phase !== 'answering' || !current) return
    // A toast left over from another screen ("✅ \"garden\" added") would show the
    // child the answer. Nothing but the question may be on screen while answering.
    clearToast()
    askedAt.current = Date.now()
    sayWord()
    inputRef.current?.focus()
  }, [phase, current, sayWord, clearToast])

  // If the device has no voice at all for this language, say so rather than
  // leaving the child waiting in silence for a word that will never come.
  useEffect(() => {
    if (!current) return
    void hasVoiceFor(current.lang, settings.accent).then((available) => setNoVoice(!available))
  }, [current, settings.accent])

  useEffect(() => () => stopSpeaking(), [])

  const check = async () => {
    if (!current || !answer.trim()) return
    const correct = answerMatches(answer, current.word)
    setLastCorrect(correct)
    setResults((r) => [...r, { word: current, answer, correct }])
    setPhase('feedback')
    stopSpeaking()
    try {
      await recordAttempt(current, answer.trim(), correct, Date.now() - askedAt.current)
    } catch (error) {
      // A failed write must not cost the child their answer — keep going and
      // tell the parent, rather than throwing away the round.
      showToast(`Saved locally only: ${(error as Error).message}`)
    }
  }

  const next = () => {
    if (index + 1 >= queue.length) {
      setPhase('summary')
      return
    }
    setIndex((i) => i + 1)
    setAnswer('')
    setRevealed(false)
    setPhase('answering')
  }

  const correctCount = results.filter((r) => r.correct).length

  /* -------------------------------- render -------------------------------- */

  if (words.length === 0) {
    return (
      <main className="page">
        <PageHeader emoji="🎧" title="Spelling Test" />
        <Card>
          <EmptyState
            emoji="🌱"
            title="No words to practise yet"
            body="Scan a spelling list first, then come back for a test."
            action={
              <button className="btn-primary" onClick={() => navigate('/scan')}>
                📷 Scan a list
              </button>
            }
          />
        </Card>
      </main>
    )
  }

  if (phase === 'choose') {
    const modes: PracticeMode[] = ['all', 'needs-practice', 'random']
    return (
      <main className="page">
        <PageHeader emoji="🎧" title="Spelling Test" subtitle="Listen to the word, then type it. Ready?" />
        <Card className="space-y-2">
          {modes.map((mode) => (
            <button key={mode} className="btn-ghost w-full justify-start text-left" onClick={() => start(mode)}>
              {mode === 'all' ? '📚' : mode === 'needs-practice' ? '💪' : '🎲'} {describeMode(mode)}
            </button>
          ))}
        </Card>
        <p className="mt-4 text-center text-xs text-ink-soft">
          To test only certain words, tick them on the My Words page first.
        </p>
      </main>
    )
  }

  if (phase === 'summary') {
    const pct = results.length ? Math.round((correctCount / results.length) * 100) : 0
    return (
      <main className="page">
        <Celebration show={pct >= 70} />
        <PageHeader
          emoji={pct === 100 ? '🏆' : pct >= 70 ? '🌟' : '💪'}
          title={pct === 100 ? 'Perfect!' : pct >= 70 ? 'Well done!' : 'Good try!'}
          subtitle={`${correctCount} out of ${results.length} correct`}
        />
        <Card className="mb-3">
          <ProgressBar value={results.length ? correctCount / results.length : 0} label="Score" />
        </Card>
        <Card className="divide-y divide-grape-50 py-1">
          {results.map((result, i) => (
            <div key={`${result.word.id}-${i}`} className="flex items-center gap-3 py-3">
              <span className="text-xl" aria-hidden>
                {result.correct ? '✅' : '📝'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{result.word.word}</div>
                {!result.correct && (
                  <div className="text-xs text-ink-soft">
                    You wrote: <span className="text-berry">{result.answer}</span>
                  </div>
                )}
              </div>
              <button
                className="btn-quiet"
                onClick={() =>
                  void speak(result.word.word, {
                    lang: result.word.lang,
                    accent: settings.accent,
                    rate: settings.rate,
                  })
                }
                aria-label={`Hear "${result.word.word}"`}
              >
                🔊
              </button>
            </div>
          ))}
        </Card>
        <div className="mt-4 space-y-2">
          <button
            className="btn-primary w-full"
            onClick={() => {
              const wrong = results.filter((r) => !r.correct).map((r) => r.word.id)
              if (wrong.length) start('selected', wrong)
              else setPhase('choose')
            }}
          >
            {results.some((r) => !r.correct) ? '🔁 Practise the ones I missed' : '🔁 Another round'}
          </button>
          <button className="btn-ghost w-full" onClick={() => navigate('/progress')}>
            📊 See my progress
          </button>
        </div>
      </main>
    )
  }

  if (!current) return null

  return (
    <main className="page">
      <Celebration show={phase === 'feedback' && lastCorrect} />

      <div className="pt-2">
        <p className="mb-2 text-center text-xs font-bold text-ink-soft">
          Word {index + 1} of {queue.length}
        </p>
        <ProgressBar value={index / queue.length} label="Test progress" />
      </div>

      {phase === 'answering' ? (
        <>
          <Card className="mt-4 text-center">
            <span className="block text-6xl animate-bob" aria-hidden>
              🎧
            </span>
            <p className="mt-3 text-base font-semibold">Listen, then type the word.</p>

            {noVoice && (
              <div className="mt-3 text-left">
                <Notice tone="warn">
                  This device has no {current.lang === 'en' ? 'English' : 'Chinese'} voice installed, so the word
                  cannot be spoken. Use “Show me the word” below, or install a voice in your device settings.
                </Notice>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <button className="btn-primary w-full text-lg" onClick={() => sayWord()}>
                🔊 Hear Word Again
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-ghost" onClick={() => sayWord({ slow: true })}>
                  🐢 Say it slowly
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => sayWord({ spellOut: true })}
                  disabled={current.lang !== 'en'}
                  title={current.lang !== 'en' ? 'Only for English words' : undefined}
                >
                  🔤 Letter by letter
                </button>
              </div>
            </div>
          </Card>

          <Card className="mt-3">
            <label htmlFor="answer" className="mb-2 block text-sm font-bold">
              How do you spell it?
            </label>
            <input
              id="answer"
              ref={inputRef}
              className="field text-center text-2xl font-bold tracking-wide"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void check()
              }}
              // No help from the keyboard: autocorrect would spell it for them.
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode={current.lang === 'en' ? 'text' : undefined}
              placeholder="Type here…"
            />
            <button className="btn-success mt-3 w-full text-lg" onClick={() => void check()} disabled={!answer.trim()}>
              ✅ Check
            </button>

            {revealed ? (
              <p className="mt-3 text-center text-sm">
                The word is <strong className="text-grape">{current.word}</strong>. Have a go at typing it.
              </p>
            ) : (
              <button className="btn-quiet mt-3 w-full" onClick={() => setRevealed(true)}>
                🙈 I cannot hear it — show me the word
              </button>
            )}
          </Card>
        </>
      ) : (
        <Card className={`mt-4 text-center ${lastCorrect ? 'bg-leaf-50' : 'bg-sunny-50'}`}>
          <span className="block text-6xl animate-pop" aria-hidden>
            {lastCorrect ? '🎉' : '💪'}
          </span>
          <h2 className={`mt-2 text-2xl font-extrabold ${lastCorrect ? 'text-leaf-600' : 'text-sunny-600'}`}>
            {lastCorrect ? 'Correct!' : 'Almost!'}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {lastCorrect ? 'Great job!' : "Let's try this one again soon."}
          </p>

          {!lastCorrect && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">The correct spelling is</p>
              {/* Per-letter diff so the child sees exactly which letter slipped. */}
              <p className="mt-2 flex flex-wrap justify-center gap-1">
                {diffAnswer(answer, current.word).map((part, i) => (
                  <span
                    key={i}
                    className={`inline-flex h-11 min-w-[2rem] items-center justify-center rounded-xl px-2 text-2xl font-extrabold ${
                      part.ok ? 'bg-leaf-50 text-leaf-600' : 'bg-berry-50 text-berry-600 ring-2 ring-berry'
                    }`}
                  >
                    {part.char}
                  </span>
                ))}
              </p>
              <p className="mt-3 text-sm text-ink-soft">
                You wrote: <span className="font-bold text-berry">{answer}</span>
              </p>
            </div>
          )}

          <div className="mt-5 space-y-2">
            <button className="btn-ghost w-full" onClick={() => sayWord()}>
              🔊 Hear Word Again
            </button>
            <button className="btn-primary w-full text-lg" onClick={next} autoFocus>
              {index + 1 >= queue.length ? '🏁 Finish' : '👉 Next Word'}
            </button>
          </div>
        </Card>
      )}

      <div className="mt-4 text-center">
        <button className="btn-quiet" onClick={() => setPhase('summary')}>
          Stop and see my score
        </button>
      </div>
    </main>
  )
}

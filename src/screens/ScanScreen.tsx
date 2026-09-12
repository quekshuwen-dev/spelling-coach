/**
 * IMAGE -> OCR -> PICK WORDS -> SAVE.
 *
 * Stages are explicit rather than implied by which state happens to be set:
 * a half-finished scan is a common way for this kind of screen to get stuck.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CameraCapture from '../components/CameraCapture'
import WordPicker from '../components/WordPicker'
import { Card, CardTitle, EmptyState, Notice, PageHeader, ProgressBar, Spinner } from '../components/ui'
import { useApp } from '../context/AppContext'
import { cleanWord, detectLang, isPlausibleWord } from '../lib/words'
import {
  ImageTooDarkError,
  ImageUnreadableError,
  discardImage,
  prepareImage,
  type PreparedImage,
} from '../services/imageProcessingService'
import { OcrError, recognise } from '../services/ocrService'
import type { OcrResult, OcrWord } from '../types'

type Stage = 'capture' | 'review-photo' | 'reading' | 'pick' | 'error'

export default function ScanScreen() {
  const navigate = useNavigate()
  const { addWords, showToast, serverOcr } = useApp()

  const [stage, setStage] = useState<Stage>('capture')
  const [image, setImage] = useState<PreparedImage | null>(null)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [words, setWords] = useState<OcrWord[]>([])
  const [progress, setProgress] = useState({ value: 0, label: '' })
  const [error, setError] = useState<{ title: string; body: string; tip?: string } | null>(null)
  const [manualWord, setManualWord] = useState('')
  const [saving, setSaving] = useState(false)
  const [showRawText, setShowRawText] = useState(false)
  const [showUnsure, setShowUnsure] = useState(false)

  const imageRef = useRef<PreparedImage | null>(null)
  imageRef.current = image

  // Never leave a photo behind when the user navigates away.
  useEffect(
    () => () => {
      discardImage(imageRef.current)
      imageRef.current = null
    },
    [],
  )

  const selectedCount = useMemo(() => words.filter((w) => w.selected).length, [words])
  const likely = useMemo(() => words.filter((w) => w.quality === 'likely'), [words])
  const unsure = useMemo(() => words.filter((w) => w.quality === 'unsure'), [words])

  const showError = (title: string, body: string, tip?: string) => {
    setError({ title, body, tip })
    setStage('error')
  }

  const handleCapture = useCallback(async (blob: Blob) => {
    try {
      const prepared = await prepareImage(blob)
      discardImage(imageRef.current)
      setImage(prepared)
      setStage('review-photo')
    } catch (err) {
      if (err instanceof ImageTooDarkError) {
        showError(
          'That photo looks very dark',
          'We could not see the words clearly.',
          'Try again with more light, or move closer to a window.',
        )
      } else if (err instanceof ImageUnreadableError) {
        showError('We could not read that photo', 'The file may be damaged or in a format we cannot open.', 'Try taking a new photo.')
      } else {
        showError('Something went wrong', (err as Error).message)
      }
    }
  }, [])

  const runOcr = async () => {
    if (!image) return
    setStage('reading')
    setProgress({ value: 0.02, label: 'Getting ready' })
    try {
      const ocr = await recognise(image, {
        onProgress: (value, label) => setProgress({ value, label }),
      })
      setResult(ocr)
      setWords(ocr.words)
      setStage(ocr.words.length ? 'pick' : 'error')
      if (!ocr.words.length) {
        showError(
          'No words found',
          'We read the photo but could not pick out any spelling words.',
          'Try a straighter shot with the whole list in frame, or add the words by hand below.',
        )
      }
    } catch (err) {
      if (err instanceof OcrError) {
        const tips: Record<string, string> = {
          too_large: 'Take the photo from a little further back.',
          timeout: 'Try again in a moment.',
          unreadable: 'Try a brighter, straighter photo.',
          engine_failed: 'Connect to the internet once so the reader can download, then try again.',
        }
        showError('We could not read that list', err.message, tips[err.code])
      } else {
        showError('Something went wrong', (err as Error).message)
      }
    } finally {
      // The photo has done its job — release it immediately.
      discardImage(imageRef.current)
    }
  }

  const addManual = () => {
    const text = cleanWord(manualWord)
    if (!isPlausibleWord(text)) {
      showToast('Please type a word first.')
      return
    }
    if (words.some((w) => w.text.toLowerCase() === text.toLowerCase())) {
      showToast(`"${text}" is already in the list.`)
      setManualWord('')
      return
    }
    setWords((current) => [
      // A word the parent typed is never a guess, so it leads the list ready-ticked.
      { id: `manual_${Date.now()}`, raw: text, text, lang: detectLang(text), selected: true, quality: 'likely' },
      ...current,
    ])
    setManualWord('')
  }

  const save = async () => {
    const chosen = words.filter((w) => w.selected)
    if (!chosen.length) {
      showToast('Tick at least one word first.')
      return
    }
    setSaving(true)
    try {
      const { added, duplicates } = await addWords(
        chosen.map((w) => ({
          word: w.text,
          source: w.id.startsWith('manual_') ? ('manual' as const) : ('image' as const),
          sourceImageId: image?.imageId,
        })),
      )
      const parts = [`✅ ${added.length} word${added.length === 1 ? '' : 's'} added`]
      if (duplicates.length) parts.push(`${duplicates.length} already saved`)
      showToast(parts.join(' · '))
      navigate('/words')
    } catch (err) {
      showError('Could not save those words', (err as Error).message, 'Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const restart = () => {
    discardImage(imageRef.current)
    setImage(null)
    setResult(null)
    setWords([])
    setError(null)
    setStage('capture')
  }

  /* -------------------------------- render -------------------------------- */

  if (stage === 'reading') {
    return (
      <main className="page">
        <PageHeader emoji="🔎" title="Reading your list…" subtitle="This usually takes a few seconds." />
        <Card className="space-y-3">
          <ProgressBar value={progress.value} label="Reading progress" />
          <Spinner label={progress.label} />
        </Card>
        <p className="mt-4 text-center text-xs text-ink-soft">
          The photo is read once and then discarded. It is never saved to your list or uploaded to storage.
        </p>
      </main>
    )
  }

  if (stage === 'error' && error) {
    return (
      <main className="page">
        <PageHeader emoji="😕" title={error.title} />
        <div className="space-y-3">
          <Notice tone="warn">{error.body}</Notice>
          {error.tip && <p className="text-sm text-ink-soft">Tip: {error.tip}</p>}
          <button className="btn-primary w-full" onClick={restart}>
            📷 Try another photo
          </button>
          {words.length > 0 && (
            <button className="btn-ghost w-full" onClick={() => setStage('pick')}>
              ← Back to the words I found
            </button>
          )}
          <ManualAdd value={manualWord} onChange={setManualWord} onAdd={addManual} />
          {words.length > 0 && (
            <button className="btn-success w-full" onClick={() => setStage('pick')}>
              Continue with {words.length} word{words.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </main>
    )
  }

  if (stage === 'pick') {
    const toggle = (id: string) =>
      setWords((c) => c.map((w) => (w.id === id ? { ...w, selected: !w.selected } : w)))
    const edit = (id: string, text: string) =>
      setWords((c) => c.map((w) => (w.id === id ? { ...w, text, lang: detectLang(text) } : w)))
    const remove = (id: string) => setWords((c) => c.filter((w) => w.id !== id))

    return (
      <main className="page pb-44">
        <PageHeader
          emoji="👆"
          title="Tap the words you want"
          subtitle="Tap a word to tick it. Tap ✏️ to fix a spelling the reader got wrong."
        />

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              ✅ Picked {selectedCount} of {words.length}
            </CardTitle>
            <div className="flex gap-2">
              <button
                className="btn-quiet"
                onClick={() =>
                  setWords((c) => c.map((w) => (w.quality === 'likely' ? { ...w, selected: true } : w)))
                }
              >
                Select all
              </button>
              <button
                className="btn-quiet"
                onClick={() => setWords((c) => c.map((w) => ({ ...w, selected: false })))}
              >
                Clear
              </button>
            </div>
          </div>

          {likely.length > 0 ? (
            <WordPicker words={likely} onToggle={toggle} onEdit={edit} onRemove={remove} />
          ) : (
            <p className="py-2 text-sm text-ink-soft">
              None of these looked like clear spelling words. Open the list below, or type the words by hand.
            </p>
          )}
        </Card>

        {/* OCR on a photo of packaging or a book cover returns far more scraps
            than words. They are still offered — the reader is sometimes right —
            but folded away so they cannot bury the real list. */}
        {unsure.length > 0 && (
          <Card className="mt-3 space-y-3">
            <button
              className="flex w-full items-center justify-between text-sm font-bold"
              onClick={() => setShowUnsure((s) => !s)}
              aria-expanded={showUnsure}
            >
              <span>
                🤔 {unsure.length} more the reader wasn&apos;t sure about
              </span>
              <span aria-hidden>{showUnsure ? '▲' : '▼'}</span>
            </button>
            {showUnsure && (
              <>
                <p className="text-xs text-ink-soft">
                  These are usually bits of a logo or half a word. Tap any that really are words.
                </p>
                <WordPicker words={unsure} onToggle={toggle} onEdit={edit} onRemove={remove} />
              </>
            )}
          </Card>
        )}

        <Card className="mt-3">
          <CardTitle>✏️ Add a word by hand</CardTitle>
          <ManualAdd value={manualWord} onChange={setManualWord} onAdd={addManual} />
        </Card>

        {result && (
          <Card className="mt-3">
            <button
              className="flex w-full items-center justify-between text-sm font-bold"
              onClick={() => setShowRawText((s) => !s)}
              aria-expanded={showRawText}
            >
              <span>📄 What the reader saw</span>
              <span aria-hidden>{showRawText ? '▲' : '▼'}</span>
            </button>
            {showRawText && (
              <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-2xl bg-grape-50 p-3 text-xs leading-relaxed">
                {result.text || '(no text)'}
              </pre>
            )}
            <p className="mt-2 text-xs text-ink-soft">
              Read by {result.local ? 'the on-device reader' : `the ${result.engine} reader`}.
            </p>
          </Card>
        )}

        {/* Opaque, and spanning the page gutter: as a transparent bar this sat on
            top of the word chips as they scrolled past, hiding them and swallowing
            the taps meant for them. */}
        <div
          className="sticky bottom-0 z-40 -mx-4 mt-4 space-y-2 border-t border-grape-100 bg-cream px-4 pb-3 pt-3
                     shadow-[0_-6px_18px_rgba(255,87,34,0.10)]"
        >
          <button className="btn-success w-full text-lg" onClick={save} disabled={saving || selectedCount === 0}>
            {saving ? 'Saving…' : `➕ Add ${selectedCount || ''} word${selectedCount === 1 ? '' : 's'} to my list`}
          </button>
          <button className="btn-ghost w-full" onClick={restart}>
            📷 Scan another photo
          </button>
        </div>
      </main>
    )
  }

  if (stage === 'review-photo' && image) {
    return (
      <main className="page">
        <PageHeader emoji="👀" title="Happy with this photo?" subtitle="The words need to be sharp and level." />
        <div className="space-y-3">
          <img
            src={image.previewUrl}
            alt="The list you photographed"
            className="max-h-80 w-full rounded-xl2 bg-ink object-contain"
          />
          <button className="btn-primary w-full text-lg" onClick={runOcr}>
            🪄 Read this list
          </button>
          <button className="btn-ghost w-full" onClick={restart}>
            🔄 Retake
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <PageHeader emoji="📷" title="Scan a word list" subtitle="A worksheet, a textbook page, or a list on paper." />
      <CameraCapture onCapture={handleCapture} hint="Fit the whole list in the frame, straight on." />

      <Card className="mt-4">
        <CardTitle>✏️ Or add a word by hand</CardTitle>
        <ManualAdd
          value={manualWord}
          onChange={setManualWord}
          onAdd={() => {
            const text = cleanWord(manualWord)
            if (!isPlausibleWord(text)) {
              showToast('Please type a word first.')
              return
            }
            void addWords([{ word: text, source: 'manual' }]).then(({ added, duplicates }) => {
              showToast(added.length ? `✅ "${text}" added` : `"${duplicates[0] ?? text}" is already on the list`)
              setManualWord('')
            })
          }}
        />
      </Card>

      {serverOcr === false && (
        <div className="mt-4">
          <Notice>
            Reading happens on this device, so it works offline. Printed lists read well; messy handwriting is
            harder. Adding an <code>OCR_API_KEY</code> on the server improves it — see the README.
          </Notice>
        </div>
      )}

      {stage === 'capture' && words.length === 0 && !image && (
        <div className="mt-2">
          <EmptyState
            emoji="🖼️"
            title="Nothing scanned yet"
            body="Take a photo of the spelling list and we will pull the words out for you."
          />
        </div>
      )}
    </main>
  )
}

function ManualAdd({
  value,
  onChange,
  onAdd,
}: {
  value: string
  onChange: (v: string) => void
  onAdd: () => void
}) {
  return (
    <div className="flex gap-2">
      <input
        className="field flex-1"
        placeholder="Type a word…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onAdd()
        }}
        aria-label="Add a word by hand"
      />
      <button className="btn-primary w-14 px-0 text-2xl" onClick={onAdd} aria-label="Add word">
        ＋
      </button>
    </div>
  )
}

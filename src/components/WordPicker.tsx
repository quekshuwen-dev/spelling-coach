/**
 * The selectable-word grid — the heart of the scan flow.
 *
 * This is deliberately NOT a text box. Each word is its own button with a large
 * hit area, a loud selected state, and an edit affordance, because:
 *  - a parent on a phone selects by tapping, not by dragging a text cursor;
 *  - OCR mistakes ("butterfiy") must be fixable before the word is saved;
 *  - the selected state has to survive a glance, not reward close reading.
 *
 * Selection is colour AND a tick AND a border, so it still reads for a
 * colour-blind user, and each button carries aria-pressed for screen readers.
 */
import { useEffect, useRef, useState } from 'react'
import type { OcrWord } from '../types'

interface Props {
  words: OcrWord[]
  onToggle: (id: string) => void
  onEdit: (id: string, text: string) => void
  onRemove: (id: string) => void
}

export default function WordPicker({ words, onToggle, onEdit, onRemove }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)

  if (words.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-soft">No words were found in that photo.</p>
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {words.map((word) =>
        editingId === word.id ? (
          <li key={word.id} className="w-full">
            <WordEditor
              initial={word.text}
              onCancel={() => setEditingId(null)}
              onSave={(text) => {
                if (text.trim()) onEdit(word.id, text.trim())
                setEditingId(null)
              }}
              onRemove={() => {
                onRemove(word.id)
                setEditingId(null)
              }}
            />
          </li>
        ) : (
          <li key={word.id} className="flex">
            <button
              type="button"
              aria-pressed={word.selected}
              onClick={() => onToggle(word.id)}
              className={`btn min-h-[3rem] rounded-2xl border-[2.5px] px-4 text-base ${
                word.selected
                  ? 'border-grape bg-grape text-white shadow-soft'
                  : 'border-grape-100 bg-white text-ink hover:border-grape-400'
              }`}
            >
              {word.selected && <span aria-hidden>✓</span>}
              <span>{word.text}</span>
            </button>
            <button
              type="button"
              onClick={() => setEditingId(word.id)}
              aria-label={`Edit or remove "${word.text}"`}
              className="-ml-1 flex min-h-[3rem] w-9 items-center justify-center rounded-r-2xl text-ink-soft
                         hover:text-grape"
            >
              ✏️
            </button>
          </li>
        ),
      )}
    </ul>
  )
}

function WordEditor({
  initial,
  onSave,
  onCancel,
  onRemove,
}: {
  initial: string
  onSave: (text: string) => void
  onCancel: () => void
  onRemove: () => void
}) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-grape-50 p-3">
      <input
        ref={inputRef}
        className="field flex-1 min-w-[9rem]"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(value)
          if (e.key === 'Escape') onCancel()
        }}
        aria-label="Correct this word"
      />
      <button className="btn-success min-h-[2.75rem] px-4 text-sm" onClick={() => onSave(value)}>
        Save
      </button>
      <button className="btn-quiet" onClick={onCancel}>
        Cancel
      </button>
      <button className="btn-quiet text-berry" onClick={onRemove}>
        🗑️ Remove
      </button>
    </div>
  )
}

/**
 * The three subject-folder chips, reused everywhere a word needs to be filed:
 * saving a scan, re-filing an existing word, and choosing what to practise.
 */
import { FOLDERS } from '../config/folders'
import type { FolderId } from '../types'

export default function FolderPicker({
  value,
  onChange,
  label,
}: {
  value: FolderId
  onChange: (id: FolderId) => void
  label?: string
}) {
  return (
    <div>
      {label && <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={value === f.id}
            onClick={() => onChange(f.id)}
            className={`chip min-h-[2.25rem] px-3 ${
              value === f.id ? 'bg-grape text-white' : 'bg-grape-50 text-grape-600'
            }`}
          >
            <span aria-hidden>{f.emoji}</span> {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}

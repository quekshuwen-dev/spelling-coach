/**
 * My Spelling List: every saved word with its real progress, plus the controls
 * that decide what the next test contains.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardTitle, EmptyState, PageHeader, StatusPill } from '../components/ui'
import ChineseWordInfo from '../components/ChineseWordInfo'
import { useApp } from '../context/AppContext'
import { accuracyOf, needsPractice, statusOf } from '../config/scoring'
import { speak, stopSpeaking } from '../services/speechService'
import type { SpellingWord } from '../types'

type Filter = 'all' | 'needs-practice' | 'mastered'
type Sort = 'recent' | 'az' | 'weakest'

export default function WordListScreen() {
  const navigate = useNavigate()
  const { words, loading, removeWord, showToast, settings, storage } = useApp()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('recent')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    let list = words.filter((w) => (query ? w.normalizedWord.includes(query) || w.word.toLowerCase().includes(query) : true))
    if (filter === 'needs-practice') list = list.filter(needsPractice)
    if (filter === 'mastered') list = list.filter((w) => statusOf(w) === 'mastered')

    return [...list].sort((a, b) => {
      if (sort === 'az') return a.normalizedWord.localeCompare(b.normalizedWord)
      if (sort === 'weakest') return accuracyOf(a) - accuracyOf(b) || b.incorrectCount - a.incorrectCount
      return b.createdAt - a.createdAt
    })
  }, [words, search, filter, sort])

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const startTest = (mode: 'all' | 'selected' | 'needs-practice') => {
    if (mode === 'selected' && selected.size === 0) {
      showToast('Tick some words first.')
      return
    }
    navigate('/test', { state: { mode, selectedIds: [...selected] } })
  }

  const handleDelete = async (word: SpellingWord) => {
    if (!window.confirm(`Remove "${word.word}" from the list?`)) return
    await removeWord(word.id)
    setSelected((current) => {
      const next = new Set(current)
      next.delete(word.id)
      return next
    })
    showToast(`"${word.word}" removed`)
  }

  return (
    <main className="page">
      <PageHeader emoji="📚" title="My Spelling List" subtitle={`${words.length} word${words.length === 1 ? '' : 's'} saved`} />

      <Card className="mb-3 space-y-3">
        <input
          className="field"
          type="search"
          placeholder="🔍 Search my words…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search words"
        />
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </FilterChip>
          <FilterChip active={filter === 'needs-practice'} onClick={() => setFilter('needs-practice')}>
            💪 Needs practice
          </FilterChip>
          <FilterChip active={filter === 'mastered'} onClick={() => setFilter('mastered')}>
            🏆 Mastered
          </FilterChip>
          <span className="ml-auto" />
          <select
            className="rounded-full border border-grape-100 bg-white px-3 py-2 text-xs font-bold text-ink-soft"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort words"
          >
            <option value="recent">Newest first</option>
            <option value="az">A → Z</option>
            <option value="weakest">Weakest first</option>
          </select>
        </div>
      </Card>

      {loading ? (
        <Card>
          <p className="text-sm text-ink-soft">Loading your words…</p>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            emoji={words.length ? '🔍' : '🌱'}
            title={words.length ? 'No words match' : 'No words yet'}
            body={
              words.length
                ? 'Try a different search or filter.'
                : 'Scan a spelling list, or add a word by hand, and it will show up here.'
            }
            action={
              !words.length && (
                <button className="btn-primary" onClick={() => navigate('/scan')}>
                  📷 Scan a list
                </button>
              )
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-grape-50 py-2">
          {visible.map((word) => (
            <WordRow
              key={word.id}
              word={word}
              checked={selected.has(word.id)}
              onToggle={() => toggle(word.id)}
              onSpeak={() => {
                stopSpeaking()
                void speak(word.word, { lang: word.lang, accent: settings.accent, rate: settings.rate })
              }}
              onDelete={() => void handleDelete(word)}
            />
          ))}
        </Card>
      )}

      {words.length > 0 && (
        <Card className="mt-3">
          <CardTitle>🎧 Start a spelling test</CardTitle>
          <div className="space-y-2">
            <button className="btn-success w-full" onClick={() => startTest('all')}>
              Practise all {words.length} words
            </button>
            <button className="btn-ghost w-full" onClick={() => startTest('needs-practice')}>
              💪 Practise the tricky ones
            </button>
            <button className="btn-ghost w-full" onClick={() => startTest('selected')} disabled={selected.size === 0}>
              ✅ Practise the {selected.size || ''} ticked word{selected.size === 1 ? '' : 's'}
            </button>
          </div>
        </Card>
      )}

      {storage === 'local' && (
        <p className="mt-4 text-center text-xs text-ink-soft">Saved on this device only.</p>
      )}
    </main>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`chip min-h-[2.25rem] px-3 ${active ? 'bg-grape text-white' : 'bg-grape-50 text-grape-600'}`}
    >
      {children}
    </button>
  )
}

function WordRow({
  word,
  checked,
  onToggle,
  onSpeak,
  onDelete,
}: {
  word: SpellingWord
  checked: boolean
  onToggle: () => void
  onSpeak: () => void
  onDelete: () => void
}) {
  const accuracy = word.practiceCount ? Math.round(accuracyOf(word) * 100) : null
  const added = new Date(word.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  return (
    <div className="flex items-center gap-3 py-3">
      <input
        type="checkbox"
        className="h-6 w-6 shrink-0 accent-grape"
        checked={checked}
        onChange={onToggle}
        aria-label={`Select "${word.word}" for a test`}
      />
      <button
        onClick={onSpeak}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-grape-50 text-xl
                   active:bg-grape-100"
        aria-label={`Hear "${word.word}"`}
      >
        🔊
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-bold">{word.word}</div>
        <ChineseWordInfo word={word.word} lang={word.lang} compact />
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-ink-soft">
          <StatusPill status={statusOf(word)} />
          <span>
            {word.practiceCount === 0
              ? 'Not practised yet'
              : `${word.practiceCount} ${word.practiceCount === 1 ? 'try' : 'tries'} · ${accuracy}% right`}
          </span>
          <span>· added {added}</span>
        </div>
      </div>
      <button
        onClick={onDelete}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft
                   hover:bg-berry-50 hover:text-berry"
        aria-label={`Remove "${word.word}"`}
      >
        ✕
      </button>
    </div>
  )
}

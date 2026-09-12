/** Small shared pieces. Kept plain so the screens stay readable. */
import type { ReactNode } from 'react'
import { STATUS_EMOJI, STATUS_LABEL } from '../config/scoring'
import type { MasteryStatus } from '../types'

export function PageHeader({ emoji, title, subtitle }: { emoji?: string; title: string; subtitle?: string }) {
  return (
    <header className="pb-5 pt-2 text-center">
      {emoji && <span className="mb-2 block text-6xl leading-none animate-bob">{emoji}</span>}
      <h1 className="text-2xl font-extrabold text-grape">{title}</h1>
      {subtitle && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{subtitle}</p>}
    </header>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">{children}</h2>
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'good'; children: ReactNode }) {
  const tones = {
    info: 'bg-grape-50 border-grape text-grape-600',
    warn: 'bg-sunny-50 border-sunny text-sunny-600',
    good: 'bg-leaf-50 border-leaf text-leaf-600',
  } as const
  return (
    <div className={`rounded-r-2xl border-l-4 px-4 py-3 text-sm leading-relaxed ${tones[tone]}`} role="status">
      {children}
    </div>
  )
}

export function StatusPill({ status }: { status: MasteryStatus }) {
  const tones: Record<MasteryStatus, string> = {
    new: 'bg-grape-50 text-grape-600',
    'needs-practice': 'bg-berry-50 text-berry-600',
    learning: 'bg-sunny-50 text-sunny-600',
    good: 'bg-leaf-50 text-leaf-600',
    mastered: 'bg-leaf-50 text-leaf-600',
  }
  return (
    <span className={`chip ${tones[status]}`}>
      {STATUS_EMOJI[status]} {STATUS_LABEL[status]}
    </span>
  )
}

// Full class names only — Tailwind cannot see a class built by interpolation.
const STAT_TONES = {
  grape: 'text-grape',
  leaf: 'text-leaf',
  berry: 'text-berry',
  sunny: 'text-sunny',
} as const

export function Stat({
  value,
  label,
  tone = 'grape',
}: {
  value: ReactNode
  label: string
  tone?: keyof typeof STAT_TONES
}) {
  return (
    <div className="card p-4 text-center">
      <div className={`text-3xl font-extrabold ${STAT_TONES[tone]}`}>{value}</div>
      <div className="mt-1 text-xs font-semibold text-ink-soft">{label}</div>
    </div>
  )
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      className="h-3 overflow-hidden rounded-full bg-grape-50"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progress'}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-grape to-grape-400 transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-ink-soft">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-bounce rounded-full bg-grape"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      {label}
    </div>
  )
}

export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="py-10 text-center">
      <span className="mb-3 block text-5xl">{emoji}</span>
      <p className="font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/** Falling emoji for a correct answer. Used sparingly, and honours reduced motion. */
export function Celebration({ show }: { show: boolean }) {
  if (!show) return null
  const emojis = ['⭐', '🎉', '🌟', '✨', '🎊', '💫']
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden>
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className="absolute animate-fall"
          style={{
            left: `${(i * 7 + 4) % 96}vw`,
            fontSize: `${18 + (i % 4) * 6}px`,
            animationDelay: `${(i % 5) * 0.12}s`,
          }}
        >
          {emojis[i % emojis.length]}
        </span>
      ))}
    </div>
  )
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      className="fixed bottom-24 left-1/2 z-[120] max-w-[88vw] -translate-x-1/2 animate-pop rounded-full
                 bg-ink px-6 py-3 text-center text-sm font-semibold text-white shadow-lg"
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  )
}

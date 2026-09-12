import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/scan', label: 'Scan', icon: '📷' },
  { to: '/words', label: 'My Words', icon: '📚' },
  { to: '/test', label: 'Test', icon: '🎧' },
  { to: '/progress', label: 'Progress', icon: '📊' },
]

export default function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-grape-100 bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `flex min-h-[4rem] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 text-[0.65rem] font-bold ${
              isActive ? 'text-grape' : 'text-ink-soft/60'
            }`
          }
        >
          <span className="text-xl leading-none" aria-hidden>
            {tab.icon}
          </span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

import { cx } from '../lib/cx';

export type View = 'today' | 'calendar' | 'photos' | 'body';

const TABS: { id: View; label: string; glyph: string }[] = [
  { id: 'today', label: 'Today', glyph: '◎' },
  { id: 'calendar', label: 'Calendar', glyph: '▦' },
  { id: 'photos', label: 'Photos', glyph: '▣' },
  { id: 'body', label: 'Body', glyph: '↧' },
];

/**
 * Tabs exist for everything that is NOT the daily ritual. §11 is explicit that
 * entry must not be split across tabs — the day card keeps all ten items on one
 * screen — while measurements get a separate tab by design.
 */
export function TabBar({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <nav
      className="bg-raised border-line sticky bottom-0 z-10 -mx-4 mt-2 flex border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label="Sections"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          aria-current={view === tab.id ? 'page' : undefined}
          className={cx(
            'flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition',
            view === tab.id ? 'text-accent' : 'text-faint',
          )}
        >
          <span aria-hidden className="text-lg leading-none">
            {tab.glyph}
          </span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

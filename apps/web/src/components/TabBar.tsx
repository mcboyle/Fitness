import { cx } from '../lib/cx';
import { Icon, type IconName } from './Icon';

export type View = 'today' | 'calendar' | 'photos' | 'body';

const TABS: { id: View; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'photos', label: 'Photos', icon: 'photos' },
  { id: 'body', label: 'Body', icon: 'body' },
];

/**
 * Tabs exist for everything that is NOT the daily ritual. §11 is explicit that
 * entry must not be split across tabs — the day card keeps all ten items on one
 * screen — while measurements get a separate tab by design.
 */
export function TabBar({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <nav
      className="bg-raised border-line sticky bottom-0 z-10 -mx-4 mt-auto flex border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
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
          <Icon name={tab.icon} size={22} strokeWidth={view === tab.id ? 2 : 1.6} />
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

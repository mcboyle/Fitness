import type { DailyLog, UserSettings } from '@lifestyle/shared';
import { scoreCount, SCORED_ITEMS } from '@lifestyle/shared';
import { Rings } from './rings/Rings';
import { ringSpecs } from './rings/specs';
import { Card } from './ui';

/**
 * Her rings at ~60% scale (§11). Full mutual visibility is the default in this
 * app; progress photos are the single exception and they land in Phase 3.
 */
export function PartnerCard({
  name,
  log,
  settings,
  layout,
  onFocus,
  children,
}: {
  name: string;
  log: DailyLog;
  settings: UserSettings;
  layout: UserSettings['ring_layout'];
  onFocus: () => void;
  children?: React.ReactNode;
}) {
  const scored = scoreCount(log, settings);

  return (
    <Card>
      <button type="button" onClick={onFocus} className="w-full text-left">
        <header className="mb-3 flex items-baseline gap-2">
          <h2 className="text-ink text-sm font-bold tracking-wide uppercase">{name}</h2>
          <span className="text-faint ml-auto text-xs font-semibold tabular-nums">
            {scored}/{SCORED_ITEMS.length} today
          </span>
        </header>
        <div className="flex justify-center">
          <Rings specs={ringSpecs(log, settings)} layout={layout} scale={0.6} />
        </div>
      </button>
      {children}
    </Card>
  );
}

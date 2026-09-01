import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { db } from '../db/db';

export interface Member {
  id: string;
  display_name: string;
}

const CACHE = 'lt.members';

function cached(): Member[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? '[]') as Member[];
  } catch {
    return [];
  }
}

/**
 * Everyone else on the account.
 *
 * Ids come from `user_settings`, which carries a row per person and is pulled
 * for everyone — so the set is correct offline and however people joined.
 * Names need the network, so they are cached: without that, going offline
 * relabels your partner "Partner", which reads as data loss.
 */
export function useMembers(myUserId: string): { list: Member[]; nameFor: (id: string) => string } {
  const [names, setNames] = useState<Member[]>(cached);

  const ids =
    useLiveQuery(async () => {
      const settings = await db.user_settings.toArray();
      const fromSettings = settings.map((row) => row.user_id);
      const fromMembers = (await db.challenge_members.toArray()).map((m) => m.user_id);
      return [...new Set([...fromSettings, ...fromMembers])].filter((id) => id !== myUserId);
    }, [myUserId]) ?? [];

  useEffect(() => {
    let cancelled = false;
    api<{ members: Member[] }>('/me')
      .then(({ members }) => {
        if (cancelled || !members) return;
        setNames(members);
        try {
          localStorage.setItem(CACHE, JSON.stringify(members));
        } catch {
          // Memory-only is fine for a session.
        }
      })
      .catch(() => {
        // Offline: the cache is what stops names reverting to placeholders.
      });
    return () => {
      cancelled = true;
    };
  }, [ids.length]);

  const nameFor = (id: string) =>
    names.find((m) => m.id === id)?.display_name ?? 'Someone';

  // Ordered by the synced id list so it is stable, named from the fetch.
  const list = ids.map((id) => ({ id, display_name: nameFor(id) }));

  return { list, nameFor };
}

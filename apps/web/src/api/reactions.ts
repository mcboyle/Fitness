import { api } from './client';

export interface ReactionRow {
  id: string;
  from_user_id: string;
  target_kind: 'day' | 'photo' | 'measurement';
  target_date: string | null;
  target_media_id: string | null;
  emoji: string;
  body: string | null;
  seen_at: string | null;
  created_at: string;
}

export const QUICK_EMOJI = ['🔥', '💪', '👏', '💗', '🎉'];

export async function react(input: {
  target_kind: ReactionRow['target_kind'];
  target_date?: string;
  target_media_id?: string;
  emoji: string;
  body?: string;
}) {
  return api<{ id: string }>('/reactions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function markSeen(id: string) {
  return api<{ id: string }>(`/reactions/${id}/seen`, { method: 'POST' });
}

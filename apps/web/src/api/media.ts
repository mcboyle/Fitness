import { api } from './client';
import { getSession } from './session';

export interface MediaRow {
  id: string;
  user_id: string;
  taken_on: string;
  kind: string;
  visibility: 'private' | 'shared';
  shared_at: string | null;
  created_at: string;
}

export async function listMedia(): Promise<MediaRow[]> {
  return (await api<{ media: MediaRow[] }>('/media')).media;
}

export async function uploadPhoto(file: File, takenOn: string): Promise<MediaRow> {
  const form = new FormData();
  form.append('taken_on', takenOn);
  form.append('file', file);

  const session = getSession();
  const response = await fetch('/api/v1/media', {
    method: 'POST',
    headers: session ? { authorization: `Bearer ${session.token}` } : undefined,
    body: form, // no content-type: the browser sets the multipart boundary
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `upload failed (${response.status})`);
  }
  return response.json();
}

export async function setVisibility(id: string, visibility: 'private' | 'shared') {
  return api<{ id: string; visibility: string }>(`/media/${id}/visibility`, {
    method: 'POST',
    body: JSON.stringify({ visibility }),
  });
}

export async function deletePhoto(id: string) {
  return api<{ deleted: string }>(`/media/${id}`, { method: 'DELETE' });
}

/**
 * §9.4: partner media is fetched on view and held in memory only — never
 * persisted to IndexedDB. Unsharing can't recall a screenshot, but it should
 * not leave a copy sitting in the other person's local database either.
 */
const urlCache = new Map<string, { url: string; expires: number }>();

export async function signedUrl(id: string): Promise<string> {
  const cached = urlCache.get(id);
  if (cached && cached.expires > Date.now() + 30_000) return cached.url;

  const { url, expires_in } = await api<{ url: string; expires_in: number }>(
    `/media/${id}/url`,
  );
  urlCache.set(id, { url, expires: Date.now() + expires_in * 1000 });
  return url;
}

export function forgetSignedUrls() {
  urlCache.clear();
}

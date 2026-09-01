import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { setSession, type Session } from '../api/session';
import { db } from '../db/db';
import { BigButton, Card } from './ui';

interface ClaimResponse {
  token: string;
  user: { id: string; display_name: string; avatar_color: string };
}

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<ClaimResponse>('/claim', {
        auth: false,
        method: 'POST',
        body: JSON.stringify({ invite_code: code.trim(), display_name: name.trim() }),
      });

      /*
       * Everything logged before signing in belonged to a placeholder user and
       * was never synced. Clearing it avoids two half-populated histories on
       * one device, and the server is the source of truth from here.
       */
      await db.delete();
      await db.open();

      const session: Session = {
        token: result.token,
        user_id: result.user.id,
        display_name: result.user.display_name,
        avatar_color: result.user.avatar_color,
      };
      setSession(session);
      onSignedIn();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'could not reach the server',
      );
      setBusy(false);
    }
  };

  const ready = code.trim().length > 0 && name.trim().length > 0 && !busy;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-5 p-6">
      <div>
        <h1 className="font-display text-ink text-5xl leading-none font-black italic">
          75
        </h1>
        <p className="text-muted mt-2 text-sm">
          Enter the invite code you were given.
        </p>
      </div>

      <Card>
        <label className="text-faint mb-1 block text-xs font-bold tracking-wide uppercase">
          Invite code
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ABCD2345"
          aria-label="Invite code"
          className="font-display text-ink border-line-strong mb-4 w-full border-b-2 bg-transparent py-1 text-2xl font-extrabold tracking-widest outline-none"
        />

        <label className="text-faint mb-1 block text-xs font-bold tracking-wide uppercase">
          Your name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          aria-label="Your name"
          className="font-display text-ink border-line-strong w-full border-b-2 bg-transparent py-1 text-2xl font-extrabold outline-none"
        />
      </Card>

      {error && (
        <p className="text-workout text-center text-sm font-semibold">{error}</p>
      )}

      <BigButton onClick={submit} disabled={!ready} className="w-full">
        {busy ? 'Joining…' : 'Join'}
      </BigButton>

      <p className="text-faint text-center text-xs">
        Anything logged on this device before signing in will be cleared.
      </p>
    </div>
  );
}

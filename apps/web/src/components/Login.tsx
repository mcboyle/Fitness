import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { setSession, type Session } from '../api/session';
import { db } from '../db/db';
import { BigButton, Card } from './ui';

interface AuthResponse {
  token: string;
  user: { id: string; display_name: string; avatar_color: string };
}

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [needsName, setNeedsName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = (result: AuthResponse) => {
    const session: Session = {
      token: result.token,
      user_id: result.user.id,
      display_name: result.user.display_name,
      avatar_color: result.user.avatar_color,
    };
    setSession(session);
    onSignedIn();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const trimmed = code.trim().toUpperCase();

    try {
      /*
       * Try the reusable sign-in code first. Neither of them should have to
       * know which kind of code they are holding, and this is the path that
       * runs every time the app is reinstalled — iOS gives an installed web app
       * its own storage, so a session never survives Add to Home Screen.
       *
       * Crucially this does NOT clear the local database: signing in again on a
       * device that already has history must not erase it.
       */
      finish(await api<AuthResponse>('/signin', {
        auth: false,
        method: 'POST',
        body: JSON.stringify({ code: trimmed }),
      }));
      return;
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 404) {
        setError(caught instanceof ApiError ? caught.message : 'could not reach the server');
        setBusy(false);
        return;
      }
    }

    // Not a sign-in code, so treat it as a first-time invite, which needs a name.
    if (!name.trim()) {
      setNeedsName(true);
      setError('New here? Add your name to join.');
      setBusy(false);
      return;
    }

    try {
      const result = await api<AuthResponse>('/claim', {
        auth: false,
        method: 'POST',
        body: JSON.stringify({ invite_code: trimmed, display_name: name.trim() }),
      });

      // A first claim starts clean: anything logged beforehand belonged to no
      // account and was never synced.
      await db.delete();
      await db.open();
      finish(result);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'could not reach the server');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-5 p-6">
      <div>
        <h1 className="font-display text-ink text-3xl leading-tight font-black break-words italic">
          Winter_Fitness_Tracker
        </h1>
        <p className="text-muted mt-2 text-sm">
          Enter your code — an invite if you're joining, or your sign-in code if
          you've been here before.
        </p>
      </div>

      <Card>
        <label className="text-faint mb-1 block text-xs font-bold tracking-wide uppercase">
          Code
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && code.trim() && void submit()}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="one-time-code"
          spellCheck={false}
          placeholder="ABCD2345"
          aria-label="Code"
          className="font-display text-ink border-line-strong w-full border-b-2 bg-transparent py-1 text-2xl font-extrabold tracking-widest outline-none"
        />

        {needsName && (
          <>
            <label className="text-faint mt-4 mb-1 block text-xs font-bold tracking-wide uppercase">
              Your name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              aria-label="Your name"
              className="font-display text-ink border-line-strong w-full border-b-2 bg-transparent py-1 text-2xl font-extrabold outline-none"
            />
          </>
        )}
      </Card>

      {error && <p className="text-workout text-center text-sm font-semibold">{error}</p>}

      <BigButton onClick={() => void submit()} disabled={!code.trim() || busy} className="w-full">
        {busy ? 'Checking…' : needsName ? 'Join' : 'Continue'}
      </BigButton>

      <p className="text-faint text-center text-xs">
        Signing in again keeps everything on this device. Joining for the first
        time starts clean.
      </p>
    </div>
  );
}

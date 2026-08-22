'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiClientError } from '@/lib/client';
import type { User } from '@/lib/types';
import { Avatar } from './Avatar';

/**
 * Passwordless sign-in against seeded accounts.
 *
 * One click per demo user is intentional: a reviewer testing the sharing flow
 * needs to switch between two people repeatedly, and a password field would be
 * pure friction with no security value in a seeded demo.
 */
export function SignInForm({ users }: { users: User[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(email: string) {
    setError(null);
    setPending(email);
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email }) });
      router.replace('/docs');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Sign-in failed.');
      setPending(null);
    }
  }

  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        Pick a demo account to continue. These are seeded users — there are no passwords in this
        build.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stack" style={{ gap: 8 }}>
        {users.map((user) => (
          <button
            key={user.id}
            type="button"
            className="btn"
            style={{ height: 54, justifyContent: 'flex-start', gap: 11, textAlign: 'left' }}
            disabled={pending !== null}
            onClick={() => signIn(user.email)}
          >
            <Avatar user={user} size="lg" />
            <span className="grow truncate">
              <span style={{ display: 'block', fontWeight: 600 }}>{user.name}</span>
              <span className="faint">{user.email}</span>
            </span>
            {pending === user.email && <span className="spinner" aria-hidden />}
          </button>
        ))}
      </div>

      <p className="faint" style={{ margin: 0 }}>
        Sign in as two different people in two browser profiles to see sharing work end to end.
      </p>
    </div>
  );
}

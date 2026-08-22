/**
 * Session handling.
 *
 * SCOPE CUT, STATED PLAINLY: this is passwordless demo auth. You sign in as a
 * seeded user by email and get a signed, HttpOnly session cookie. There is no
 * password, no email verification, and no registration.
 *
 * That is deliberate - the assignment explicitly allows seeded accounts, and
 * spending an hour on credential storage would have bought nothing that the
 * sharing model needs. What IS real here is the part sharing depends on: the
 * cookie is HMAC-signed so a user cannot edit it to become someone else, and
 * every API route resolves identity server-side rather than trusting a header.
 *
 * Swapping in real auth means replacing createSession/getSessionUser and
 * nothing else. See ARCHITECTURE.md.
 */

import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { SESSION_COOKIE } from './constants';
import { unauthenticated } from './errors';
import { getUserById, type User } from './users';

const DEV_FALLBACK_SECRET = 'ajaia-docs-dev-secret-not-for-production';

function secret(): string {
  return process.env.SESSION_SECRET || DEV_FALLBACK_SECRET;
}

function sign(value: string): string {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function serialise(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

function deserialise(token: string | undefined): string | null {
  if (!token) return null;
  const index = token.lastIndexOf('.');
  if (index <= 0) return null;

  const userId = token.slice(0, index);
  const signature = token.slice(index + 1);
  const expected = sign(userId);

  // Constant-time compare so the signature cannot be brute-forced by timing.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  return userId;
}

export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, serialise(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const userId = deserialise(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  // The signature proves the cookie is ours; this proves the user still exists.
  return getUserById(userId);
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw unauthenticated();
  return user;
}

/** Exported for tests of the signing logic. */
export const __session = { serialise, deserialise };

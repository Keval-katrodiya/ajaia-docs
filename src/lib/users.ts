import { getDb, newId } from './db';
import type { User } from './types';

export type { User };

const SELECT = 'SELECT id, email, name, accent FROM users';

export function getUserById(id: string): User | null {
  return (getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as User | undefined) ?? null;
}

export function getUserByEmail(email: string): User | null {
  const normalised = email.trim().toLowerCase();
  return (getDb().prepare(`${SELECT} WHERE email = ?`).get(normalised) as User | undefined) ?? null;
}

export function listUsers(): User[] {
  return getDb().prepare(`${SELECT} ORDER BY name`).all() as User[];
}

export function createUser(input: { email: string; name: string; accent?: string }): User {
  const user: User = {
    id: newId('usr'),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    accent: input.accent ?? '#5b6ee1',
  };
  getDb()
    .prepare('INSERT INTO users (id, email, name, accent) VALUES (@id, @email, @name, @accent)')
    .run(user);
  return user;
}

/** Used by the seed script so re-running it is safe. */
export function upsertUser(input: { email: string; name: string; accent?: string }): User {
  return getUserByEmail(input.email) ?? createUser(input);
}

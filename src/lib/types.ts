/**
 * Shared shapes that both the server and the browser bundle need.
 *
 * This file exists so a client component can import `User` (or `initials`)
 * without dragging better-sqlite3 into the browser bundle through users.ts.
 * Nothing here may import a server-only module.
 */

export interface User {
  id: string;
  email: string;
  name: string;
  accent: string;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

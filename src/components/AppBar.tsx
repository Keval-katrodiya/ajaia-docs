import Link from 'next/link';
import type { User } from '@/lib/types';
import { UserMenu } from './UserMenu';

export function AppBar({ user, children }: { user: User; children?: React.ReactNode }) {
  return (
    <header className="appbar">
      <Link href="/docs" className="brand">
        <span className="brand-mark" aria-hidden>
          ▤
        </span>
        Ajaia Docs
      </Link>
      {children}
      <span className="spacer" />
      <UserMenu user={user} />
    </header>
  );
}

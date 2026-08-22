'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import type { User } from '@/lib/types';
import { Avatar } from './Avatar';

export function UserMenu({ user }: { user: User }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useCloseOnOutsideClick(container, () => setOpen(false), open);

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <div ref={container} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: 3, height: 34 }}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar user={user} />
        <span className="sr-only">Account menu for {user.name}</span>
      </button>

      {open && (
        <div className="menu" role="menu">
          <div style={{ padding: '7px 9px' }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{user.name}</div>
            <div className="faint truncate">{user.email}</div>
          </div>
          <div className="menu-sep" />
          <button type="button" role="menuitem" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Shared by every popover in the app: click-away and Escape both close it. */
export function useCloseOnOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;

    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, onClose, active]);
}

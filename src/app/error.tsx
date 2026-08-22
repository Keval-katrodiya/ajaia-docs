'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ui] render error', error);
  }, [error]);

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20 }}>
      <div className="card" style={{ maxWidth: 460, padding: 30 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 19 }}>Something went wrong</h1>
        <p className="muted" style={{ margin: '0 0 6px' }}>
          The page could not be displayed. Your saved work is not affected.
        </p>
        <p className="faint" style={{ margin: '0 0 20px' }}>
          If this is a fresh clone, the database may not be seeded yet — stop the server and run{' '}
          <code>npm run seed</code>.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/docs" className="btn">
            Back to documents
          </Link>
        </div>
      </div>
    </main>
  );
}

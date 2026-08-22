import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20 }}>
      <div className="card" style={{ maxWidth: 420, padding: 30, textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 19 }}>Document not found</h1>
        <p className="muted" style={{ margin: '0 0 20px' }}>
          It may have been deleted, or you may not have access to it. If you expected access, ask
          the owner to share it with you.
        </p>
        <Link href="/docs" className="btn btn-primary">
          Back to documents
        </Link>
      </div>
    </main>
  );
}

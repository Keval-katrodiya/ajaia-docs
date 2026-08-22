import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { listUsers } from '@/lib/users';
import { SignInForm } from '@/components/SignInForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/docs');

  // Reading the seeded directory here (rather than in the client) keeps the
  // demo account list out of a public API.
  const users = listUsers();

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: 30 }}>
        <div className="row" style={{ gap: 10, marginBottom: 18 }}>
          <span className="brand-mark" aria-hidden>
            ▤
          </span>
          <div>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>Ajaia Docs</h1>
            <p className="faint" style={{ margin: 0 }}>
              Write together. Share in one click.
            </p>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="alert alert-error">
            <strong>No accounts found.</strong>
            <p style={{ margin: '6px 0 0' }}>
              The database has not been seeded yet. Stop the server and run{' '}
              <code>npm run seed</code>, then reload this page.
            </p>
          </div>
        ) : (
          <SignInForm users={users} />
        )}
      </div>
    </main>
  );
}

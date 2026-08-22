import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppBar } from '@/components/AppBar';
import { Avatar } from '@/components/Avatar';
import { DocumentActions } from '@/components/DocumentActions';
import { listForUser, type DocumentSummary } from '@/lib/documents';
import { roleLabel } from '@/lib/permissions';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DocsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { owned, shared } = listForUser(user.id);

  return (
    <>
      <AppBar user={user} />
      <div className="page">
        <h1 className="page-title">Documents</h1>
        <p className="page-sub">
          Everything you own, plus everything other people have shared with you.
        </p>

        <DocumentActions />

        <h2 className="section-title">
          Your documents <span className="badge">{owned.length}</span>
        </h2>
        {owned.length > 0 ? (
          <div className="doc-grid">
            {owned.map((doc) => (
              <DocCard key={doc.id} doc={doc} showOwner={false} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <h3>No documents yet</h3>
            <p>Create a blank document, or import a .txt, .md or .docx file to get started.</p>
          </div>
        )}

        <h2 className="section-title">
          Shared with you <span className="badge">{shared.length}</span>
        </h2>
        {shared.length > 0 ? (
          <div className="doc-grid">
            {shared.map((doc) => (
              <DocCard key={doc.id} doc={doc} showOwner />
            ))}
          </div>
        ) : (
          <div className="empty">
            <h3>Nothing shared with you</h3>
            <p>
              When someone gives you access to a document, it shows up here — with a badge saying
              whether you can edit it or only read it.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Server-rendered so the list needs no client JavaScript at all. The owner
 * avatar is the visible distinction between owned and shared documents, backed
 * up by the section heading and the role badge.
 */
function DocCard({ doc, showOwner }: { doc: DocumentSummary; showOwner: boolean }) {
  return (
    <Link href={`/docs/${doc.id}`} className="doc-card">
      <h3>{doc.title}</h3>
      <p>{doc.preview || 'Empty document'}</p>
      <footer>
        {showOwner ? (
          <>
            <Avatar user={doc.owner} />
            <span className="grow truncate">{doc.owner.name}</span>
            <span className={doc.role === 'editor' ? 'badge badge-accent' : 'badge'}>
              {roleLabel(doc.role)}
            </span>
          </>
        ) : (
          <>
            <span className="grow truncate">{formatDate(doc.updatedAt)}</span>
            {doc.shareCount > 0 && (
              <span className="badge badge-accent">
                Shared with {doc.shareCount}
              </span>
            )}
          </>
        )}
      </footer>
    </Link>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return `Edited ${date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

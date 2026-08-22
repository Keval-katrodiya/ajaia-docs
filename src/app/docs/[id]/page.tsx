import { notFound, redirect } from 'next/navigation';
import { AppBar } from '@/components/AppBar';
import { EditorShell } from '@/components/EditorShell';
import { getAcl, getDocumentRow, listImports, listShares, parseContent } from '@/lib/documents';
import { accessRole, canEdit, canManageShares, canView } from '@/lib/permissions';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/docs/${id}`)}`);

  const row = getDocumentRow(id);
  const acl = row ? getAcl(id) : null;

  // No access and does-not-exist deliberately look identical, so the page
  // cannot be used to probe for document IDs.
  if (!row || !acl || !canView(acl, user.id)) notFound();

  const owner = canManageShares(acl, user.id);
  const imports = listImports(id);

  return (
    <>
      <AppBar user={user} />
      <EditorShell
        initial={{
          id: row.id,
          title: row.title,
          content: parseContent(row),
          rev: row.rev,
          role: accessRole(acl, user.id)!,
          canEdit: canEdit(acl, user.id),
          canShare: owner,
          shareCount: owner ? listShares(id).length : 0,
          lastImport: imports[0]
            ? { filename: imports[0].filename, createdAt: imports[0].createdAt }
            : null,
        }}
      />
    </>
  );
}

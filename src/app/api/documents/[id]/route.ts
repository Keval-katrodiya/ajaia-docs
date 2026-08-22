import type { NextRequest } from 'next/server';
import { conflict, ok, route } from '@/lib/api';
import { requireEditAccess, requireOwnerAccess, requireViewAccess } from '@/lib/access';
import { deleteDocument, listImports, listShares, parseContent, updateDocument } from '@/lib/documents';
import { canEdit, canManageShares } from '@/lib/permissions';
import { sanitizeDoc } from '@/lib/richtext';
import { updateDocumentSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: NextRequest, { params }: Params) => {
  const { id } = await params;
  const { user, document, acl, role } = await requireViewAccess(id);

  return ok({
    id: document.id,
    title: document.title,
    content: parseContent(document),
    rev: document.rev,
    updatedAt: document.updated_at,
    role,
    can: {
      edit: canEdit(acl, user.id),
      share: canManageShares(acl, user.id),
      delete: canManageShares(acl, user.id),
    },
    // Only the owner needs the full collaborator list; a viewer seeing every
    // other person's email would be an unnecessary disclosure.
    shares: canManageShares(acl, user.id) ? listShares(id) : [],
    imports: listImports(id),
  });
});

export const PATCH = route(async (request: NextRequest, { params }: Params) => {
  const { id } = await params;
  const { user } = await requireEditAccess(id);
  const body = updateDocumentSchema.parse(await request.json());

  const result = updateDocument({
    id,
    userId: user.id,
    title: body.title?.trim(),
    content: body.content ? sanitizeDoc(body.content) : undefined,
    baseRev: body.baseRev,
  });

  if (result.status === 'not_found') {
    // Deleted between the access check and the write.
    return ok({ deleted: true }, 410);
  }

  if (result.status === 'conflict') {
    throw conflict(
      'Someone else saved this document while you were editing. Reload to get their changes.',
      { currentRev: result.currentRev },
    );
  }

  return ok({
    id: result.row.id,
    title: result.row.title,
    rev: result.row.rev,
    updatedAt: result.row.updated_at,
  });
});

export const DELETE = route(async (_request: NextRequest, { params }: Params) => {
  const { id } = await params;
  await requireOwnerAccess(id);
  deleteDocument(id); // Shares and import records cascade.
  return ok({ ok: true });
});

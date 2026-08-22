import type { NextRequest } from 'next/server';
import { notFound, ok, route } from '@/lib/api';
import { requireOwnerAccess } from '@/lib/access';
import { listShares, removeShare, upsertShare } from '@/lib/documents';
import { updateShareSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; shareId: string }> };

export const PATCH = route(async (request: NextRequest, { params }: Params) => {
  const { id, shareId } = await params;
  await requireOwnerAccess(id);
  const { role } = updateShareSchema.parse(await request.json());

  const existing = listShares(id).find((s) => s.id === shareId);
  if (!existing) throw notFound('That person no longer has access to this document.');

  const share = upsertShare({ documentId: id, userId: existing.user.id, role });
  return ok({ share });
});

export const DELETE = route(async (_request: NextRequest, { params }: Params) => {
  const { id, shareId } = await params;
  await requireOwnerAccess(id);

  if (!removeShare(id, shareId)) {
    throw notFound('That share has already been removed.');
  }
  return ok({ ok: true });
});

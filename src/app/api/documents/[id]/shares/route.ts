import type { NextRequest } from 'next/server';
import { invalid, ok, route } from '@/lib/api';
import { requireOwnerAccess } from '@/lib/access';
import { listShares, upsertShare } from '@/lib/documents';
import { validateShareTarget } from '@/lib/permissions';
import { getUserByEmail } from '@/lib/users';
import { createShareSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: NextRequest, { params }: Params) => {
  const { id } = await params;
  await requireOwnerAccess(id);
  return ok({ shares: listShares(id) });
});

export const POST = route(async (request: NextRequest, { params }: Params) => {
  const { id } = await params;
  const { acl } = await requireOwnerAccess(id);
  const body = createShareSchema.parse(await request.json());

  const target = getUserByEmail(body.email);
  if (!target) {
    // No invitations in this scope - you can only share with a seeded account.
    // Say that outright instead of silently succeeding.
    throw invalid(`No account for ${body.email}. In this demo you can only share with seeded users.`);
  }

  const check = validateShareTarget(acl, target.id);
  if (!check.ok) throw invalid(check.reason);

  const share = upsertShare({ documentId: id, userId: target.id, role: body.role });
  return ok({ share }, 201);
});

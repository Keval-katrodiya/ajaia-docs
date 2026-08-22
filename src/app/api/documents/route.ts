import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/api';
import { createDocument, listForUser } from '@/lib/documents';
import { sanitizeDoc } from '@/lib/richtext';
import { requireUser } from '@/lib/session';
import { createDocumentSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Split rather than flat, so the UI never has to derive ownership client-side. */
export const GET = route(async () => {
  const user = await requireUser();
  return ok(listForUser(user.id));
});

export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  const body = createDocumentSchema.parse(await safeJson(request));

  const row = createDocument({
    ownerId: user.id,
    title: body.title?.trim() || 'Untitled document',
    content: body.content ? sanitizeDoc(body.content) : undefined,
  });

  return ok({ id: row.id, title: row.title, rev: row.rev }, 201);
});

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {}; // "New document" posts an empty body; that is valid.
  }
}

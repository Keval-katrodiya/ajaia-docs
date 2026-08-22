import { ok, route } from '@/lib/api';
import { destroySession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async () => {
  await destroySession();
  return ok({ ok: true });
});

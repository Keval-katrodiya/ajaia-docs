import { ok, route } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { listUsers } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Powers the share dialog's people picker. Only names and emails are exposed,
 * and only to a signed-in user - this is the seeded-directory equivalent of a
 * workspace member list.
 */
export const GET = route(async () => {
  const me = await requireUser();
  const users = listUsers().filter((u) => u.id !== me.id);
  return ok({ users });
});

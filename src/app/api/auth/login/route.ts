import type { NextRequest } from 'next/server';
import { ok, route, invalid } from '@/lib/api';
import { createSession } from '@/lib/session';
import { getUserByEmail } from '@/lib/users';
import { loginSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (request: NextRequest) => {
  const { email } = loginSchema.parse(await request.json());
  const user = getUserByEmail(email);

  // Demo auth: accounts are seeded, not self-registered. Saying so beats a
  // vague "invalid credentials" for a reviewer trying to get in.
  if (!user) {
    throw invalid('No seeded account with that email. Pick one of the demo users on the sign-in screen.');
  }

  await createSession(user.id);
  return ok({ user });
});

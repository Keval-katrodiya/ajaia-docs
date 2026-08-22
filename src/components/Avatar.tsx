import { initials, type User } from '@/lib/types';

export function Avatar({
  user,
  size = 'md',
}: {
  user: Pick<User, 'name' | 'accent'>;
  size?: 'md' | 'lg';
}) {
  return (
    <span
      className={size === 'lg' ? 'avatar avatar-lg' : 'avatar'}
      style={{ background: user.accent }}
      title={user.name}
      aria-hidden
    >
      {initials(user.name)}
    </span>
  );
}

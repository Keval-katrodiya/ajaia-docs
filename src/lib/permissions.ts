/**
 * Access control.
 *
 * Deliberately pure: no database, no request, no session. Every rule in the
 * product is decided here, which means the whole permission model is covered
 * by fast unit tests (see tests/permissions.test.ts).
 *
 * The model is intentionally small - three roles, one resource:
 *
 *                    view   edit   rename   import   share   delete
 *   owner             y      y       y        y        y       y
 *   editor            y      y       y        y        -       -
 *   viewer            y      -       -        -        -       -
 *   (no access)       -      -       -        -        -       -
 *
 * "editor can rename but not share" is the one judgement call worth naming:
 * renaming is content-shaped work, granting access is an ownership decision.
 */

export type ShareRole = 'viewer' | 'editor';
export type AccessRole = 'owner' | ShareRole;

export interface DocumentAcl {
  ownerId: string;
  shares: ReadonlyArray<{ userId: string; role: ShareRole }>;
}

export const SHARE_ROLES: readonly ShareRole[] = ['viewer', 'editor'];

export function isShareRole(value: unknown): value is ShareRole {
  return value === 'viewer' || value === 'editor';
}

/**
 * The single source of truth for "what is this user to this document?".
 * Returns null when the user has no access at all.
 *
 * Ownership always wins: if an owner somehow also appears in the share table,
 * they keep owner rights rather than being downgraded.
 */
export function accessRole(acl: DocumentAcl, userId: string | null | undefined): AccessRole | null {
  if (!userId) return null;
  if (acl.ownerId === userId) return 'owner';

  const share = acl.shares.find((s) => s.userId === userId);
  if (!share) return null;

  // Guard against a bad row in the DB widening someone's access.
  return isShareRole(share.role) ? share.role : 'viewer';
}

export function canView(acl: DocumentAcl, userId: string | null | undefined): boolean {
  return accessRole(acl, userId) !== null;
}

export function canEdit(acl: DocumentAcl, userId: string | null | undefined): boolean {
  const role = accessRole(acl, userId);
  return role === 'owner' || role === 'editor';
}

/** Renaming and importing-into-a-doc are both content edits. */
export const canRename = canEdit;
export const canImportInto = canEdit;

export function canManageShares(acl: DocumentAcl, userId: string | null | undefined): boolean {
  return accessRole(acl, userId) === 'owner';
}

export function canDelete(acl: DocumentAcl, userId: string | null | undefined): boolean {
  return accessRole(acl, userId) === 'owner';
}

/** Everyone who can open a document can export it. */
export const canExport = canView;

/**
 * A share is only meaningful if it targets someone other than the owner.
 * Returned as a reason string so the API can surface it verbatim.
 */
export function validateShareTarget(
  acl: DocumentAcl,
  targetUserId: string,
): { ok: true } | { ok: false; reason: string } {
  if (targetUserId === acl.ownerId) {
    return { ok: false, reason: 'You already own this document.' };
  }
  return { ok: true };
}

/** Human-readable label used in the UI. */
export function roleLabel(role: AccessRole | null): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'editor':
      return 'Can edit';
    case 'viewer':
      return 'Can view';
    default:
      return 'No access';
  }
}

import { describe, expect, it } from 'vitest';
import {
  accessRole,
  canDelete,
  canEdit,
  canExport,
  canManageShares,
  canView,
  roleLabel,
  validateShareTarget,
  type DocumentAcl,
} from '@/lib/permissions';

/**
 * The access matrix is the part of this app where a bug is silent and
 * expensive: nobody notices a viewer who can edit until they have edited.
 * So the whole table is asserted explicitly rather than spot-checked.
 */

const OWNER = 'usr_owner';
const EDITOR = 'usr_editor';
const VIEWER = 'usr_viewer';
const STRANGER = 'usr_stranger';

const acl: DocumentAcl = {
  ownerId: OWNER,
  shares: [
    { userId: EDITOR, role: 'editor' },
    { userId: VIEWER, role: 'viewer' },
  ],
};

describe('accessRole', () => {
  it('resolves each kind of relationship to a document', () => {
    expect(accessRole(acl, OWNER)).toBe('owner');
    expect(accessRole(acl, EDITOR)).toBe('editor');
    expect(accessRole(acl, VIEWER)).toBe('viewer');
    expect(accessRole(acl, STRANGER)).toBeNull();
  });

  it('treats a missing user as no access rather than throwing', () => {
    expect(accessRole(acl, null)).toBeNull();
    expect(accessRole(acl, undefined)).toBeNull();
    expect(accessRole(acl, '')).toBeNull();
  });

  it('keeps owner rights even if the owner also has a share row', () => {
    const withSelfShare: DocumentAcl = {
      ownerId: OWNER,
      shares: [{ userId: OWNER, role: 'viewer' }],
    };
    expect(accessRole(withSelfShare, OWNER)).toBe('owner');
    expect(canEdit(withSelfShare, OWNER)).toBe(true);
  });

  it('degrades an unrecognised role to viewer instead of widening access', () => {
    const corrupt = {
      ownerId: OWNER,
      shares: [{ userId: EDITOR, role: 'admin' as unknown as 'editor' }],
    };
    expect(accessRole(corrupt, EDITOR)).toBe('viewer');
    expect(canEdit(corrupt, EDITOR)).toBe(false);
  });
});

describe('the permission matrix', () => {
  const table = [
    { who: 'owner', id: OWNER, view: true, edit: true, share: true, del: true },
    { who: 'editor', id: EDITOR, view: true, edit: true, share: false, del: false },
    { who: 'viewer', id: VIEWER, view: true, edit: false, share: false, del: false },
    { who: 'stranger', id: STRANGER, view: false, edit: false, share: false, del: false },
  ];

  for (const row of table) {
    it(`${row.who}: view=${row.view} edit=${row.edit} share=${row.share} delete=${row.del}`, () => {
      expect(canView(acl, row.id)).toBe(row.view);
      expect(canEdit(acl, row.id)).toBe(row.edit);
      expect(canManageShares(acl, row.id)).toBe(row.share);
      expect(canDelete(acl, row.id)).toBe(row.del);
      // Anyone who can read it on screen can already copy it, so export
      // tracks view rather than edit.
      expect(canExport(acl, row.id)).toBe(row.view);
    });
  }
});

describe('validateShareTarget', () => {
  it('refuses to share a document with its own owner', () => {
    const result = validateShareTarget(acl, OWNER);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/already own/i);
  });

  it('allows sharing with anyone else', () => {
    expect(validateShareTarget(acl, STRANGER).ok).toBe(true);
    // Re-sharing with an existing collaborator is a role change, not an error.
    expect(validateShareTarget(acl, VIEWER).ok).toBe(true);
  });
});

describe('roleLabel', () => {
  it('gives every role user-facing copy', () => {
    expect(roleLabel('owner')).toBe('Owner');
    expect(roleLabel('editor')).toBe('Can edit');
    expect(roleLabel('viewer')).toBe('Can view');
    expect(roleLabel(null)).toBe('No access');
  });
});

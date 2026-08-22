/**
 * The bridge between "who is asking" (session) and "what may they do"
 * (permissions). Route handlers call one of these and get either a loaded
 * document plus the caller's role, or a thrown ApiError.
 *
 * Keeping this in one place is what makes it hard to add an endpoint that
 * forgets to check access.
 */

import { forbidden, notFound } from './errors';
import { getAcl, getDocumentRow, type DocumentRow } from './documents';
import { accessRole, canEdit, canManageShares, canView, type AccessRole, type DocumentAcl } from './permissions';
import { requireUser } from './session';
import type { User } from './types';

export interface DocumentContext {
  user: User;
  document: DocumentRow;
  acl: DocumentAcl;
  role: AccessRole;
}

async function load(documentId: string): Promise<{ user: User; document: DocumentRow; acl: DocumentAcl }> {
  const user = await requireUser();
  const document = getDocumentRow(documentId);
  const acl = document ? getAcl(documentId) : null;

  // A document the caller cannot see reports 404, not 403. Returning 403 would
  // confirm the document exists to someone with no right to know that.
  if (!document || !acl || !canView(acl, user.id)) throw notFound('Document not found.');

  return { user, document, acl };
}

export async function requireViewAccess(documentId: string): Promise<DocumentContext> {
  const { user, document, acl } = await load(documentId);
  return { user, document, acl, role: accessRole(acl, user.id)! };
}

export async function requireEditAccess(documentId: string): Promise<DocumentContext> {
  const context = await requireViewAccess(documentId);
  if (!canEdit(context.acl, context.user.id)) {
    throw forbidden('You have view-only access to this document.');
  }
  return context;
}

export async function requireOwnerAccess(documentId: string): Promise<DocumentContext> {
  const context = await requireViewAccess(documentId);
  if (!canManageShares(context.acl, context.user.id)) {
    throw forbidden('Only the document owner can change sharing.');
  }
  return context;
}

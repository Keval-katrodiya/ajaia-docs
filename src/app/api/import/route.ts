import type { NextRequest } from 'next/server';
import { conflict, invalid, ok, route } from '@/lib/api';
import { requireEditAccess } from '@/lib/access';
import { createDocument, parseContent, recordImport, updateDocument } from '@/lib/documents';
import { appendToDoc, convertFile } from '@/lib/file-import';
import { inferTitle, sanitizeDoc } from '@/lib/richtext';
import { requireUser } from '@/lib/session';
import { importModeSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Upload a .txt / .md / .docx file and turn it into editable content.
 *
 *   mode=new      create a new document from the file      (default)
 *   mode=append   add the file to the end of a document
 *   mode=replace  swap a document's contents for the file
 *
 * Append and replace both require edit access to the target document, checked
 * before a single byte is parsed.
 */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw invalid('Expected a multipart form upload.');
  }

  const file = form.get('file');
  if (!(file instanceof File)) throw invalid('Choose a file to upload.');

  const mode = importModeSchema.parse(form.get('mode') ?? 'new');
  const documentId = typeof form.get('documentId') === 'string' ? String(form.get('documentId')) : null;

  if (mode !== 'new' && !documentId) {
    throw invalid('A target document is required to append or replace.');
  }

  // Access check first: never parse an untrusted file on behalf of someone who
  // is not allowed to write to the destination.
  if (mode !== 'new' && documentId) await requireEditAccess(documentId);

  const buffer = Buffer.from(await file.arrayBuffer());
  const { doc, extension, warnings } = await convertFile(file.name, buffer);
  const imported = sanitizeDoc(doc);

  if (mode === 'new') {
    const fallback = file.name.replace(/\.[^.]+$/, '') || 'Imported document';
    const row = createDocument({
      ownerId: user.id,
      title: inferTitle(imported, fallback),
      content: imported,
    });
    recordImport({
      documentId: row.id,
      userId: user.id,
      filename: file.name,
      extension,
      bytes: buffer.byteLength,
      mode,
    });
    return ok({ documentId: row.id, title: row.title, rev: row.rev, warnings }, 201);
  }

  const { document } = await requireEditAccess(documentId!);
  const next = mode === 'append' ? appendToDoc(parseContent(document), imported) : imported;

  const result = updateDocument({
    id: document.id,
    userId: user.id,
    content: next,
    baseRev: document.rev,
  });

  if (result.status === 'conflict') {
    throw conflict('This document changed while the file was uploading. Reload and try again.');
  }
  if (result.status === 'not_found') {
    throw invalid('That document no longer exists.');
  }

  recordImport({
    documentId: document.id,
    userId: user.id,
    filename: file.name,
    extension,
    bytes: buffer.byteLength,
    mode,
  });

  return ok({ documentId: document.id, title: result.row.title, rev: result.row.rev, warnings });
});

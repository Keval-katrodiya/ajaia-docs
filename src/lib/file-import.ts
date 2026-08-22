/**
 * File import.
 *
 * One pipeline, three entry points. Every supported format is normalised to
 * HTML (except plain text, which skips a pointless round-trip) and then run
 * through the same htmlToDoc converter the rest of the app uses. Adding a
 * format later means adding one case here, not a new code path.
 *
 *   .txt   ------------------------> plainTextToDoc ---.
 *   .md    --[ marked ]--> HTML --.                     +--> ProseMirror JSON
 *   .docx  --[ mammoth ]-> HTML --+--> htmlToDoc -------'
 *
 * Unsupported types are rejected with the accepted list in the message, so the
 * user never has to guess what went wrong.
 */

import { ACCEPTED_IMPORT_EXTENSIONS, ACCEPTED_IMPORT_LABEL, MAX_UPLOAD_BYTES } from './constants';
import { ApiError, invalid } from './errors';
import { htmlToDoc, plainTextToDoc, type PmDoc } from './richtext';

/**
 * Mammoth throws away underline and strikethrough by default - its reasoning
 * is that Word authors often use underline to mean something else. That is a
 * fair default for a generic converter and the wrong one for us: underline is
 * one of the formatting options this editor advertises, so a .docx that has it
 * must keep it. Found by importing a real .docx and diffing the marks.
 */
const DOCX_STYLE_MAP = ['u => u', 'strike => s'];

export interface ImportResult {
  doc: PmDoc;
  extension: string;
  /** Non-fatal notes shown to the user after import, e.g. dropped images. */
  warnings: string[];
}

export function extensionOf(filename: string): string {
  const match = /\.[^.]+$/.exec(filename.toLowerCase().trim());
  return match ? match[0] : '';
}

export function assertSupported(filename: string, bytes: number): string {
  const extension = extensionOf(filename);

  if (!(ACCEPTED_IMPORT_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new ApiError(
      'unsupported_media_type',
      extension
        ? `${extension} files are not supported. Upload ${ACCEPTED_IMPORT_LABEL}.`
        : `That file has no extension. Upload ${ACCEPTED_IMPORT_LABEL}.`,
    );
  }

  if (bytes <= 0) {
    throw invalid('That file is empty.');
  }

  if (bytes > MAX_UPLOAD_BYTES) {
    throw new ApiError(
      'payload_too_large',
      `That file is ${formatBytes(bytes)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    );
  }

  return extension;
}

export async function convertFile(filename: string, buffer: Buffer): Promise<ImportResult> {
  const extension = assertSupported(filename, buffer.byteLength);
  const warnings: string[] = [];

  if (extension === '.txt') {
    return { doc: plainTextToDoc(buffer.toString('utf8')), extension, warnings };
  }

  if (extension === '.md' || extension === '.markdown') {
    const { marked } = await import('marked');
    const html = marked.parse(buffer.toString('utf8'), { async: false, gfm: true }) as string;
    return { doc: htmlToDoc(html), extension, warnings };
  }

  // .docx
  const mammoth = await import('mammoth');
  let html: string;
  try {
    const result = await mammoth.convertToHtml({ buffer }, { styleMap: DOCX_STYLE_MAP });
    html = result.value;
    // Mammoth reports style mappings it could not honour. Surface the useful
    // ones rather than pretending the import was lossless.
    if (result.messages.some((m) => m.type === 'warning')) {
      warnings.push('Some Word styles were simplified to the formatting this editor supports.');
    }
  } catch {
    throw invalid('That .docx file could not be read. It may be corrupt or password protected.');
  }

  if (/<img/i.test(html)) {
    warnings.push('Images were removed - this editor does not support inline images yet.');
  }

  return { doc: htmlToDoc(html), extension, warnings };
}

/** Appends imported blocks to the end of an existing document. */
export function appendToDoc(base: PmDoc, incoming: PmDoc): PmDoc {
  const baseContent = (base.content ?? []).filter(
    // Drop a single trailing empty paragraph so the join does not leave a gap.
    (node, index, all) =>
      !(index === all.length - 1 && node.type === 'paragraph' && !node.content?.length),
  );
  return { type: 'doc', content: [...baseContent, ...(incoming.content ?? [])] };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

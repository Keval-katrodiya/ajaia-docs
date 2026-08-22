import type { NextRequest } from 'next/server';
import { invalid, route } from '@/lib/api';
import { requireViewAccess } from '@/lib/access';
import { parseContent } from '@/lib/documents';
import { docToHtml, docToMarkdown, docToText, escapeHtml, opensWithTitle } from '@/lib/richtext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const FORMATS = {
  md: { extension: 'md', mime: 'text/markdown; charset=utf-8' },
  html: { extension: 'html', mime: 'text/html; charset=utf-8' },
  txt: { extension: 'txt', mime: 'text/plain; charset=utf-8' },
} as const;

type Format = keyof typeof FORMATS;

/**
 * Export is available to anyone who can open the document, including viewers -
 * if you can read it on screen you can already copy it, so withholding a
 * download would be theatre rather than security.
 */
export const GET = route(async (request: NextRequest, { params }: Params) => {
  const { id } = await params;
  const { document } = await requireViewAccess(id);

  const requested = (new URL(request.url).searchParams.get('format') ?? 'md') as Format;
  if (!(requested in FORMATS)) {
    throw invalid(`Unknown export format "${requested}". Use md, html, or txt.`);
  }

  const doc = parseContent(document);
  const config = FORMATS[requested];

  // Imported documents usually take their title from their own first heading.
  // Prepending it again would print it twice.
  const repeatsTitle = opensWithTitle(doc, document.title);

  let body: string;
  if (requested === 'md') {
    body = repeatsTitle ? docToMarkdown(doc) : `# ${document.title}\n\n${docToMarkdown(doc)}`;
  } else if (requested === 'html') {
    body = htmlDocument(document.title, docToHtml(doc), repeatsTitle);
  } else {
    body = repeatsTitle ? `${docToText(doc)}\n` : `${document.title}\n\n${docToText(doc)}\n`;
  }

  return new Response(body, {
    headers: {
      'Content-Type': config.mime,
      'Content-Disposition': `attachment; filename="${safeFilename(document.title)}.${config.extension}"`,
    },
  });
});

function htmlDocument(title: string, body: string, bodyHasTitle: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { max-width: 42rem; margin: 3rem auto; padding: 0 1.5rem;
         font: 16px/1.7 -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2430; }
  h1, h2, h3 { line-height: 1.25; margin: 2rem 0 .75rem; }
  blockquote { margin: 1rem 0; padding-left: 1rem; border-left: 3px solid #d5d9e2; color: #545c6b; }
  pre { background: #f4f5f8; padding: 1rem; border-radius: 6px; overflow-x: auto; }
</style>
</head>
<body>
${bodyHasTitle ? '' : `<h1>${escapeHtml(title)}</h1>`}
${body}
</body>
</html>
`;
}

function safeFilename(title: string): string {
  const cleaned = title.replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/\s+/g, '-');
  return cleaned.slice(0, 60) || 'document';
}

/**
 * Rich-text core.
 *
 * Documents are stored as ProseMirror JSON (the format TipTap round-trips
 * natively), NOT as HTML. That choice is the reason import, export and
 * sanitisation are all straightforward: there is exactly one canonical
 * in-memory shape, and every format is a converter on either side of it.
 *
 *        .txt  ---.                                  .---> Markdown
 *        .md   ----+--> [ HTML ] --> ProseMirror --->+
 *        .docx ---'                    JSON           '---> HTML / plain text
 *                                        |
 *                                    (stored)
 *
 * Everything in this file is pure and dependency-light so it can be unit
 * tested without a browser, a database, or a running server.
 */

import {
  parse,
  NodeType,
  type HTMLElement,
  type Node as HtmlNode,
  type TextNode,
} from 'node-html-parser';

export interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: PmMark[];
}

export interface PmDoc {
  type: 'doc';
  content: PmNode[];
}

/**
 * The editor schema, mirrored here so the server can validate without loading
 * TipTap. Keep in sync with src/lib/editor-extensions.ts.
 */
export const ALLOWED_NODES = new Set([
  'paragraph',
  'heading',
  'text',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
]);

export const ALLOWED_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'code']);

export const ALLOWED_HEADING_LEVELS = [1, 2, 3] as const;

const MAX_DEPTH = 12;

export function emptyDoc(): PmDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/* -------------------------------------------------------------------------- */
/* Sanitising                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Accepts untrusted JSON from the client and returns a document guaranteed to
 * fit the editor schema.
 *
 * This is the security boundary for stored content. Because we only ever
 * persist whitelisted node and mark types - never raw HTML - a malicious
 * payload cannot smuggle a <script> or an event handler into another user's
 * browser through a shared document.
 *
 * Unknown nodes are dropped rather than rejected: a document that partially
 * survives a schema change beats an editor that refuses to open.
 */
export function sanitizeDoc(input: unknown): PmDoc {
  if (!isRecord(input) || input.type !== 'doc') {
    throw new Error('Document must be a ProseMirror doc node.');
  }

  const content = Array.isArray(input.content)
    ? (input.content.map((n) => sanitizeNode(n, 1)).filter(Boolean) as PmNode[])
    : [];

  // ProseMirror's schema requires at least one block node in the doc.
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

function sanitizeNode(input: unknown, depth: number): PmNode | null {
  if (depth > MAX_DEPTH || !isRecord(input) || typeof input.type !== 'string') return null;
  if (!ALLOWED_NODES.has(input.type)) return null;

  const node: PmNode = { type: input.type };

  if (input.type === 'text') {
    if (typeof input.text !== 'string' || input.text.length === 0) return null;
    node.text = input.text;
    const marks = sanitizeMarks(input.marks);
    if (marks.length > 0) node.marks = marks;
    return node;
  }

  if (input.type === 'heading') {
    const raw = isRecord(input.attrs) ? Number(input.attrs.level) : NaN;
    const level = (ALLOWED_HEADING_LEVELS as readonly number[]).includes(raw) ? raw : 1;
    node.attrs = { level };
  }

  if (Array.isArray(input.content)) {
    const content = input.content
      .map((child) => sanitizeNode(child, depth + 1))
      .filter(Boolean) as PmNode[];
    if (content.length > 0) node.content = content;
  }

  // A list with every child dropped is noise; a bare paragraph is legitimate.
  const needsContent = input.type === 'bulletList' || input.type === 'orderedList' || input.type === 'listItem';
  if (needsContent && !node.content) return null;

  return node;
}

function sanitizeMarks(input: unknown): PmMark[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: PmMark[] = [];
  for (const mark of input) {
    const type = isRecord(mark) ? mark.type : mark;
    if (typeof type === 'string' && ALLOWED_MARKS.has(type) && !seen.has(type)) {
      seen.add(type);
      out.push({ type });
    }
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/* -------------------------------------------------------------------------- */
/* HTML -> ProseMirror                                                         */
/* -------------------------------------------------------------------------- */

const INLINE_MARK_BY_TAG: Record<string, string> = {
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  u: 'underline',
  ins: 'underline',
  s: 'strike',
  del: 'strike',
  strike: 'strike',
  code: 'code',
};

/**
 * Converts an HTML fragment (from marked, from mammoth, or pasted) into a
 * schema-valid document. Unsupported tags are unwrapped rather than dropped,
 * so their text still survives the import.
 */
export function htmlToDoc(html: string): PmDoc {
  const root = parse(html ?? '', {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: { script: false, style: false, pre: true },
  });

  const blocks: PmNode[] = [];
  for (const child of root.childNodes) collectBlocks(child, blocks, 0);

  const content = blocks.filter((b) => !isEmptyBlock(b));
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

function collectBlocks(node: HtmlNode, out: PmNode[], depth: number): void {
  if (depth > MAX_DEPTH) return;

  if (isTextNode(node)) {
    const text = decodeEntities(node.rawText);
    if (text.trim().length > 0) out.push({ type: 'paragraph', content: [{ type: 'text', text: text.trim() }] });
    return;
  }
  if (!isElement(node)) return;

  const tag = node.rawTagName?.toLowerCase() ?? '';

  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      // We only expose H1-H3 in the toolbar, so deeper headings clamp down
      // rather than being demoted to body text and losing their emphasis.
      const level = Math.min(Number(tag.slice(1)), 3);
      const content = inlineChildren(node, []);
      out.push({ type: 'heading', attrs: { level }, content: content.length ? content : undefined });
      return;
    }
    case 'p': {
      const content = inlineChildren(node, []);
      out.push({ type: 'paragraph', content: content.length ? content : undefined });
      return;
    }
    case 'ul':
    case 'ol': {
      const items: PmNode[] = [];
      for (const li of node.childNodes) {
        if (!isElement(li) || li.rawTagName?.toLowerCase() !== 'li') continue;
        items.push(listItem(li, depth));
      }
      if (items.length > 0) {
        out.push({ type: tag === 'ul' ? 'bulletList' : 'orderedList', content: items });
      }
      return;
    }
    case 'blockquote': {
      const inner: PmNode[] = [];
      for (const child of node.childNodes) collectBlocks(child, inner, depth + 1);
      const content = inner.filter((b) => !isEmptyBlock(b));
      if (content.length > 0) out.push({ type: 'blockquote', content });
      return;
    }
    case 'pre': {
      const text = decodeEntities(node.rawText).replace(/\n$/, '');
      out.push({
        type: 'codeBlock',
        content: text.length > 0 ? [{ type: 'text', text }] : undefined,
      });
      return;
    }
    case 'hr': {
      out.push({ type: 'horizontalRule' });
      return;
    }
    case 'br': {
      return; // A <br> between blocks carries no meaning.
    }
    case 'script':
    case 'style':
    case 'head':
    case 'meta':
    case 'link': {
      return; // Never import executable or presentational-only content.
    }
    case 'table': {
      // Tables are out of scope for this editor. Flatten cells to paragraphs so
      // the words survive the import even though the grid does not.
      for (const cell of node.querySelectorAll('td, th')) {
        const content = inlineChildren(cell, []);
        if (content.length > 0) out.push({ type: 'paragraph', content });
      }
      return;
    }
    default: {
      // div, section, article, body, html, span-at-block-level, unknown tags:
      // unwrap and keep walking.
      const inline = inlineChildren(node, []);
      const hasBlockChild = node.childNodes.some(
        (c) => isElement(c) && BLOCK_TAGS.has(c.rawTagName?.toLowerCase() ?? ''),
      );
      if (hasBlockChild) {
        for (const child of node.childNodes) collectBlocks(child, out, depth + 1);
      } else if (inline.length > 0) {
        out.push({ type: 'paragraph', content: inline });
      }
    }
  }
}

const BLOCK_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li',
  'blockquote', 'pre', 'hr', 'div', 'section', 'article', 'table', 'body', 'html',
]);

function listItem(li: HTMLElement, depth: number): PmNode {
  const content: PmNode[] = [];
  const inline: PmNode[] = [];
  const nested: PmNode[] = [];

  for (const child of li.childNodes) {
    const tag = isElement(child) ? child.rawTagName?.toLowerCase() ?? '' : '';
    if (tag === 'ul' || tag === 'ol' || tag === 'p') {
      collectBlocks(child, nested, depth + 1);
    } else {
      inlineChildren(child, inline);
    }
  }

  // listItem's schema is `paragraph block*`, so the text always leads.
  const leadParagraph = nested.find((n) => n.type === 'paragraph');
  if (inline.length > 0) {
    content.push({ type: 'paragraph', content: inline });
  } else if (leadParagraph) {
    content.push(leadParagraph);
  } else {
    content.push({ type: 'paragraph' });
  }

  for (const node of nested) {
    if (node === leadParagraph && inline.length === 0) continue;
    if (node.type === 'paragraph' && inline.length > 0 && node === leadParagraph) continue;
    content.push(node);
  }

  return { type: 'listItem', content };
}

function inlineChildren(node: HtmlNode, out: PmNode[], marks: string[] = []): PmNode[] {
  if (isTextNode(node)) {
    const text = decodeEntities(node.rawText);
    if (text.length > 0) out.push(textNode(text, marks));
    return out;
  }
  if (!isElement(node)) return out;

  const tag = node.rawTagName?.toLowerCase() ?? '';

  if (tag === 'br') {
    out.push({ type: 'hardBreak' });
    return out;
  }
  if (tag === 'script' || tag === 'style') return out;

  const mark = INLINE_MARK_BY_TAG[tag];
  const nextMarks = mark && !marks.includes(mark) ? [...marks, mark] : marks;

  for (const child of node.childNodes) inlineChildren(child, out, nextMarks);
  return out;
}

function textNode(text: string, marks: string[]): PmNode {
  const node: PmNode = { type: 'text', text };
  if (marks.length > 0) node.marks = marks.map((type) => ({ type }));
  return node;
}

function isEmptyBlock(node: PmNode): boolean {
  if (node.type === 'horizontalRule') return false;
  if (node.type === 'paragraph') {
    if (!node.content || node.content.length === 0) return true;
    return node.content.every((c) => c.type === 'text' && (c.text ?? '').trim() === '');
  }
  return false;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

export function decodeEntities(input: string): string {
  return (input ?? '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

/* -------------------------------------------------------------------------- */
/* Plain text -> ProseMirror                                                   */
/* -------------------------------------------------------------------------- */

/** Blank line starts a new paragraph; a single newline becomes a soft break. */
export function plainTextToDoc(text: string): PmDoc {
  const chunks = (text ?? '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const content: PmNode[] = [];

  for (const chunk of chunks) {
    if (chunk.trim() === '') continue;
    const lines = chunk.split('\n');
    const inline: PmNode[] = [];
    lines.forEach((line, i) => {
      if (i > 0) inline.push({ type: 'hardBreak' });
      if (line.length > 0) inline.push({ type: 'text', text: line });
    });
    content.push({ type: 'paragraph', content: inline.length > 0 ? inline : undefined });
  }

  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

/* -------------------------------------------------------------------------- */
/* ProseMirror -> plain text / Markdown / HTML                                 */
/* -------------------------------------------------------------------------- */

/** Used for list previews and for the first-line title guess on import. */
export function docToText(doc: PmDoc | PmNode): string {
  const parts: string[] = [];
  walkText(doc as PmNode, parts);
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

function walkText(node: PmNode, out: string[]): void {
  if (node.type === 'text') {
    out.push(node.text ?? '');
    return;
  }
  if (node.type === 'hardBreak') {
    out.push('\n');
    return;
  }
  for (const child of node.content ?? []) walkText(child, out);
  if (BLOCK_LEVEL.has(node.type)) out.push('\n');
}

const BLOCK_LEVEL = new Set([
  'paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock', 'horizontalRule',
]);

const MARK_WRAPPER: Record<string, [string, string]> = {
  bold: ['**', '**'],
  italic: ['_', '_'],
  // Markdown has no underline. <u> keeps the intent and renders everywhere
  // that accepts inline HTML - documented in the export dialog.
  underline: ['<u>', '</u>'],
  strike: ['~~', '~~'],
  code: ['`', '`'],
};

export function docToMarkdown(doc: PmDoc): string {
  const lines: string[] = [];
  for (const node of doc.content ?? []) lines.push(blockToMarkdown(node, 0));
  return lines.filter((l) => l !== null).join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function blockToMarkdown(node: PmNode, indent: number): string {
  const pad = '  '.repeat(indent);
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1);
      return `${'#'.repeat(level)} ${inlineToMarkdown(node)}`;
    }
    case 'paragraph':
      return pad + inlineToMarkdown(node);
    case 'bulletList':
      return (node.content ?? [])
        .map((li) => `${pad}- ${listItemToMarkdown(li, indent)}`)
        .join('\n');
    case 'orderedList':
      return (node.content ?? [])
        .map((li, i) => `${pad}${i + 1}. ${listItemToMarkdown(li, indent)}`)
        .join('\n');
    case 'blockquote':
      return (node.content ?? [])
        .map((child) => blockToMarkdown(child, indent))
        .join('\n\n')
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    case 'codeBlock':
      return '```\n' + docToText(node) + '\n```';
    case 'horizontalRule':
      return '---';
    default:
      return pad + inlineToMarkdown(node);
  }
}

function listItemToMarkdown(li: PmNode, indent: number): string {
  const [first, ...rest] = li.content ?? [];
  const head = first ? blockToMarkdown(first, 0) : '';
  if (rest.length === 0) return head;
  const tail = rest.map((child) => blockToMarkdown(child, indent + 1)).join('\n');
  return `${head}\n${tail}`;
}

function inlineToMarkdown(node: PmNode): string {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === 'hardBreak') return '  \n';
      if (child.type !== 'text') return inlineToMarkdown(child);
      let text = child.text ?? '';
      for (const mark of child.marks ?? []) {
        const wrapper = MARK_WRAPPER[mark.type];
        if (wrapper) text = `${wrapper[0]}${text}${wrapper[1]}`;
      }
      return text;
    })
    .join('');
}

const HTML_TAG_BY_MARK: Record<string, string> = {
  bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code',
};

export function docToHtml(doc: PmDoc): string {
  return (doc.content ?? []).map(blockToHtml).join('\n');
}

function blockToHtml(node: PmNode): string {
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1);
      return `<h${level}>${inlineToHtml(node)}</h${level}>`;
    }
    case 'paragraph':
      return `<p>${inlineToHtml(node)}</p>`;
    case 'bulletList':
      return `<ul>\n${(node.content ?? []).map(blockToHtml).join('\n')}\n</ul>`;
    case 'orderedList':
      return `<ol>\n${(node.content ?? []).map(blockToHtml).join('\n')}\n</ol>`;
    case 'listItem':
      return `<li>${(node.content ?? []).map(blockToHtml).join('')}</li>`;
    case 'blockquote':
      return `<blockquote>${(node.content ?? []).map(blockToHtml).join('')}</blockquote>`;
    case 'codeBlock':
      return `<pre><code>${escapeHtml(docToText(node))}</code></pre>`;
    case 'horizontalRule':
      return '<hr />';
    default:
      return `<p>${inlineToHtml(node)}</p>`;
  }
}

function inlineToHtml(node: PmNode): string {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === 'hardBreak') return '<br />';
      if (child.type !== 'text') return inlineToHtml(child);
      let html = escapeHtml(child.text ?? '');
      for (const mark of child.marks ?? []) {
        const tag = HTML_TAG_BY_MARK[mark.type];
        if (tag) html = `<${tag}>${html}</${tag}>`;
      }
      return html;
    })
    .join('');
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* -------------------------------------------------------------------------- */
/* Helpers used by the API                                                     */
/* -------------------------------------------------------------------------- */

export function previewOf(doc: PmDoc, length = 160): string {
  const text = docToText(doc).replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

/**
 * True when the body already opens with a heading that says the same thing as
 * the document title.
 *
 * Export prepends the title so a downloaded file is self-describing - but an
 * imported document usually took its title FROM its first heading, so blindly
 * prepending prints it twice. Found by exporting a file that had just been
 * imported.
 *
 * The startsWith arm covers inferTitle()'s 80-character truncation.
 */
export function opensWithTitle(doc: PmDoc, title: string): boolean {
  const first = (doc.content ?? [])[0];
  if (!first || first.type !== 'heading') return false;

  const heading = docToText(first).trim().toLowerCase();
  const wanted = title.trim().toLowerCase();
  return heading === wanted || (wanted.length > 0 && heading.startsWith(wanted));
}

/** Best-effort title from imported content: a leading H1, else the first line. */
export function inferTitle(doc: PmDoc, fallback: string): string {
  const heading = (doc.content ?? []).find((n) => n.type === 'heading');
  const source = heading ?? (doc.content ?? [])[0];
  const text = source ? docToText(source).split('\n')[0]?.trim() : '';
  if (text && text.length > 0) return text.slice(0, 80);
  return fallback;
}

function isElement(node: HtmlNode): node is HTMLElement {
  return node.nodeType === NodeType.ELEMENT_NODE;
}

function isTextNode(node: HtmlNode): node is TextNode {
  return node.nodeType === NodeType.TEXT_NODE;
}

/** Utility node-type helpers are exported for tests. */
export const __internal = { isEmptyBlock, BLOCK_TAGS };

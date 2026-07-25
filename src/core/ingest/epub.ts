import JSZip from 'jszip';

import type { UnitKind } from '../db/schema';
import type { ParsedBlock, ParsedBook, ParsedChapter } from './units';

// Hand-rolled rather than delegated to an EPUB library: a library upgrade that
// changed whitespace or block detection would change every unit_id in the
// library. See docs/DECISIONS.md 008.

const CONTAINER_PATH = 'META-INF/container.xml';
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote';
const SKIP_ANCESTOR_SELECTOR =
  'nav, aside, footer, header, figure, figcaption, table';
const MIN_BLOCK_LENGTH = 2;

export class EpubParseError extends Error {}

function parseXml(source: string, mimeType: DOMParserSupportedType): Document {
  return new DOMParser().parseFromString(source, mimeType);
}

/**
 * Real-world EPUBs are not reliably well-formed XHTML. Try strict parsing
 * first, then fall back to the forgiving HTML parser.
 */
function parseContentDocument(source: string): Document {
  const strict = parseXml(source, 'application/xhtml+xml');
  if (!strict.querySelector('parsererror')) return strict;
  return parseXml(source, 'text/html');
}

function resolvePath(basePath: string, relative: string): string {
  const base = basePath.slice(0, basePath.lastIndexOf('/') + 1);
  const segments = `${base}${relative}`.split('/');
  const resolved: string[] = [];

  for (const segment of segments) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join('/');
}

function elementKind(tagName: string): UnitKind {
  if (/^h[1-6]$/.test(tagName)) return 'heading';
  if (tagName === 'li') return 'list_item';
  if (tagName === 'blockquote') return 'quote';
  return 'paragraph';
}

function extractBlocks(document: Document): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];

  for (const element of document.querySelectorAll(BLOCK_SELECTOR)) {
    // A blockquote wrapping a <p>, or an <li> wrapping a <p>, would otherwise
    // yield the same text twice. Keep the innermost block.
    if (element.querySelector(BLOCK_SELECTOR)) continue;
    if (element.parentElement?.closest(SKIP_ANCESTOR_SELECTOR)) continue;
    if (element.closest('[hidden]')) continue;

    const text = element.textContent ?? '';
    if (text.trim().length < MIN_BLOCK_LENGTH) continue;

    blocks.push({ kind: elementKind(element.tagName.toLowerCase()), text });
  }

  return blocks;
}

async function readText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new EpubParseError(`missing entry: ${path}`);
  return file.async('string');
}

async function findOpfPath(zip: JSZip): Promise<string> {
  const container = parseXml(
    await readText(zip, CONTAINER_PATH),
    'application/xml',
  );
  const fullPath = container
    .querySelector('rootfile')
    ?.getAttribute('full-path');
  if (!fullPath) throw new EpubParseError('container.xml has no rootfile');
  return fullPath;
}

export async function parseEpub(
  bytes: ArrayBuffer | Uint8Array,
  fallbackTitle: string,
): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(bytes);
  const opfPath = await findOpfPath(zip);
  const opf = parseXml(await readText(zip, opfPath), 'application/xml');

  const title =
    opf.getElementsByTagName('dc:title')[0]?.textContent?.trim() ||
    fallbackTitle;
  const author =
    opf.getElementsByTagName('dc:creator')[0]?.textContent?.trim() || null;

  const hrefById = new Map<string, string>();
  for (const item of opf.querySelectorAll('manifest > item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type') ?? '';
    if (!id || !href) continue;
    if (!/xhtml|html/.test(mediaType)) continue;
    hrefById.set(id, resolvePath(opfPath, href));
  }

  const chapters: ParsedChapter[] = [];
  for (const itemref of opf.querySelectorAll('spine > itemref')) {
    if (itemref.getAttribute('linear') === 'no') continue;

    const path = hrefById.get(itemref.getAttribute('idref') ?? '');
    if (!path) continue;

    const document = parseContentDocument(await readText(zip, path));
    const blocks = extractBlocks(document);
    if (blocks.length === 0) continue;

    const heading = blocks.find((block) => block.kind === 'heading');
    chapters.push({
      title: heading?.text.trim() ?? document.title?.trim() ?? null,
      blocks,
    });
  }

  if (chapters.length === 0) {
    throw new EpubParseError('no readable content found in spine');
  }

  return { title, author, chapters };
}

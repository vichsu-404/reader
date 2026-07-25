import JSZip from 'jszip';

// Shared by unit tests and the Playwright harness, so neither needs a binary
// fixture committed to the repo.

export interface FixtureChapter {
  href: string;
  title: string;
  paragraphs: string[];
}

export interface FixtureOptions {
  title?: string;
  author?: string;
  chapters?: FixtureChapter[];
}

export const DEFAULT_FIXTURE_CHAPTERS: FixtureChapter[] = [
  {
    href: 'ch1.xhtml',
    title: 'Chapter One',
    paragraphs: [
      'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
      'However little known the feelings or views of such a man may be on his first entering a neighbourhood.',
    ],
  },
  {
    href: 'ch2.xhtml',
    title: 'Chapter Two',
    paragraphs: [
      'Mr. Bennet was among the earliest of those who waited on Mr. Bingley.',
      'He had always intended to visit him, though to the last always assuring his wife that he should not go.',
    ],
  },
];

function chapterXhtml(chapter: FixtureChapter): string {
  const body = chapter.paragraphs.map((p) => `    <p>${p}</p>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${chapter.title}</title></head>
  <body>
    <h1>${chapter.title}</h1>
${body}
    <nav epub:type="toc"><ol><li><a href="#skip">Skipped navigation</a></li></ol></nav>
    <footer><p>Skipped footer boilerplate.</p></footer>
  </body>
</html>`;
}

/** Builds a minimal but structurally real EPUB in memory. */
export async function buildFixtureEpub(
  options: FixtureOptions = {},
): Promise<Uint8Array> {
  const title = options.title ?? 'Pride and Prejudice';
  const author = options.author ?? 'Jane Austen';
  const chapters = options.chapters ?? DEFAULT_FIXTURE_CHAPTERS;

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const manifest = chapters
    .map(
      (c, i) =>
        `    <item id="ch${i}" href="${c.href}" media-type="application/xhtml+xml"/>`,
    )
    .join('\n');
  const spine = chapters
    .map((_, i) => `    <itemref idref="ch${i}"/>`)
    .join('\n');

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine>
${spine}
  </spine>
</package>`,
  );

  for (const chapter of chapters) {
    zip.file(`OEBPS/${chapter.href}`, chapterXhtml(chapter));
  }

  return zip.generateAsync({ type: 'uint8array' });
}

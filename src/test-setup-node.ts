import { JSDOM } from 'jsdom';

// The ingest pipeline parses EPUB content with the platform DOMParser, and the
// DB layer imports node:sqlite — which Vite refuses to bundle into a client
// environment. So these tests run in Node and borrow just the DOM parser.
const { DOMParser, Node } = new JSDOM().window;

Object.assign(globalThis, { DOMParser, Node });

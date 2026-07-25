# English Reading Coach

A personal desktop app for reading English books (EPUB/TXT) with an AI reading coach
that explains vocabulary, grammar, idioms, and cultural context in Traditional Chinese
(zh-TW) — while tracking reading progress, notes, and vocabulary.

Local-first: one SQLite file, no server, no account.

## Quick start

```sh
npm install
npm run dev          # the real desktop app (needs Rust + platform webview deps)
```

Development without the Tauri host:

```sh
npm run dev:web      # Vite only, in a browser
npm run check        # tsc + eslint + vitest — the definition of "done"
npm run test:e2e     # Playwright against dev:web with mocked Tauri IPC
```

The coach works out of the box with a built-in offline provider that returns
deterministic sample replies. To use the real Anthropic coach, open **設定**, paste an
API key (stored in the OS keyring, never on disk), and enable the toggle.

## How it works

Every paragraph is a *unit*, identified by a content hash rather than its position:

```
unit_id = sha256(NORMALIZE_VERSION + book_id + chapter_index + normalized_text)[:16]
```

Notes, vocabulary, reading position, and chat messages all point at a `unit_id`. That is
what makes re-importing a book safe — swap in a better-formatted edition and every note
whose paragraph is unchanged stays exactly where you put it. Lightly edited paragraphs
are matched by similarity; ambiguous cases ask rather than guess; nothing is ever
silently reattached, and no unit is ever deleted.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full picture and
[`docs/DECISIONS.md`](docs/DECISIONS.md) for why each choice was made.
[`CLAUDE.md`](CLAUDE.md) holds the constraints that keep it true — each one enforced by
`npm run check` rather than by convention.

## Scope

v1 is import → read → explain → capture → resume. Deferred: persona editor and
full-text search (v2); spaced-repetition review, sentence breakdown, TTS, and Anki
export (v3). The schema already carries the columns those need.

## Platform notes

Building the desktop app needs a Rust toolchain and the platform webview headers
(`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libsoup-3.0-dev`,
`libjavascriptcoregtk-4.1-dev` on Debian/Ubuntu; Xcode command line tools on macOS).

The Playwright suite drives the frontend in Chromium, **not** the compiled native
binary — `tauri-driver` has no macOS support and CDP cannot attach to WKWebView. The
native app is verified by hand with `npm run dev`.

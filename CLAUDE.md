# CLAUDE.md — English Reading Coach

A personal desktop app for reading English books (EPUB/TXT) with an AI reading coach
that explains vocabulary, grammar, idioms, and cultural context in Traditional Chinese
(zh-TW), while tracking reading progress, notes, and vocabulary.

Stack: Tauri 2 + React 19 + TypeScript + SQLite.

---

## Hard constraints

These are not style preferences. Each one is enforced by `npm run check`, and breaking
one means the build fails. If a change seems to require breaking one, that is a signal
to reconsider the change — not to relax the rule.

### 1. `unit_id` is immutable and content-addressed

```
unit_id = sha256(NORMALIZE_VERSION + book_id + chapter_index + normalized_text)[:16]
```

- Every reference to a paragraph — progress, notes, vocab, chat messages — stores
  `unit_id`. **Never** an array index, and never a row `id` that could shift on
  re-import.
- `NORMALIZE_VERSION` (`src/core/ingest/normalize.ts`) is part of the hash preimage.
  If you change the normalizer's behaviour in any way that could alter its output, you
  **must** bump `NORMALIZE_VERSION`. Changing normalization without bumping it silently
  detaches every existing note and bookmark from its paragraph.
- Units are never deleted. On re-import they are flagged `is_orphaned = 1`.
- A `unit_id` is never reused for text that is not a confident match for the original.

### 2. Anthropic and the network live only in `src/core/coach/`

- `@anthropic-ai/sdk` may be imported **only** by
  `src/core/coach/providers/anthropic.ts`.
- `fetch`, `XMLHttpRequest`, `WebSocket`, and `EventSource` are banned outside
  `src/core/coach/`.
- Everything else talks to the coach through the `CoachProvider` interface in
  `src/core/coach/provider.ts`, which contains types only — no network code.

### 3. Raw SQL lives only in `src/core/db/queries.ts`

- `@tauri-apps/plugin-sql` may be imported only by `src/core/db/**`.
- Every query is a typed exported function in `queries.ts`. Callers never see a SQL
  string.

### 4. Migration discipline

- Migrations are numbered `.sql` files in `src/core/db/migrations/`, applied by the
  hand-rolled runner in `src/core/db/migrate.ts` and recorded in `schema_migrations`.
- **Once a migration has shipped to the user's machine, it is frozen.** Never edit an
  applied migration; add a new numbered file.
- The runner splits statements on `;`, so migration SQL must not contain a semicolon
  inside a string literal.

### 5. Secrets go in the OS keyring, never on disk

- The Anthropic API key is stored via the OS keyring (a hand-rolled Rust command over
  the `keyring` crate, exposed through `src/main/keyring.ts`).
- Never write a key to the database, to a config file, to `localStorage`, or to a log.
- Never commit a key, and never echo one into a test fixture.

### 6. Prompts are files, not string literals

- Coach prompts live in `src/core/coach/prompts/*.md` and are imported with `?raw`.
- No prompt text inline in `.ts`/`.tsx`.

### 7. TypeScript hygiene

- No `any`. Use `unknown` and narrow.
- No default exports (build config files excepted).
- `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` are on.

---

## Required scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | `tauri dev` — the real desktop app (needs macOS/Linux native deps) |
| `npm run dev:web` | Vite only, no Tauri host — used by Playwright |
| `npm run check` | `tsc -b && eslint . && vitest run` — **the definition of "done"** |
| `npm run test:e2e` | Playwright against `dev:web` with mocked Tauri IPC |
| `npm run build` | `tauri build` — production bundle |

Nothing is "done" until `npm run check` passes.

---

## Layout

```
src/
  main/       thin TS wrappers over Tauri invoke()/plugins — the ONLY place IPC happens
  renderer/   React UI (library, reader, coach, notes, settings)
  core/
    ingest/   epub/txt parsing, normalization, hashing, unit assembly, re-match
    db/       driver, client, migrations, typed queries
    coach/    provider interface, mock + anthropic providers, prompts, context assembly
e2e/          Playwright specs + mocked IPC harness
src-tauri/    Rust host
docs/         ARCHITECTURE.md, DECISIONS.md
```

`src/core` and `src/renderer` are plain TypeScript running in the webview. There is no
Rust in them, and they never call `invoke()` directly.

---

## Testing

- **Unit (Vitest).** `src/core/**` runs in the `node` environment — it needs
  `node:sqlite` for the test DB driver, and jsdom has no `crypto.subtle`.
  `src/renderer/**` runs in `jsdom`.
- **E2E (Playwright).** Drives the Vite dev server with `@tauri-apps/api/mocks`
  faking IPC; a `sql.js` instance answers `plugin:sql` calls for real, so migrations and
  `queries.ts` are genuinely exercised. This does **not** drive the compiled native
  binary — `tauri-driver` has no macOS support and CDP cannot attach to WKWebView.
  See `docs/ARCHITECTURE.md`.
- On a machine with a pre-provisioned Chromium (rather than one Playwright
  downloaded), point at it: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium npm run test:e2e`.

## Scope

v1 is import → read → explain → notes/vocab → resume. Deferred: persona editor and
full-text search (v2); SRS review, sentence-breakdown mode, TTS, Anki export (v3). The
schema already carries the columns v2/v3 need — do not design them away.

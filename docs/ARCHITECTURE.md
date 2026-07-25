# Architecture

## Goal

A personal desktop app for reading English books with an AI reading coach. The reader
opens an EPUB or TXT, reads paragraph by paragraph, and can ask the coach to explain any
paragraph — vocabulary, grammar, idiom, cultural context — in Traditional Chinese.
Notes, vocabulary, and reading position persist across sessions.

Single user, local-first, no server. Everything lives in one SQLite file.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Shell | Tauri 2 | ~10 MB bundle vs Electron's ~150 MB; see DECISIONS 002 |
| UI | React 19 + TypeScript | no router, no global state library (DECISIONS 010) |
| Storage | SQLite via `@tauri-apps/plugin-sql` | one local file, no server |
| Coach | `CoachProvider` interface, mock + Anthropic | key-free development (DECISIONS 003) |

## Layout

```
src-tauri/          Rust host: plugin registration + one keyring command
src/
  main/             the ONLY code that calls invoke() — fs.ts, keyring.ts
  renderer/         React UI: library/, reader/, coach/, notes/, settings/
  core/
    ingest/         normalize · hash · epub · txt · units · rematch
    db/             driver · client · migrate · migrations/*.sql · queries · schema
    coach/          provider · index · context · summarize · providers/ · prompts/
e2e/                Playwright specs and the mocked-IPC harness
docs/
```

`src/core` and `src/renderer` are plain TypeScript running in the webview. Neither
calls `invoke()` directly — that is `src/main/`'s only job.

## The load-bearing idea: `unit_id`

A *unit* is one paragraph. Its identity is a content hash, not a position:

```
unit_id  = sha256(NORMALIZE_VERSION + book_id + chapter_index + normalized_text)[:16]
book_id  = sha256("bv1" + lowercased normalized title + author)[:16]
```

Everything that points at text — progress, notes, vocab, chat messages — stores a
`unit_id`. A `seq` column stores the ordinal for ordering and for the re-match window.

**`book_id` is derived from metadata, not from the file.** This is load-bearing: since
`book_id` is part of the `unit_id` preimage, a file-derived id (a hash of the bytes, or
a fresh UUID per import) would change every `unit_id` on re-import and defeat the entire
re-match design. Deriving it from title and author means the same work re-imported from
a different EPUB lands on the same `book_id`, and unchanged paragraphs keep their hashes.

This is what makes re-importing a book safe. If the reader replaces a Gutenberg EPUB
with a better-formatted edition, paragraphs whose text is unchanged keep their hash, and
every note stays attached. See DECISIONS 001, and `CLAUDE.md` for the rules that keep it
true.

### Re-match on re-import

When an incoming paragraph's hash is not found, `ingest/rematch.ts` looks in a `seq ± 3`
window and scores word-bag similarity:

| Similarity | Action |
| --- | --- |
| > 0.9 | auto-accept: record the old id as the new unit's `matched_from_unit_id` |
| 0.6 – 0.9 | ask the reader in `ReimportReview` |
| < 0.6 | treat as a new unit |

Punctuation and case are stripped before scoring — curly-vs-straight quotes and
en-vs-em dashes are exactly the edition differences this pass exists to absorb.

A match **carries the anchor forward as provenance; it does not reuse the id.** The new
text keeps its own hash and records `matched_from_unit_id`. Reusing the old `unit_id`
for changed text would silently reattach a note to words that are no longer there —
the precise failure the hashing scheme exists to prevent.

Old units that nothing matched are flagged `is_orphaned = 1`. **Units are never
deleted** — an orphaned unit still owns its notes, and a later re-import may revive it.

## Data flow

### Import

```
file picker (plugin-dialog)
  → read bytes (plugin-fs)
  → epub.ts: jszip → container.xml → OPF spine → DOMParser walk of block nodes
    (or txt.ts: split on blank lines, one chapter)
  → normalize.ts → hash.ts → units.ts
  → queries.ts: insert book, chapters, units
```

EPUB parsing is hand-rolled rather than delegated to a library, because a library
upgrade that changed whitespace handling would change every `unit_id` (DECISIONS 008).

### A coach turn

```
reader clicks Explain on <p data-unit-id="…">
  → context.ts assembles a CoachTurnRequest from queries.ts reads:
      systemPrompt      prompts/*.md, marked cache_control: ephemeral
      bookMetadata      title/author/chapter, ~50 tokens, cache-eligible
      rollingSummary    sessions.rolling_summary
      lookbackUnitsText previous 1–2 units, crossing chapter boundaries
      recentTurns       last ~6 messages, each capped ~300 chars
      vocabContext      up to ~20 recent entries, budget permitting
  → budget trim (chars/4, target 1.5–3k input tokens)
  → provider.streamTurn() → text_delta* → usage → message_stop
  → ChatPanel renders incrementally; on stop, persist the message + token counts
```

**Trim order when over budget:** vocab → recent turns 6→4→2 → lookback 2→1→0. The
system prompt, the current unit, and the latest one or two turns are never dropped.

The rolling summary is regenerated by `coach/summarize.ts` when the current unit is 10
or more past `sessions.summary_upto_unit_id`. It runs asynchronously and never blocks
the reply.

### Capturing a note or vocab entry

Three paths, all landing in the same tables:

1. **Selection** — select text in the reader; the popover resolves the enclosing
   `data-unit-id`.
2. **From chat** — a save button on any coach message; attaches that message's
   `unit_id`.
3. **Manual** — a form; `unit_id` is `NULL`.

## Database

Nine tables plus `schema_migrations`: `books`, `chapters`, `units`, `coach_profiles`,
`sessions`, `messages`, `progress`, `notes`, `vocab`.

Migrations are `.sql` files under `src/core/db/migrations/`, applied by
`src/core/db/migrate.ts` and recorded in `schema_migrations`. Once a migration has
shipped it is frozen; changes are new files (DECISIONS 006, 012).

`queries.ts` is the only file containing SQL strings. ESLint enforces this by banning
`@tauri-apps/plugin-sql` imports outside `src/core/db/`.

### Three drivers, one interface

`src/core/db/driver.ts` defines a two-method `DbDriver` (`execute`, `select`):

| Context | Backing store |
| --- | --- |
| Production | `@tauri-apps/plugin-sql` → SQLite file |
| Vitest | `node:sqlite` (built into Node 22) |
| Playwright | `sql.js` — injected at the **IPC boundary**, so `client.ts` runs unmodified |

## Coach abstraction

`provider.ts` declares types only. Two implementations:

- `providers/mock.ts` — deterministic templated Chinese, emitted in small chunks. Its
  determinism is what lets e2e assert on streamed output.
- `providers/anthropic.ts` — the only file permitted to import `@anthropic-ai/sdk`.
  Split into a pure `buildAnthropicRequest()` (unit tested, no network) and a thin
  streaming wrapper.

`index.ts` picks a provider: `mock` unless a keyring secret exists *and* the reader has
enabled the real provider in settings. The SDK is behind a dynamic import, so a
mock-only session never loads it.

### Anthropic request shape

Written against the model's current API surface; each of these is a deliberate choice,
not a default:

| Choice | Why |
| --- | --- |
| `claude-opus-5` | current Opus tier; a constant at the top of the file |
| `effort: 'low'` | turns are short and scoped, and the reader is waiting on the stream |
| adaptive thinking (the model default) | disabling it on this model can leak internal tags into the visible reply |
| no `temperature` / `top_p` / `top_k` | this model rejects them with a 400 |
| `cache_control` on the system prompt only | book metadata sits *after* the breakpoint — it changes per chapter, so caching it would invalidate the entry on every chapter turn |
| `fallbacks: 'default'` | safety classifiers can decline a request; this re-runs it on the recommended fallback rather than surfacing a refusal |

The system prompt is close to the 512-token minimum cacheable prefix for this model. If
it is trimmed further, the cache will silently stop being written — there is no error,
only `cache_creation_input_tokens: 0`.

## Security model

- **API key** — OS keyring only, via a hand-rolled Rust command over the `keyring`
  crate (DECISIONS 007). Never in the DB, a config file, `localStorage`, or a log.
- **Network confinement** — ESLint bans `fetch`, `XMLHttpRequest`, `WebSocket`, and
  `EventSource` outside `src/core/coach/`, and bans `@anthropic-ai/sdk` everywhere
  except `providers/anthropic.ts`. Violations fail `npm run check`.
- **Tauri capabilities** — `src-tauri/capabilities/default.json` grants `sql:default`,
  `dialog:open`, and read-only `fs` access scoped to `$HOME/**`. Book files can be
  anywhere in the reader's home directory; nothing outside it is reachable, and nothing
  is writable through the fs plugin.
- **Book content is untrusted input.** EPUB HTML is parsed with `DOMParser` and only
  `textContent` is read — extracted text is never inserted as HTML.

## Testing

**Unit — Vitest.** Two projects, because the environments genuinely differ:

- **`core`** runs in `node`. The DB layer imports `node:sqlite`, which Vite refuses to
  bundle into a client environment. Ingest lives here too, and borrows a `DOMParser`
  from jsdom via `src/test-setup-node.ts` — cheaper than moving the database somewhere
  it cannot go.
- **`renderer`** runs in `jsdom` for React, with a `crypto.subtle` shim: jsdom ships
  none, and every `unit_id` hash depends on it.

The highest-value tests are in `src/core/ingest/reimport.test.ts`, which import a book,
annotate it, re-import an edited copy, and assert the note is still attached to the
right paragraph — the promise the whole hashing design exists to keep.

**E2E — Playwright.** Specs run against `npm run dev:web`. The harness lives in
`src/renderer/e2e-harness.ts` and is loaded only when `import.meta.env.DEV` *and* the
page carries `?e2e=1`, so the whole branch — including `sql.js` — is eliminated from
production builds. It installs the official `mockIPC`; a `sql.js` database answers
`plugin:sql` calls for real, while `plugin:fs`, `plugin:dialog`, and keyring are
stubbed. The coach mock runs as ordinary TypeScript. Fixtures build a synthetic EPUB in
memory with `jszip` rather than committing a binary.

On a machine with a pre-provisioned Chromium, point at it:
`PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium npm run test:e2e`.

> **These e2e tests do not drive the compiled native binary.** They exercise the
> frontend in Chromium, not WKWebView, and not the Rust host or the real plugins.
> `tauri-driver` has no macOS support and CDP cannot attach to WKWebView, so there is no
> automated path to real-binary e2e on this project's target platform (DECISIONS 009).
> The native app is verified by hand with `npm run dev`.

## Forward compatibility

The schema already carries what v2 and v3 need, so neither requires a migration of
existing data:

- **v2 persona editor** — CRUD over `coach_profiles`. v1 seeds one 中高級 / `zh-TW` row
  and `context.ts` reads its `level` and `target_locale` into the prompt as data; no
  persona text is hardcoded in UI logic.
- **v2 full-text search** — add FTS5 virtual tables over `notes`, `vocab`, `messages`.
- **v3 SRS review** — `vocab` already has `ease`, `interval_days`, `due_at`, and
  `review_count`.
- **v3 sentence breakdown / TTS / Anki export** — additive; the unit model already gives
  a stable anchor per paragraph.

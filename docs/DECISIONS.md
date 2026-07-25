# Decisions

Lightweight ADRs. Each entry: Context / Decision / Consequences. Newest decisions are
appended; entries are not rewritten once made, only superseded by a later entry.

---

## 001 — `unit_id` is a content hash, with a versioned normalizer

**Context.** Notes, vocabulary, progress, and chat messages all need to point at a
specific paragraph. The obvious anchor — an array index or an autoincrement row id — is
wrong: re-importing a corrected EPUB, or fixing a parser bug, shifts every index and
silently reattaches a year of notes to the wrong text. This is the failure that would
force a rewrite in six months, so it is settled first.

**Decision.**

```
unit_id = sha256(NORMALIZE_VERSION + book_id + chapter_index + normalized_text)[:16]
```

stored alongside an ordinal `seq` for ordering and for the re-match window. Every
foreign reference uses `unit_id`. `NORMALIZE_VERSION` is a constant in
`src/core/ingest/normalize.ts` and is part of the hash preimage, so a future change to
normalization is an explicit, visible break rather than a silent one — bump the version
and the re-match path handles the transition.

**Consequences.**

- Reordering, re-importing, or re-parsing a book preserves every anchor whose text is
  unchanged.
- Truncating to 16 hex chars gives a 64-bit space. For a personal library (~10^5
  paragraphs) collision probability is ~10^-9. Accepted; a collision would attach one
  note to one wrong paragraph, not corrupt the database.
- Identical text in the same chapter of the same book hashes identically — by design.
  Two occurrences of "Chapter One" collapse to one unit. `seq` disambiguates ordering
  but not identity; this is a deliberate tradeoff for stability.
- `crypto.subtle.digest` is async, so the whole ingest pipeline is async.

---

## 002 — Tauri 2, not Electron

**Context.** A personal desktop reading app for one user, on macOS.

**Decision.** Tauri 2 with the system webview.

**Consequences.** Bundle is ~10 MB rather than ~150 MB, and memory use is far lower.
Cost: the webview is WKWebView on macOS and WebKitGTK on Linux, so rendering differs
from Chrome, and no CDP-based tooling can attach to it (see 009). Requires a Rust
toolchain and native GTK/WebKit dev packages to build.

---

## 003 — The coach is an interface with a mock implementation first

**Context.** No Anthropic API key exists yet, and the app should be fully developable
and testable without one — including in CI, which will never have a key.

**Decision.** `src/core/coach/provider.ts` defines `CoachProvider` (types only, no
network code). `providers/mock.ts` returns deterministic templated Chinese text in
chunks. `providers/anthropic.ts` is the real one and is wired last. A factory in
`index.ts` defaults to `mock` and selects `anthropic` only when a key is present in the
keyring *and* the user has enabled it.

**Consequences.** Every layer above the provider — context assembly, streaming UI,
message persistence, token accounting — is exercised by tests that cost nothing and
never flake on the network. The mock's determinism is what makes e2e assertions on
streamed text possible. Risk: the mock can drift from real API behaviour, so
`providers/anthropic.ts` splits into a pure `buildAnthropicRequest()` that is unit
tested against the real request shape, plus a thin streaming wrapper.

---

## 004 — Explanations are triggered, not automatic

**Context.** Auto-explaining every paragraph as the reader scrolls would burn tokens on
text the reader already understands.

**Decision.** Hybrid. The reader clicks "explain" on a specific paragraph, and a
free-form question box is always available.

**Consequences.** Token spend tracks actual confusion. The reading loop stays quiet by
default. `mode: 'explain' | 'ask'` on the request distinguishes the two paths so the
prompt can differ.

---

## 005 — `core/` is pure TypeScript; the DB is reached from the frontend

**Context.** Business logic could live in Rust commands or in TypeScript in the webview.

**Decision.** All ingest, DB, and coach logic is TypeScript in `src/core/`, talking to
SQLite through `@tauri-apps/plugin-sql`. Rust is limited to the host, the plugins, and
one keyring command. `src/main/` holds the only code that calls `invoke()`.

**Consequences.** One language for all logic, and every module is unit-testable under
Vitest without a Rust build. The webview holds the data logic, which is acceptable for a
single-user local app with no untrusted input beyond the book files themselves. Cost:
per-query IPC overhead, irrelevant at this scale.

---

## 006 — A hand-rolled TypeScript migration runner

**Context.** `tauri-plugin-sql` can run migrations, but they must be declared in Rust,
inside `src-tauri`.

**Decision.** Migrations are `.sql` files under `src/core/db/migrations/`, applied by
`src/core/db/migrate.ts`, tracked in a `schema_migrations` table.

**Consequences.** Migrations sit next to the queries they support and run identically
under all three drivers (plugin-sql, `node:sqlite`, `sql.js`), so tests exercise the
real schema. Cost: the runner splits statements naively on `;`, so migration SQL must
not contain a semicolon inside a string literal — noted in each migration's header.

---

## 007 — API key in the OS keyring via a hand-rolled Rust command

**Context.** Tauri has no official keyring plugin. Community plugins are
single-maintainer, and Stronghold is being deprecated.

**Decision.** A minimal custom Rust command wrapping the `keyring` crate, exposed to TS
through `src/main/keyring.ts`.

**Consequences.** The security-sensitive surface is a few dozen lines we own, with no
third-party plugin in the trust chain. Cost: it is new Rust code, and it is the one
place where a bug has real consequences. The key never touches the database, a config
file, or a log.

---

## 008 — EPUB parsing hand-rolled on `jszip` + `DOMParser`

**Context.** General EPUB libraries vary in how they extract text, and an upgrade that
changes whitespace or block detection would change every `unit_id` in the library.

**Decision.** Unzip with `jszip`, read `container.xml` and the OPF manifest/spine, and
walk block-level nodes with the platform `DOMParser`. No general EPUB library.

**Consequences.** Paragraph extraction is code we version and control, which is what
makes decision 001 safe to rely on. Cost: EPUB edge cases (odd NCX, CSS-driven
footnotes, unusual markup) are our problem, and DRM'd files are out of scope.

---

## 009 — E2E via Playwright with mocked IPC, not `tauri-driver`

**Context.** Real native-webview e2e needs `tauri-driver`, which has no macOS support.
Playwright's CDP cannot attach to WKWebView either.

**Decision.** Playwright drives the Vite dev server. `@tauri-apps/api/mocks`
(`mockIPC`/`mockWindows`) fakes IPC; a `sql.js` instance inside the page answers
`plugin:sql|execute` and `plugin:sql|select` for real, so migrations and `queries.ts`
run genuinely. `plugin:fs`, `plugin:dialog`, and keyring are stubbed. The
`CoachProvider` mock runs as ordinary unmocked TypeScript.

**Consequences.** The whole app loop — import, read, explain, capture, resume — is
covered by fast, deterministic tests. **These tests do not exercise the compiled native
binary**, the Rust host, the real plugins, or WKWebView-specific rendering. Those are
verified by hand with `npm run dev` on macOS. The mock lives at the IPC boundary
precisely so that production code, including `client.ts`, runs unmodified under test.

---

## 010 — No router and no global state library in v1

**Context.** The app is a single window with a handful of views.

**Decision.** View switching is React state in `App.tsx`. State is local plus hooks.

**Consequences.** Two fewer dependencies and no indirection to trace. If v2's persona
editor and search push the view count up, adding a router later is a contained change.

---

## 011 — Token budget by a chars/4 heuristic, no tokenizer

**Context.** Context assembly must stay inside a budget (~1.5–3k input tokens) without
pulling in a tokenizer.

**Decision.** Estimate tokens as `chars / 4`. Trim in a fixed order: vocab → recent
turns 6→4→2 → lookback 2→1→0. The system prompt, the current unit, and the latest one
or two turns are never dropped.

**Consequences.** No dependency, and the estimate is deliberately conservative. It is
inaccurate for CJK text (which is denser per character), so the coach's own Chinese
output is over-counted — which errs toward sending less, the safe direction. Real usage
is reconciled from the `usage` event and stored per message.

---

## 012 — One migration file for v1

**Context.** The build plan originally staged `0002_add_rolling_summary` and
`0003_add_unit_orphan_flag` as separate migrations, added in the phases that needed
them.

**Decision.** `0001_init.sql` carries the complete v1 schema, including
`sessions.rolling_summary`, `sessions.summary_upto_unit_id`, `units.is_orphaned`,
`units.matched_from_unit_id`, and the SRS columns v3 will use.

**Consequences.** Nothing has shipped and no database exists anywhere, so migrations
that add columns we already know we need would be pure ceremony — and they complicate
the phases that would otherwise just write code. Migration discipline (decision 006)
begins the moment v1 lands on the user's machine: from then on, `0001` is frozen and
every change is a new file.

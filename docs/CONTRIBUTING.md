# Contributing

## Setup

```bash
node --version      # 20 or newer
npm install
npm run dev         # API on :4000, web on :5173
npm test            # must pass before you push
```

No database, no Docker, no API keys needed. If `npm run dev` does not give you a working
app, that is a bug in this repo — please report it rather than working around it.

## Where things go

| Change | File |
|---|---|
| Add a style preset, a marketplace, or change a price | `server/src/data/catalog.js` |
| Add or change a brief question or its options | `catalog.js` (`BRIEF_QUESTIONS`, or a category's `productTypes`); bump `BRIEF_VERSION` if an id changes meaning |
| Change a business rule | `server/src/services/*.service.js` |
| Add an endpoint | `server/src/routes/*.routes.js` (thin — logic lives in a service) |
| Change how images are made or sized | `server/src/services/image.service.js` |
| Change seller-facing copy | the relevant `web/src/pages/*.jsx` |
| Change styling | `web/src/styles/global.css` (tokens at the top) |

`catalog.js` is the product definition and has no imports. Adding a style preset there makes
it appear in the wizard, the pipeline and the reviewer console with no other change.

## Conventions

**Language.** Code, comments and commit messages in English. Everything a seller or reviewer
reads is in Bahasa Indonesia — including error messages thrown from services.

```js
// Good: the seller sees this string.
throw new ApiError(422, 'Pilih minimal 1 gaya foto.', { code: 'NO_STYLES' });
```

**Errors.** Services throw `ApiError` with an HTTP status, a Bahasa message and a stable
machine `code`. Routes never build error responses by hand — the error middleware does it.

**Routes stay thin.** A route parses input, calls one service, and shapes the response. If a
route contains an `if` about business rules, that `if` belongs in a service.

**Status changes go through `transition()`.** Never write `status` directly. `transition()`
enforces the state machine and appends to the timeline; bypassing it lets an order reach a
state the rest of the code does not expect.

**Comments explain why, not what.** Assume the reader can read JavaScript. Write the comment
when a decision would otherwise look arbitrary (why `contain` instead of `cover`, why sharp
is imported lazily).

**No new dependency without a reason in the PR.** The whole server runs on eight packages.
Keeping it that way is a feature — this codebase gets handed to people who did not write it.

## Testing

Tests use `node:test` — no framework, no config.

**Every test file that imports config, the store or the app must `import './setup.js'` as its
first import.** It points storage at a temp directory. Skip it and the store writes the test
fixtures over your real `server/storage/db.json`.

- Business rules → a unit test next to the logic (`tests/order.service.test.js`)
- Anything crossing HTTP, middleware or the queue → extend `tests/pipeline.e2e.test.js`
- Changing `catalog.js` → check `tests/catalog.test.js` still holds; if a price moves outside
  the Rp15.000–Rp25.000 band, that test failing is the point, not an inconvenience

Run one file while iterating:

```bash
node --test server/tests/order.service.test.js
```

## Commits and PRs

Conventional-commit prefixes, imperative mood:

```
feat(catalog): add batik style preset for kerajinan
fix(review): reject an approval that would deliver zero photos
docs(api): document the payment webhook
test(pipeline): cover the revision re-run path
```

A PR should say what changed, why, and how you verified it. If it touches the seller flow,
say what you clicked. If it touches pricing or the review step, say which test covers it.

## Definition of done

- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] The seller flow still completes end to end by hand
- [ ] Any seller-facing string is in Bahasa Indonesia
- [ ] New business rules have a test
- [ ] No new dependency without justification

# Defuddle

Extracts main content from web pages as clean HTML. **Node.js library** using [LinkeDOM](https://github.com/WebReflection/linkedom).

## Project structure

- `src/defuddle.ts` — Core parsing pipeline
- `src/standardize.ts` — HTML normalization (headings, code blocks, footnotes)
- `src/scoring.ts` — Content scoring to remove non-content blocks
- `src/constants.ts` — Exact/partial selectors for clutter removal
- `src/elements/` — Element-specific rules (code, footnotes, math)
- `src/utils/dom.ts` — DOM utilities (`parseHTML`, `serializeHTML`)
- `src/index.ts` — Main entry point (exports async Defuddle function)

## Build and test

- `pnpm run build` — Build the library
- `pnpm test` — Run Vitest

### Testing

Vitest fixtures: HTML files in `tests/fixtures/` with snapshots in `tests/__snapshots__/`

## Debugging content extraction

### Pipeline order

1. Flatten shadow DOM (`flattenShadowRoots`)
2. Resolve React streaming SSR (`resolveStreamedContent`)
3. Find main content (auto-detection or `contentSelector`)
4. `standardizeFootnotes` — runs before removals because CSS sidenotes use `display:none`
5. `removeSmallImages`
6. `removeHiddenElements`
7. `removeLowScoring`
8. `removeBySelector` — exact and partial selectors from `src/constants.ts`
9. `removeByContentPattern` — content-based removal (read time, boilerplate, article cards)
10. `standardizeContent` — HTML normalization
11. Resolve relative URLs

### Pipeline toggles

```typescript
new Defuddle(document, {
  removeSmallImages: false,
  removeHiddenElements: false,
  removeLowScoring: false,
  removeExactSelectors: false,
  removePartialSelectors: false,
  removeContentPatterns: false,
  standardize: false,  // disables standardizeFootnotes and standardizeContent
}).parse();
```

### Debug mode

```typescript
const result = new Defuddle(document, { debug: true }).parse();
result.debug.contentSelector; // CSS path of chosen content element
result.debug.removals;        // array of {step, selector, reason, text}
```

Debug mode preserves class/id/data-* attributes and skips div flattening. Use `contentSelector` to bypass auto-detection when it picks the wrong element.

### Debugging strategy

1. Check `result.debug.removals` for unexpected entries
2. Disable steps one at a time to find which one removes the content
3. For selector issues, check `EXACT_SELECTORS` and `PARTIAL_SELECTORS` in `src/constants.ts`
4. Elements inside `<pre>` or `<code>` are protected from selector removal
5. After fixing, create a minimal fixture in `tests/fixtures/` with expected output in `tests/expected/` to prevent regressions. Anonymize fixtures — replace real names, emails, URLs, and identifying content with generic placeholders.

### Rules

- **Never use `innerHTML` directly.** Always use `parseHTML()` from `src/utils/dom.ts` which parses via `<template>` elements (no script execution, no resource loading).
- **Sanitize URLs** — `javascript:` and `data:text/html` must be stripped from `href`/`src` attributes. `srcdoc` must be stripped from iframes. `on*` event handler attributes must be removed. See `sanitizeContent()` in `src/defuddle.ts`.

### Common pitfalls

- **Live HTMLCollections**: `getElementsByTagName` returns live collections. Convert to static arrays with `Array.from()` before mutating the DOM.

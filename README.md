> de·​fud·dle /diˈfʌdl/ *transitive verb*  
> to remove unnecessary elements from a web page, and make it easily readable.

**Beware! Defuddle is very much a work in progress!**

Defuddle extracts the main content from web pages. It cleans up web pages by removing clutter like comments, sidebars, headers, footers, and other non-essential elements, leaving only the primary content.

[Try the Defuddle Playground →](https://defuddle.md/playground)

## Features

Defuddle aims to output clean and consistent HTML documents. It was written for [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) with the goal of creating a more useful input for HTML-to-Markdown converters like [Turndown](https://github.com/mixmark-io/turndown).

Defuddle can be used as a replacement for [Mozilla Readability](https://github.com/mozilla/readability) with a few differences:

- More forgiving, removes fewer uncertain elements.
- Provides a consistent output for footnotes, math, code blocks, etc.
- Uses a page's mobile styles to guess at unnecessary elements.
- Extracts more metadata from the page, including schema.org data.

## Usage

Defuddle works with Node.js and uses [LinkeDOM](https://github.com/WebReflection/linkedom) - a lightweight DOM implementation. It parses HTML strings or LinkeDOM documents.

```javascript
import Defuddle from 'defuddle';

// Parse HTML from a string
const html = '<html><body><article>...</article></body></html>';
const result = await Defuddle(html);

// With URL for resolving relative links
const result = await Defuddle(html, 'https://example.com/article');

// Access the content and metadata
console.log(result.content);
console.log(result.title);
console.log(result.author);
```

### Options

```typescript
const result = await Defuddle(html, url, {
  debug: true,                          // Enable debug mode
  markdown: false,                      // Convert content to markdown
  separateMarkdown: false,              // Keep HTML and return markdown separately
  // Pipeline toggles
  removeExactSelectors: true,
  removePartialSelectors: true,
  removeHiddenElements: true,
  removeLowScoring: true,
  removeSmallImages: true,
  removeImages: false,
  standardize: true,
  contentSelector: 'article.post-content'  // Bypass auto-detection
});
```

## Installation

```bash
pnpm install defuddle
```

## Response

Defuddle returns an object with the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `author` | string | Author of the article |
| `content` | string | Cleaned up string of the extracted content (HTML or Markdown based on options) |
| `description` | string | Description or summary of the article |
| `domain` | string | Domain name of the website |
| `favicon` | string | URL of the website's favicon |
| `image` | string | URL of the article's main image |
| `language` | string | Language of the page in [BCP 47](https://www.rfc-editor.org/info/bcp47) format (e.g. `en`, `en-US`) |
| `metaTags` | object | Meta tags |
| `parseTime` | number | Time taken to parse the page in milliseconds |
| `published` | string | Publication date of the article |
| `site` | string | Name of the website |
| `schemaOrgData` | object | Raw schema.org data extracted from the page |
| `title` | string | Title of the article |
| `wordCount` | number | Total number of words in the extracted content |
| `textContent` | string | Plain text version of the content (when htmlToText option is used) |
| `debug` | object | Debug info including content selector and removals (when `debug: true`) |

## Bundle

Defuddle is a **Node.js library** using [LinkeDOM](https://github.com/WebReflection/linkedom) for DOM operations. LinkeDOM is included as a dependency.

The library exposes a single async function as the default export:

```javascript
import Defuddle from 'defuddle';
const result = await Defuddle(htmlString, url, options);
```

For advanced usage, you can also import the `DefuddleClass` directly to work with LinkeDOM documents:

```javascript
import { DefuddleClass } from 'defuddle';
import { parseHTML } from 'linkedom';

const { document } = parseHTML(html);
const defuddle = new DefuddleClass(document, { url: 'https://example.com' });
const result = await defuddle.parseAsync();
```

## Options

| Option                   | Type              | Default | Description                                                               |
| ------------------------ | ----------------- | ------- | ------------------------------------------------------------------------- |
| `debug`                  | boolean           | false   | Enable debug logging and return debug info in the response                |
| `url`                    | string            |         | URL of the page being parsed                                              |
| `markdown`               | boolean           | false   | Convert `content` to Markdown                                             |
| `separateMarkdown`       | boolean           | false   | Keep `content` as HTML and return `contentMarkdown` as Markdown           |
| `htmlToText`             | boolean \| object | false   | Convert content to plain text (uses `html-to-text` package)               |
| `removeExactSelectors`   | boolean           | true    | Remove elements matching exact selectors like ads, social buttons, etc.   |
| `removePartialSelectors` | boolean           | true    | Remove elements matching partial selectors like ads, social buttons, etc. |
| `removeHiddenElements`   | boolean           | true    | Remove elements hidden via CSS (display:none, visibility:hidden, etc.)    |
| `removeLowScoring`       | boolean           | true    | Remove non-content blocks by scoring (navigation, link lists, etc.)       |
| `removeSmallImages`      | boolean           | true    | Remove small images (icons, tracking pixels, etc.)                        |
| `removeImages`           | boolean           | false   | Remove images.                                                            |
| `standardize`            | boolean           | true    | Standardize HTML (footnotes, headings, code blocks, etc.)                 |
| `contentSelector`        | string            |         | CSS selector to use as the main content element, bypassing auto-detection |

## HTML standardization

Defuddle attempts to standardize HTML elements to provide a consistent input for subsequent manipulation such as conversion to Markdown.

### Headings

- The first H1 or H2 heading is removed if it matches the title.
- H1s are converted to H2s.
- Anchor links in H1 to H6 elements are removed and become plain headings.

### Code blocks

Code block are standardized. If present, line numbers and syntax highlighting are removed, but the language is retained and added as a data attribute and class.

```html
<pre>
  <code data-lang="js" class="language-js">
    // code
  </code>
</pre>
```

### Footnotes

Inline references and footnotes are converted to a standard format:

```html
Inline reference<sup id="fnref:1"><a href="#fn:1">1</a></sup>.

<div id="footnotes">
  <ol>
    <li class="footnote" id="fn:1">
      <p>
        Footnote content.&nbsp;<a href="#fnref:1" class="footnote-backref">↩</a>
      </p>
    </li>
    </ol>
</div>
```

### Math

Math elements, including MathJax and KaTeX, are converted to standard MathML:

```html
<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline" data-latex="a \neq 0">
  <mi>a</mi>
  <mo>≠</mo>
  <mn>0</mn>
</math>
```

## Development

### Build

To build the package, you'll need Node.js and pnpm installed. Then run:

```bash
# Install dependencies
pnpm install

# Clean and build
pnpm run build
```

## Development

### Build

To build the package, you'll need Node.js and pnpm installed. Then run:

```bash
# Install dependencies
pnpm install

# Build
pnpm run build
```

### Testing

Tests use Vitest with snapshot testing for fixtures:

```bash
# Run tests
pnpm test

# Update snapshots
pnpm test -- --update
```

You can enable debug mode by passing an options object when creating a new Defuddle instance:

```typescript
const result = new Defuddle(document, { debug: true }).parse();

// Access debug info
console.log(result.debug.contentSelector); // CSS selector path of chosen main content element
console.log(result.debug.removals);        // Array of removed elements with reasons
```

When debug mode is enabled:

- Returns a `debug` field in the response with detailed information about content extraction
- More verbose console logging about the parsing process
- Preserves HTML class and id attributes that are normally stripped
- Retains all data-* attributes
- Skips div flattening to preserve document structure

The `debug` field contains:

| Property | Type | Description |
|----------|------|-------------|
| `contentSelector` | string | CSS selector path of the chosen main content element |
| `removals` | array | List of elements removed during processing |
| `parseTime` | number | Time taken to parse in milliseconds |

Each removal entry contains:

| Property | Type | Description |
|----------|------|-------------|
| `step` | string | Pipeline step that removed the element (e.g. `removeLowScoring`, `removeBySelector`, `removeHiddenElements`) |
| `selector` | string | CSS selector or pattern that matched (for selector-based removal) |
| `reason` | string | Why the element was removed (e.g. `score: -20`, `display:none`) |
| `text` | string | First 200 characters of the removed element's text content |

### Pipeline toggles

You can disable individual pipeline steps to diagnose content extraction issues:

```typescript
// Skip content scoring to see if it's removing content incorrectly
const result = new Defuddle(document, { removeLowScoring: false }).parse();

// Skip hidden element removal (useful for CSS sidenote layouts)
const result = new Defuddle(document, { removeHiddenElements: false }).parse();

// Skip small image removal
const result = new Defuddle(document, { removeSmallImages: false }).parse();
```

### Content selector

Use `contentSelector` to bypass Defuddle's auto-detection and specify the main content element directly:

```typescript
const result = new Defuddle(document, {
  contentSelector: 'article.post-content'
}).parse();
```

If the selector doesn't match any element, Defuddle falls back to auto-detection.

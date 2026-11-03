/**
 * Move all child nodes from source to target.
 * Clears target first, then moves each child node from source.
 */
export declare function transferContent(source: Node, target: Node): void;
/**
 * Read an element's inner HTML.
 */
export declare function serializeHTML(el: {
    innerHTML: string;
}): string;
/**
 * Decode HTML entities in a string (e.g. `&amp;` → `&`).
 * Uses a <textarea> element which is safe for entity decoding.
 */
export declare function decodeHTMLEntities(doc: Document, text: string): string;
/**
 * Escape HTML special characters in a string.
 */
export declare function escapeHtml(text: string): string;
/**
 * Check if a URL uses a dangerous protocol: javascript:, vbscript:, or any
 * data: URL that is not a raster/vector image (data:text/html,
 * data:application/xhtml+xml, ...). Strips whitespace and control
 * characters before checking, since browsers ignore them in schemes.
 */
export declare function isDangerousUrl(url: string): boolean;
/**
 * Unwrap links to dangerous URLs (javascript:, vbscript:, data:text/html…):
 * the link's content is kept in place, the link itself is removed, so links
 * without content disappear. Must run after relative URL resolution, since
 * new URL() normalizes schemes (e.g. "JavaScript:" → "javascript:").
 * If the root itself is a dangerous link, only its href is removed.
 */
export declare function unwrapDangerousLinks(root: Element): void;
/**
 * Remove script-capable and inert-but-leaky elements from the subtree.
 * Runs regardless of pipeline toggles (removeExactSelectors can be disabled).
 */
export declare function removeUnsafeElements(root: Element): void;
/**
 * Remove every on* event handler attribute from the subtree, including the
 * root, SVG elements and HTML inside <foreignObject>. Runs regardless of
 * pipeline toggles (attribute stripping in standardize skips SVG).
 */
export declare function stripEventHandlers(root: Element): void;
export interface SrcsetEntry {
    url: string;
    descriptor: string;
}
/**
 * Parse a srcset attribute in linear time. Width/density descriptors are
 * used as entry delimiters rather than commas, because CDN URLs may contain
 * commas (e.g. `,w_852,c_limit`). Entries without a descriptor are ignored.
 */
export declare function parseSrcset(srcset: string): SrcsetEntry[];
/**
 * Check if an element belongs directly to an ancestor table,
 * not to an intervening nested TABLE.
 */
export declare function isDirectTableChild(el: Node, ancestor: Node): boolean;
/**
 * Parse an HTML string into a DocumentFragment.
 * Uses a <template> element when available (safer: no script execution,
 * no resource loading). Falls back to a <div> for environments that
 * don't support template.content (e.g. some server-side DOM libraries).
 */
export declare function parseHTML(doc: Document, html: string): DocumentFragment;

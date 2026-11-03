/**
 * Move all child nodes from source to target.
 * Clears target first, then moves each child node from source.
 */
export function transferContent(source: Node, target: Node): void {
	if ('replaceChildren' in target) {
		(target as Element).replaceChildren();
	} else {
		while (target.firstChild) {
			target.removeChild(target.firstChild);
		}
	}
	while (source.firstChild) {
		target.appendChild(source.firstChild);
	}
}

/**
 * Read an element's inner HTML.
 */
export function serializeHTML(el: { innerHTML: string }): string {
	return el.innerHTML;
}

/**
 * Decode HTML entities in a string (e.g. `&amp;` → `&`).
 * Uses a <textarea> element which is safe for entity decoding.
 */
export function decodeHTMLEntities(doc: Document, text: string): string {
	const textarea = doc.createElement('textarea');
	textarea.innerHTML = text;
	return textarea.value;
}

/**
 * Escape HTML special characters in a string.
 */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Check if a URL uses a dangerous protocol: javascript:, vbscript:, or any
 * data: URL that is not a raster/vector image (data:text/html,
 * data:application/xhtml+xml, ...). Strips whitespace and control
 * characters before checking, since browsers ignore them in schemes.
 */
export function isDangerousUrl(url: string): boolean {
	const normalized = url.replace(/[\s\u0000-\u001F\u007F]+/g, '').toLowerCase();
	if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) {
		return true;
	}
	if (normalized.startsWith('data:')) {
		return !normalized.startsWith('data:image/');
	}
	return false;
}

/**
 * Unwrap links to dangerous URLs (javascript:, vbscript:, data:text/html…):
 * the link's content is kept in place, the link itself is removed, so links
 * without content disappear. Must run after relative URL resolution, since
 * new URL() normalizes schemes (e.g. "JavaScript:" → "javascript:").
 * If the root itself is a dangerous link, only its href is removed.
 */
export function unwrapDangerousLinks(root: Element): void {
	const isDangerousLink = (link: Element) => {
		const href = link.getAttribute('href') || link.getAttribute('xlink:href') || '';
		return !!href && isDangerousUrl(href);
	};

	if (root.nodeName.toLowerCase() === 'a' && isDangerousLink(root)) {
		root.removeAttribute('href');
		root.removeAttribute('xlink:href');
	}

	for (const link of Array.from(root.querySelectorAll('a'))) {
		if (!isDangerousLink(link)) continue;
		while (link.firstChild) {
			link.parentNode?.insertBefore(link.firstChild, link);
		}
		link.remove();
	}
}

/**
 * Elements that must never appear in extracted content. Math scripts
 * (type="math/tex" etc.) are inert and needed for LaTeX extraction.
 * Iframes are intentionally not listed (handled by the selector allowlist).
 */
const UNSAFE_ELEMENTS_SELECTOR = [
	'script:not([type^="math/"])', 'style', 'noscript', 'template',
	'frame', 'frameset', 'object', 'embed', 'applet', 'base', 'meta', 'link',
].join(', ');

/**
 * Remove script-capable and inert-but-leaky elements from the subtree.
 * Runs regardless of pipeline toggles (removeExactSelectors can be disabled).
 */
export function removeUnsafeElements(root: Element): void {
	for (const el of Array.from(root.querySelectorAll(UNSAFE_ELEMENTS_SELECTOR))) {
		el.remove();
	}
}

/**
 * Remove every on* event handler attribute from the subtree, including the
 * root, SVG elements and HTML inside <foreignObject>. Runs regardless of
 * pipeline toggles (attribute stripping in standardize skips SVG).
 */
export function stripEventHandlers(root: Element): void {
	for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
		for (const attr of Array.from(el.attributes)) {
			if (attr.name.toLowerCase().startsWith('on')) {
				el.removeAttribute(attr.name);
			}
		}
	}
}

export interface SrcsetEntry {
	url: string;
	descriptor: string;
}

const SRCSET_DESCRIPTOR = /^(\d+(?:\.\d+)?[wx])(?:,(.*))?$/;

/**
 * Parse a srcset attribute in linear time. Width/density descriptors are
 * used as entry delimiters rather than commas, because CDN URLs may contain
 * commas (e.g. `,w_852,c_limit`). Entries without a descriptor are ignored.
 */
export function parseSrcset(srcset: string): SrcsetEntry[] {
	const entries: SrcsetEntry[] = [];
	const tokens = srcset.trim().split(/\s+/);
	let urlParts: string[] = [];

	for (const token of tokens) {
		if (!token) continue;
		const match = urlParts.length > 0 ? SRCSET_DESCRIPTOR.exec(token) : null;
		if (match) {
			const url = urlParts.join(' ').replace(/^,\s*/, '');
			if (url) entries.push({ url, descriptor: match[1] });
			urlParts = match[2] ? [match[2]] : [];
		} else {
			urlParts.push(token);
		}
	}
	return entries;
}

/**
 * Check if an element belongs directly to an ancestor table,
 * not to an intervening nested TABLE.
 */
export function isDirectTableChild(el: Node, ancestor: Node): boolean {
	let parent = el.parentNode;
	while (parent && parent !== ancestor) {
		if (parent.nodeName === 'TABLE') return false;
		parent = parent.parentNode;
	}
	return parent === ancestor;
}

/**
 * Parse an HTML string into a DocumentFragment.
 * Uses a <template> element when available (safer: no script execution,
 * no resource loading). Falls back to a <div> for environments that
 * don't support template.content (e.g. some server-side DOM libraries).
 */
export function parseHTML(doc: Document, html: string): DocumentFragment {
	if (!html) return doc.createDocumentFragment();

	const template = doc.createElement('template');
	template.innerHTML = html;
	if (template.content) {
		return template.content;
	}
	// Fallback for environments without template.content support
	const div = doc.createElement('div');
	div.innerHTML = html;
	const fragment = doc.createDocumentFragment();
	while (div.firstChild) {
		fragment.appendChild(div.firstChild);
	}
	return fragment;
}

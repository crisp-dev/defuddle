import { parseHTML } from 'linkedom';
import { Defuddle as DefuddleClass } from './defuddle';
import type { DefuddleOptions, DefuddleResponse } from './types';
import { toMarkdown } from './markdown';
import { toText } from './text';

export type { DefuddleOptions, DefuddleResponse, DefuddleMetadata, DebugInfo, DebugRemoval } from './types';

/**
 * Parse HTML content using linkedom
 * @param htmlOrDom HTML string or linkedom document to parse
 * @param url Optional URL of the page being parsed
 * @param options Optional parsing options
 * @returns Promise with parsed content and metadata
 */
async function Defuddle(
	htmlOrDom: string | Document,
	url?: string,
	options?: DefuddleOptions
): Promise<DefuddleResponse> {
	let document: Document;

	if (typeof htmlOrDom === 'string') {
		const parsed = parseHTML(htmlOrDom);
		document = parsed.document;
	} else {
		document = htmlOrDom;
	}

	// linkedom doesn't implement styleSheets, getComputedStyle, or document.URL.
	// Stub them so defuddle's internals proceed without throwing.
	const doc = document as any;
	if (!doc.styleSheets) doc.styleSheets = [];
	if (doc.defaultView && !doc.defaultView.getComputedStyle) {
		doc.defaultView.getComputedStyle = () => ({ display: '' });
	}
	// Fall back to "about:blank" so new URL(document.URL) never throws inside
	// the extractor registry when no URL is provided by the caller.
	const pageUrl = url || 'about:blank';
	if (!doc.URL) doc.URL = pageUrl;

	const defuddle = new DefuddleClass(document as unknown as Document, {
		...options,
		url: pageUrl,
	});

	const result = await defuddle.parseAsync();
	toMarkdown(result, options ?? {}, pageUrl);
	toText(result, options ?? {}, pageUrl);
	return result;
}

// Export the Defuddle class for advanced usage
export { DefuddleClass };

// Export Defuddle as both named and default for maximum compatibility
export { Defuddle };
export default Defuddle;

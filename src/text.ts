import { convert } from 'html-to-text';
import type { HtmlToTextOptions, DefuddleResponse, DefuddleOptions } from './types';

// Default options for html-to-text conversion
const DEFAULT_TEXT_OPTIONS: HtmlToTextOptions = {
	wordwrap: false,
	selectors: [
		{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
		{ selector: 'img', format: 'skip' },
		{ selector: 'svg', format: 'skip' },
	],
	preserveNewlines: false,
};

export function createTextContent(
	content: string,
	url: string,
	options?: HtmlToTextOptions
): string {
	const textOptions = options || DEFAULT_TEXT_OPTIONS;
	
	try {
		const text = convert(content, textOptions);
		return text.trim();
	} catch (error) {
		console.error('Error converting HTML to text:', error);
		return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
	}
}

export function toText(
	result: DefuddleResponse,
	options: DefuddleOptions,
	url: string
): void {
	if (options.htmlToText) {
		const textOptions = typeof options.htmlToText === 'object' 
			? options.htmlToText 
			: undefined;
		
		// If both htmlToText and markdown/separateMarkdown are set, 
		// put text in contentText field
		if (options.markdown || options.separateMarkdown) {
			result.contentText = createTextContent(result.content, url, textOptions);
		} else {
			// Otherwise replace content with text
			result.content = createTextContent(result.content, url, textOptions);
		}
	}
}

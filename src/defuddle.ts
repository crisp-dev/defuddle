import { MetadataExtractor } from './metadata';
import { DefuddleOptions, DefuddleResponse, MetaTagItem, DebugRemoval } from './types';
import {
	BLOCK_ELEMENTS_SELECTOR,
	EXACT_SELECTORS,
	PARTIAL_SELECTORS,
	PARTIAL_SELECTORS_REGEX,
	TEST_ATTRIBUTES_SELECTOR,
	ENTRY_POINT_ELEMENTS,
	TEST_ATTRIBUTES,
	FOOTNOTE_LIST_SELECTORS,
	CONDITIONAL_VISIBLE_VARIANTS,
	CONDITIONAL_VISIBLE_VARIANT_PREFIXES
} from './constants';
import { standardizeContent } from './standardize';
import { standardizeFootnotes } from './elements/footnotes';
import { ContentScorer, ContentScore } from './scoring';
import { textPreview } from './utils';
import { parseHTML, serializeHTML, decodeHTMLEntities, isDangerousUrl } from './utils/dom';

interface StyleChange {
	selector: string;
	styles: string;
}

// Content pattern detection constants
const CONTENT_DATE_PATTERN = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}/i;
const CONTENT_READ_TIME_PATTERN = /\d+\s*min(?:ute)?s?\s+read\b/i;
const BOILERPLATE_PATTERNS = [
	/^This (?:article|story|piece) (?:appeared|was published|originally appeared) in\b/i,
	/^A version of this (?:article|story) (?:appeared|was published) in\b/i,
	/^Originally (?:published|appeared) (?:in|on|at)\b/i,
];
const METADATA_STRIP_PATTERNS = [
	/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/gi,
	/\b\d+(?:st|nd|rd|th)?\b/g,
	/\bmin(?:ute)?s?\b/gi,
	/\bread\b/gi,
	/[|·•—–\-,.\s]/g,
];

export class Defuddle {
	private readonly doc: Document;
	private options: DefuddleOptions;
	private debug: boolean;
	private _schemaOrgData: any = undefined;
	private _schemaOrgExtracted = false;
	private _metaTags: MetaTagItem[] | undefined;
	private _metadata: any | undefined;
	private _mobileStyles: StyleChange[] | undefined;


	/**
	 * Create a new Defuddle instance
	 * @param doc - The document to parse
	 * @param options - Options for parsing
	 */
	constructor(doc: Document, options: DefuddleOptions = {}) {
		this.doc = doc;
		this.options = options;
		this.debug = options.debug || false;
	}

	/**
	 * Lazily extract and cache schema.org data. Must be called before
	 * parse() strips script tags from the document.
	 */
	private getSchemaOrgData(): any {
		if (!this._schemaOrgExtracted) {
			this._schemaOrgData = this._extractSchemaOrgData(this.doc);
			this._schemaOrgExtracted = true;
		}
		return this._schemaOrgData;
	}

	/**
	 * Parse the document and extract its main content
	 */
	parse(): DefuddleResponse {
		// Try first with default settings
		let result = this.parseInternal();

		// If result has very little content, try again without clutter removal
		if (result.wordCount < 200) {
			this._log('Initial parse returned very little content, trying again');
			const retryResult = this.parseInternal({
				removePartialSelectors: false
			});

			// Only use the retry if it produces significantly more content.
			// A small increase likely means partial selectors correctly removed
			// clutter (author blocks, related articles, etc.) from a short article.
			// A large increase (2x+) suggests partial selectors were too aggressive.
			if (retryResult.wordCount > result.wordCount * 2) {
				this._log('Retry produced more content');
				result = retryResult;
			}
		}

		// If still very little content, the page may be an index/listing page
		// where card elements were scored as non-content or removed by partial
		// selectors (e.g. "post-preview"). Retry with both disabled.
		if (result.wordCount < 50) {
			this._log('Still very little content, retrying without scoring/partial selectors (possible index page)');
			const indexRetry = this.parseInternal({
				removeLowScoring: false,
				removePartialSelectors: false,
				removeContentPatterns: false
			});
			if (indexRetry.wordCount > result.wordCount) {
				this._log('Index page retry produced more content');
				result = indexRetry;
			}
		}

		// Strip dangerous elements from this.doc before any fallback paths
		// that read from it (e.g. _findContentBySchemaText).
		// This must happen after parseInternal, which needs script tags
		// for schema.org extraction and math.
		this._stripUnsafeElements();

		// If schema.org has a SocialMediaPosting with text content that is
		// longer than what we extracted, the scorer likely picked the wrong
		// element from a feed. Find the correct element in the DOM.
		const schemaText = this._getSchemaText(result.schemaOrgData);
		if (schemaText && this.countWords(schemaText) > result.wordCount) {
			const contentHtml = this._findContentBySchemaText(schemaText);
			if (contentHtml) {
				this._log('Found DOM content matching schema.org text');
				result.content = contentHtml;
				result.wordCount = this.countWords(contentHtml);
			} else {
				this._log('Using schema.org text as content (DOM element not found)');
				result.content = schemaText;
				result.wordCount = this.countWords(schemaText);
			}
		}

		return result;
	}

	/**
	 * Extract text content from schema.org data (e.g. SocialMediaPosting, Article)
	 */
	private _getSchemaText(schemaOrgData: any): string {
		if (!schemaOrgData) return '';

		const items = Array.isArray(schemaOrgData) ? schemaOrgData : [schemaOrgData];
		for (const item of items) {
			if (item?.text && typeof item.text === 'string') {
				return item.text;
			}
			if (item?.articleBody && typeof item.articleBody === 'string') {
				return item.articleBody;
			}
		}
		return '';
	}

	/**
	 * Remove dangerous elements and attributes from this.doc.
	 * Called after parseInternal so schema extraction can still read script tags.
	 * OPTIMIZED: Single-pass DOM traversal combining element and attribute removal.
	 */
	private _stripUnsafeElements(): void {
		const body = this.doc.body;
		if (!body) return;

		// Dangerous element selectors - pre-compile
		const dangerousSelector = 'script:not([type^="math/"]), style, noscript, frame, frameset, object, embed, applet, base';
		const dangerousElements = new Set(Array.from(body.querySelectorAll(dangerousSelector)));

		// Single pass: process all elements for both dangerous tag removal and attribute stripping
		const allElements = body.querySelectorAll('*');
		for (const el of allElements) {
			// Skip if this is a dangerous element (will be removed separately)
			if (dangerousElements.has(el)) continue;

			// Fast path: check if element has any attributes to process
			if (!el.attributes.length) continue;

			// Strip event handlers and dangerous URIs
			for (const attr of Array.from(el.attributes)) {
				const name = attr.name.toLowerCase();
				if (name.startsWith('on')) {
					el.removeAttribute(attr.name);
				} else if (name === 'srcdoc') {
					el.removeAttribute(attr.name);
				} else if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(name)) {
					if (isDangerousUrl(attr.value)) {
						el.removeAttribute(attr.name);
					}
				}
			}
		}

		// Remove dangerous elements in a batch
		dangerousElements.forEach(el => el.remove());
	}

	/**
	 * Find a DOM element whose text matches the schema.org text content.
	 * Used when the content scorer picked the wrong element from a feed page.
	 * Returns the element's inner HTML including sibling media (images, etc.)
	 */
	private _findContentBySchemaText(schemaText: string): string {
		const body = this.doc.body;
		if (!body) return '';

		// Use the first paragraph as the search phrase.
		// DOM textContent concatenates <p> elements without separators,
		// so we can't cross paragraph boundaries when matching.
		const firstPara = schemaText.split(/\n\s*\n/)[0]?.trim() || '';
		const searchPhrase = firstPara.substring(0, 100).trim();
		if (!searchPhrase) return '';

		const schemaWordCount = this.countWords(schemaText);

		// Find the smallest element whose text contains the search phrase
		// and whose word count is close to the schema text's word count
		let bestMatch: Element | null = null;
		let bestSize = Infinity;

		const allElements = body.querySelectorAll('*');
		for (const el of allElements) {
			const elText = (el.textContent || '');
			if (!elText.includes(searchPhrase)) continue;

			const elWords = elText.trim().split(/\s+/).length;
			// Element should contain roughly the same amount of text
			// (allow some slack for surrounding whitespace / minor extras)
			if (elWords >= schemaWordCount * 0.8 && elWords < bestSize) {
				bestSize = elWords;
				bestMatch = el;
			}
		}

		if (!bestMatch) return '';

		// Read the largest sibling image src BEFORE resolveRelativeUrls
		// can mangle comma-containing CDN URLs in srcset attributes
		let imageSrc = '';
		let imageAlt = '';
		const parent = bestMatch.parentElement;
		if (parent && parent !== body) {
			const images = parent.querySelectorAll('img');
			let largestImg: Element | null = null;
			let largestArea = 0;
			for (const img of images) {
				if (bestMatch.contains(img)) continue;
				const w = parseInt(img.getAttribute('width') || '0', 10);
				const h = parseInt(img.getAttribute('height') || '0', 10);
				const area = w * h;
				if (area > largestArea) {
					largestArea = area;
					largestImg = img;
				}
			}
			if (largestImg) {
				imageSrc = this._getLargestImageSrc(largestImg);
				imageAlt = largestImg.getAttribute('alt') || '';
				try {
					const baseUrl = this.options.url || this.doc.URL;
					if (baseUrl) imageSrc = new URL(imageSrc, baseUrl).href;
				} catch {}
			}
		}

		// Now resolve URLs in the text content
		this.resolveRelativeUrls(bestMatch);
		let html = serializeHTML(bestMatch);

		if (imageSrc) {
			const img = this.doc.createElement('img');
			img.setAttribute('src', imageSrc);
			img.setAttribute('alt', imageAlt);
			html += img.outerHTML;
		}

		return html;
	}

	/**
	 * Get the largest available src from an img element,
	 * checking srcset for higher-resolution versions.
	 */
	private _getLargestImageSrc(img: Element): string {
		const srcset = img.getAttribute('srcset') || '';
		if (!srcset) return img.getAttribute('src') || '';

		// Parse srcset entries: each ends with a width descriptor (e.g. "424w")
		// URLs may contain commas (e.g. Substack CDN), so split on width descriptors
		const entryPattern = /(.+?)\s+(\d+(?:\.\d+)?)w/g;
		let bestUrl = '';
		let bestWidth = 0;
		let match;
		let lastIndex = 0;

		while ((match = entryPattern.exec(srcset)) !== null) {
			let url = match[1].trim();
			if (lastIndex > 0) {
				url = url.replace(/^,\s*/, '');
			}
			lastIndex = entryPattern.lastIndex;

			const width = parseFloat(match[2]);
			if (url && width > bestWidth) {
				bestWidth = width;
				bestUrl = url;
			}
		}

		let url = bestUrl || img.getAttribute('src') || '';

		// Strip CDN width/crop constraints to get the full resolution image
		// (e.g. Cloudinary-style params: ,w_852,c_limit → removed)
		url = url.replace(/,w_\d+/g, '').replace(/,c_\w+/g, '');

		return url;
	}

	/**
	 * Parse the document asynchronously.
	 * (Extractors have been removed, so this just calls parse())
	 */
	async parseAsync(): Promise<DefuddleResponse> {
		return this.parse();
	}

	/**
	 * Internal parse method that does the actual work
	 */
	private parseInternal(overrideOptions: Partial<DefuddleOptions> = {}): DefuddleResponse {
		const startTime = Date.now();
		const options = {
			removeExactSelectors: true,
			removePartialSelectors: true,
			removeHiddenElements: true,
			removeLowScoring: true,
			removeSmallImages: true,
			removeContentPatterns: true,
			standardize: true,
			...this.options,
			...overrideOptions
		};
		const debugRemovals: DebugRemoval[] = [];

		// Extract schema.org data (cached — must happen before _stripUnsafeElements removes scripts)
		const schemaOrgData = this.getSchemaOrgData();

		// Cache meta tags and metadata across retries
		if (!this._metaTags) {
			this._metaTags = this._collectMetaTags();
		}
		const pageMetaTags = this._metaTags;

		if (!this._metadata) {
			this._metadata = MetadataExtractor.extract(this.doc, schemaOrgData, pageMetaTags);
		}
		const metadata = this._metadata;

		if (options.removeImages) {
			this.removeImages(this.doc);
		}

		try {
			// Evaluate mobile styles and sizes on original document (cached across retries)
			if (!this._mobileStyles) {
				this._mobileStyles = this._evaluateMediaQueries(this.doc);
			}
			const mobileStyles = this._mobileStyles;

		// Clone document
		const clone = this.doc.cloneNode(true) as Document;

		// Flatten shadow DOM content into the clone
		this.flattenShadowRoots(this.doc, clone);

		// Resolve React streaming SSR suspense boundaries
		this.resolveStreamedContent(clone);

		// Unwrap template content — frameworks like Vue.js use <template slot="contents">
		// to hold the actual page content. We need to extract and insert this content
		// so it becomes visible and can be scored by the content finder.
		this.unwrapTemplateContent(clone);

		// Remove user-specified selectors early in processing
		if (options.removeSelectors && options.removeSelectors.length > 0) {
			const selector = options.removeSelectors.join(',');
			const elements = clone.querySelectorAll(selector);
			let removedCount = 0;
			for (const el of elements) {
				el.remove();
				removedCount++;
			}
			this._log('Removed user-specified selectors:', removedCount);
		}

		// Apply mobile styles to clone
		this.applyMobileStyles(clone, mobileStyles);

			// Find main content
			let mainContent: Element | null = null;
			if (options.contentSelector) {
				mainContent = clone.querySelector(options.contentSelector);
				this._log('Using contentSelector:', options.contentSelector, mainContent ? 'found' : 'not found');
			}
			if (!mainContent) {
				mainContent = this.findMainContent(clone);
			}
			if (!mainContent) {
				const fallbackContent = this.resolveContentUrls(serializeHTML(this.doc.body));
				const endTime = Date.now();
				return {
					content: fallbackContent,
					...metadata,
					wordCount: this.countWords(fallbackContent),
					parseTime: Math.round(endTime - startTime),
					metaTags: pageMetaTags
				};
			}

			// Standardize footnotes before cleanup (CSS sidenotes use display:none)
			if (options.standardize) {
				standardizeFootnotes(mainContent);
			}

			// Scope all subsequent removal passes to mainContent when possible.
			// The full document is only needed when mainContent is body itself,
			// since all content is inside it already. When a more specific element
			// is found, scanning the whole document wastes time on elements
			// (header, nav, footer, etc.) that are never serialized.
			//
			// The removal methods are typed to accept Document but only call
			// querySelectorAll / getElementsByTagName, which exist on Element too.
			// We cast through unknown to satisfy TypeScript.
			const removalRoot =
				(mainContent.tagName.toLowerCase() === 'body')
					? clone
					: mainContent as unknown as Document;

			// Remove small images — scoped to removalRoot so we only scan mainContent
			if (options.removeSmallImages) {
				const smallImages = this.findSmallImages(removalRoot);
				this.removeSmallImages(removalRoot, smallImages);
			}

			// Remove hidden elements using computed styles
			if (options.removeHiddenElements) {
				this.removeHiddenElements(removalRoot, debugRemovals);
			}

			// Remove non-content blocks by scoring
			// Tries to find lists, navigation based on text content and link density
			if (options.removeLowScoring) {
				ContentScorer.scoreAndRemove(removalRoot, this.debug, debugRemovals, mainContent);
			}

			// Remove clutter using selectors
			if (options.removeExactSelectors || options.removePartialSelectors) {
				this.removeBySelector(removalRoot, options.removeExactSelectors, options.removePartialSelectors, mainContent, debugRemovals);
			}

			// Remove elements by content patterns (read time, boilerplate, article cards)
			if (options.removeContentPatterns && mainContent) {
				this.removeByContentPattern(mainContent, this.debug ? debugRemovals : undefined);
			}

			// Normalize the main content
			if (options.standardize) {
				standardizeContent(mainContent, metadata, this.doc, this.debug);
			}

			// Resolve relative URLs to absolute
			this.resolveRelativeUrls(mainContent);

			const content = mainContent.outerHTML;
			const endTime = Date.now();

			const result: DefuddleResponse = {
				content,
				...metadata,
				wordCount: this.countWords(content),
				parseTime: Math.round(endTime - startTime),
				metaTags: pageMetaTags
			};

			if (this.debug) {
				result.debug = {
					contentSelector: this.getElementSelector(mainContent),
					removals: debugRemovals
				};
			}

			return result;
		} catch (error) {
			console.error('Defuddle', 'Error processing document:', error);
			const errorContent = this.resolveContentUrls(serializeHTML(this.doc.body));
			const endTime = Date.now();
			return {
				content: errorContent,
				...metadata,
				wordCount: this.countWords(errorContent),
				parseTime: Math.round(endTime - startTime),
				metaTags: pageMetaTags
			};
		}
	}

	private countWords(content: string): number {
		// Strip HTML tags and decode common entities without DOM parsing
		const text = content
			.replace(/<[^>]*>/g, ' ')
			.replace(/&nbsp;/gi, ' ')
			.replace(/&amp;/gi, '&')
			.replace(/&lt;/gi, '<')
			.replace(/&gt;/gi, '>')
			.replace(/&quot;/gi, '"')
			.replace(/&#\d+;/g, ' ')
			.replace(/&\w+;/g, ' ');

		const trimmed = text.trim();
		if (!trimmed) return 0;

		// Count words by splitting on whitespace
		let count = 0;
		let inWord = false;
		for (let i = 0; i < trimmed.length; i++) {
			const isSpace = trimmed.charCodeAt(i) <= 32;
			if (!isSpace && !inWord) {
				count++;
				inWord = true;
			} else if (isSpace) {
				inWord = false;
			}
		}
		return count;
	}

	// Make all other methods private by removing the static keyword and using private
	private _log(...args: any[]): void {
		if (this.debug) {
			console.log('Defuddle:', ...args);
		}
	}

	private _evaluateMediaQueries(doc: Document): StyleChange[] {
		// linkedom doesn't implement styleSheets properly, so this will return empty
		// Keeping minimal implementation in case a Document with styleSheets is passed
		return [];
	}

	private applyMobileStyles(doc: Document, mobileStyles: StyleChange[]) {
		let appliedCount = 0;

		mobileStyles.forEach(({selector, styles}) => {
			try {
				const elements = doc.querySelectorAll(selector);
				elements.forEach(element => {
					element.setAttribute('style', 
						(element.getAttribute('style') || '') + styles
					);
					appliedCount++;
				});
			} catch (e) {
				console.error('Defuddle', 'Error applying styles for selector:', selector, e);
			}
		});

	}

	private removeImages(doc: Document) {
		const images = doc.getElementsByTagName('img');
		Array.from(images).forEach(image => {
			image.remove();
		});
	}

	// Determine whether a single class token represents an unconditionally hidden
	// utility. Plain "hidden" and responsive/custom variants (e.g. "md:hidden",
	// "not-machine:hidden") count as hidden. State-conditional variants (e.g.
	// "empty:hidden", "group-hover:hidden", "aria-expanded:hidden") do not, since
	// the element stays visible in the default rendered state.
	private isHiddenUtilityClass(token: string): boolean {
		if (token === 'hidden') {
			return true;
		}
		if (!token.endsWith(':hidden')) {
			return false;
		}

		// Inspect each variant segment that precedes the trailing ":hidden".
		const variantPart = token.slice(0, -':hidden'.length);
		const variants = variantPart.split(':');
		for (const variant of variants) {
			const base = variant.toLowerCase();
			if (CONDITIONAL_VISIBLE_VARIANTS.has(base)) {
				return false;
			}
			if (CONDITIONAL_VISIBLE_VARIANT_PREFIXES.some((prefix) => base.startsWith(prefix))) {
				return false;
			}
		}

		return true;
	}

	private removeHiddenElements(doc: Document, debugRemovals?: DebugRemoval[]) {
		let count = 0;
		const elementsToRemove = new Map<Element, string>();

		// Check inline styles and CSS class-based hidden patterns.
		const hiddenStylePattern = /(?:^|;\s*)(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)(?:\s*;|\s*$)/i;

		const allElements = doc.querySelectorAll('*');
		for (const element of allElements) {
			// Skip elements that contain math — sites like Wikipedia wrap MathML
			// in display:none spans for accessibility (the visible version is an
			// image/SVG fallback). We need to preserve these for math extraction.
			if (element.querySelector('math, [data-mathml], .katex-mathml') ||
				element.tagName.toLowerCase() === 'math') {
				continue;
			}

			// Skip <template> elements with content — they're often used by frameworks
			// (Vue.js, web components) to hold actual page content. The slot attribute
			// is a strong indicator, but also preserve any template with child elements.
			if (element.tagName.toLowerCase() === 'template') {
				const hasSlotAttr = element.hasAttribute('slot');
				const hasContent = element.innerHTML.trim().length > 0;
				if (hasSlotAttr || hasContent) {
					continue;
				}
			}

			// Check inline style for hidden patterns
			const style = element.getAttribute('style');
			if (style && hiddenStylePattern.test(style)) {
				const reason = style.includes('display') ? 'display:none' :
					style.includes('visibility') ? 'visibility:hidden' : 'opacity:0';
				elementsToRemove.set(element, reason);
				count++;
				continue;
			}

			// Detect CSS framework hidden utilities (e.g. Tailwind's "hidden",
			// "sm:hidden", "not-machine:hidden"). Skip conditional state variants
			// like "empty:hidden" or "group-hover:hidden" that leave the element
			// visible in the default rendered state.
			const className = element.getAttribute('class') || '';
			if (className) {
				const tokens = className.split(/\s+/);
				for (const token of tokens) {
					if (this.isHiddenUtilityClass(token)) {
						elementsToRemove.set(element, `class:${token}`);
						count++;
						break;
					}
				}
			}
		}

		// Batch remove all hidden elements
		elementsToRemove.forEach((reason, el) => {
			if (this.debug && debugRemovals) {
				debugRemovals.push({
					step: 'removeHiddenElements',
					reason,
					text: textPreview(el)
				});
			}
			el.remove();
		});
		this._log('Removed hidden elements:', count);
	}

	private removeBySelector(doc: Document, removeExact: boolean = true, removePartial: boolean = true, mainContent?: Element | null, debugRemovals?: DebugRemoval[]) {
		const startTime = Date.now();
		let exactSelectorCount = 0;
		let partialSelectorCount = 0;

		// Track all elements to be removed, with their match type
		const elementsToRemove = new Map<Element, { type: 'exact' | 'partial'; selector?: string }>();

		// First collect elements matching exact selectors
		if (removeExact) {
			const exactElements = doc.querySelectorAll(EXACT_SELECTORS.join(','));
			exactElements.forEach(el => {
				if (el?.parentNode) {
					// Skip elements inside code blocks (e.g. syntax highlighting spans)
					if (el.closest('pre, code')) {
						return;
					}
					elementsToRemove.set(el, { type: 'exact' });
					exactSelectorCount++;
				}
			});
		}

		if (removePartial) {
			// Use module-level pre-compiled regex (avoids rebuilding 534-pattern regex per parse)
			const partialRegex = PARTIAL_SELECTORS_REGEX;

			// Pre-compile individual regexes for debug pattern identification only
			const individualRegexes = this.debug
				? PARTIAL_SELECTORS.map(p => ({ pattern: p, regex: new RegExp(p, 'i') }))
				: null;

			// Use pre-built attribute selector for elements we care about
			const allElements = doc.querySelectorAll(TEST_ATTRIBUTES_SELECTOR);

			// Process elements for partial matches
			allElements.forEach(el => {
				// Skip if already marked for removal
				if (elementsToRemove.has(el)) {
					return;
				}

				// Skip code elements and elements containing code blocks
				// where class names indicate language/syntax, not page structure
				const tag = el.tagName;
				if (tag === 'CODE' || tag === 'PRE' || el.querySelector('pre')) {
					return;
				}

				// Get all relevant attributes and combine into a single string
				const attrs = TEST_ATTRIBUTES.map(attr => {
					if (attr === 'class') {
						return el.className && typeof el.className === 'string' ? el.className : '';
					}
					if (attr === 'id') {
						return el.id || '';
					}
					return el.getAttribute(attr) || '';
				}).join(' ').toLowerCase();

				// Skip if no attributes to check
				if (!attrs.trim()) {
					return;
				}

				// Check for partial match using single regex test
				if (partialRegex.test(attrs)) {
					const matchedPattern = individualRegexes
						? individualRegexes.find(r => r.regex.test(attrs))?.pattern
						: undefined;
					elementsToRemove.set(el, { type: 'partial', selector: matchedPattern });
					partialSelectorCount++;
				}
			});
		}

		// Remove all collected elements in a single pass
		// Skip elements that are ancestors of mainContent to avoid disconnecting it
		// Skip footnote list containers, their parents, and immediate children
		// Skip anchor links inside headings - the heading transform handles these
		elementsToRemove.forEach(({ type, selector }, el) => {
			if (mainContent && el.contains(mainContent)) {
				return;
			}
			// Keep ASP.NET page-wrapper forms — removing them deletes all content.
			// Their boilerplate children are still removed by their own selectors.
			if (el.tagName === 'FORM' && this.isPageWrapperForm(el)) {
				return;
			}
			if (el.tagName === 'A' && el.closest('h1, h2, h3, h4, h5, h6')) {
				return;
			}
			try {
				if (el.matches(FOOTNOTE_LIST_SELECTORS) || el.querySelector(FOOTNOTE_LIST_SELECTORS)) {
					return;
				}
				// Protect immediate children of footnote containers (e.g. wikidot div.footnote-footer)
				const parent = el.parentElement;
				if (parent && parent.matches(FOOTNOTE_LIST_SELECTORS)) {
					return;
				}
			} catch (e) {}
			if (this.debug && debugRemovals) {
				debugRemovals.push({
					step: 'removeBySelector',
					selector: type === 'exact' ? 'exact' : selector,
					reason: type === 'exact' ? 'exact selector match' : `partial match: ${selector}`,
					text: textPreview(el)
				});
			}
			el.remove();
		});

		const endTime = Date.now();
		this._log('Removed clutter elements:', {
			exactSelectors: exactSelectorCount,
			partialSelectors: partialSelectorCount,
			total: elementsToRemove.size,
			processingTime: `${(endTime - startTime).toFixed(2)}ms`
		});
	}

	/**
	 * A <form> that wraps the whole page rather than being an input form.
	 * ASP.NET WebForms marks these with __VIEWSTATE / __EVENTVALIDATION inputs.
	 */
	private isPageWrapperForm(form: Element): boolean {
		return !!form.querySelector(
			'input[name="__VIEWSTATE"], input[name="__EVENTVALIDATION"], input[id="__VIEWSTATE"], input[id="__EVENTVALIDATION"]'
		);
	}

	// Find small IMG and SVG elements
	private findSmallImages(doc: Document): Set<string> {
		const MIN_DIMENSION = 33;
		const smallImages = new Set<string>();
		let processedCount = 0;

		const elements = doc.querySelectorAll('img, svg');

		for (const element of elements) {
			const attrWidth = parseInt(element.getAttribute('width') || '0');
			const attrHeight = parseInt(element.getAttribute('height') || '0');

			// Check inline style dimensions
			const style = element.getAttribute('style') || '';
			const styleWidth = parseInt(style.match(/width\s*:\s*(\d+)/)?.[1] || '0');
			const styleHeight = parseInt(style.match(/height\s*:\s*(\d+)/)?.[1] || '0');

			const widths = [attrWidth, styleWidth].filter(d => d > 0);
			const heights = [attrHeight, styleHeight].filter(d => d > 0);

			if (widths.length > 0 && heights.length > 0) {
				const effectiveWidth = Math.min(...widths);
				const effectiveHeight = Math.min(...heights);

				if (effectiveWidth < MIN_DIMENSION || effectiveHeight < MIN_DIMENSION) {
					const identifier = this.getElementIdentifier(element);
					if (identifier) {
						smallImages.add(identifier);
						processedCount++;
					}
				}
			}
		}

		this._log('Found small elements:', processedCount);
		return smallImages;
	}

	private removeSmallImages(doc: Document, smallImages: Set<string>) {
		let removedCount = 0;

		// OPTIMIZED: Use querySelectorAll with static NodeList instead of live HTMLCollection
		// getElementsByTagName returns a live collection that reindexes on removal (O(n²))
		const elements = doc.querySelectorAll('img, svg');
		const elementsArray = Array.from(elements);
		
		for (const element of elementsArray) {
			const identifier = this.getElementIdentifier(element);
			if (identifier && smallImages.has(identifier)) {
				element.remove();
				removedCount++;
			}
		}

		this._log('Removed small elements:', removedCount);
	}

	private getElementIdentifier(element: Element): string | null {
		// Try to create a unique identifier using various attributes
		if (element.tagName.toLowerCase() === 'img') {
			// For lazy-loaded images, use data-src as identifier if available
			const dataSrc = element.getAttribute('data-src');
			if (dataSrc) return `src:${dataSrc}`;
			
			const src = element.getAttribute('src') || '';
			const srcset = element.getAttribute('srcset') || '';
			const dataSrcset = element.getAttribute('data-srcset');
			
			if (src) return `src:${src}`;
			if (srcset) return `srcset:${srcset}`;
			if (dataSrcset) return `srcset:${dataSrcset}`;
		}

		const id = element.id || '';
		const className = element.className || '';
		const viewBox = element.tagName.toLowerCase() === 'svg' ? element.getAttribute('viewBox') || '' : '';
		
		if (id) return `id:${id}`;
		if (viewBox) return `viewBox:${viewBox}`;
		if (className) return `class:${className}`;
		
		return null;
	}

	private findMainContent(doc: Document): Element | null {
		// Find all potential content containers
		const candidates: { element: Element; score: number; selectorIndex: number }[] = [];

		ENTRY_POINT_ELEMENTS.forEach((selector, index) => {
			const elements = doc.querySelectorAll(selector);
			elements.forEach(element => {
				// Base score from selector priority (earlier = higher)
				let score = (ENTRY_POINT_ELEMENTS.length - index) * 40;

				// Add score based on content analysis
				score += ContentScorer.scoreElement(element);

				candidates.push({ element, score, selectorIndex: index });
			});
		});

		if (candidates.length === 0) {
			// Fall back to scoring block elements
			return this.findContentByScoring(doc);
		}

		// Sort by score descending
		candidates.sort((a, b) => b.score - a.score);

		if (this.debug) {
			this._log('Content candidates:', candidates.map(c => ({
				element: c.element.tagName,
				selector: this.getElementSelector(c.element),
				score: c.score
			})));
		}

		// Only <body> matched: no semantic wrapper. Try table layouts, then
		// scoring, before falling back to <body> (where cleanup can strip the
		// content along with page-level wrappers like an ASP.NET <form>).
		if (candidates.length === 1 && candidates[0].element.tagName.toLowerCase() === 'body') {
			const tableContent = this.findTableBasedContent(doc);
			if (tableContent) {
				return tableContent;
			}
			const scoredContent = this.findContentByScoring(doc);
			if (scoredContent && this.isConfidentContentNarrowing(scoredContent, candidates[0].element)) {
				return scoredContent;
			}
		}

		// If the top candidate contains a child candidate that matched a
		// higher-priority selector, prefer the most specific (deepest) child.
		// This prevents e.g. <main> from winning over a contained <article>
		// just because sibling noise inflates the parent's content score.
		// Only prefer the child if it has meaningful content (>50 words),
		// otherwise it may be an empty card element (e.g. related article cards).
		// Skip this when the parent contains multiple children matching the
		// same selector — that indicates a listing/portfolio page where the
		// parent is the real content container.
		// OPTIMIZED: Pre-compute word counts and use Map for O(1) lookups instead of O(n²) nested loops.
		const top = candidates[0];
		let best = top;
		
		// Pre-compute word counts for all candidates to avoid repeated textContent access
		const candidateWordCounts = new Map(candidates.map(c => [c, (c.element.textContent || '').split(/\s+/).length]));
		
		// Build a Map of selectorIndex -> count within top element for O(1) lookup
		const siblingsCountMap = new Map<number, number>();
		for (const c of candidates) {
			if (top.element.contains(c.element)) {
				siblingsCountMap.set(c.selectorIndex, (siblingsCountMap.get(c.selectorIndex) || 0) + 1);
			}
		}
		
		for (let i = 1; i < candidates.length; i++) {
			const child = candidates[i];
			const childWords = candidateWordCounts.get(child) || 0;
			if (child.selectorIndex < best.selectorIndex && best.element.contains(child.element) && childWords > 50) {
				// Check if multiple candidates share this selector index inside top
				const siblingsAtIndex = siblingsCountMap.get(child.selectorIndex) || 0;
				if (siblingsAtIndex > 1) {
					// Multiple articles/cards inside the parent — it's a listing page
					continue;
				}
				best = child;
			}
		}
		if (best !== top) {
			return best.element;
		}

		return top.element;
	}

	private findTableBasedContent(doc: Document): Element | null {
		// First check if this looks like an old-style table-based layout
		const tables = Array.from(doc.getElementsByTagName('table'));
		const hasTableLayout = tables.some(table => {
			const width = parseInt(table.getAttribute('width') || '0');
			// OPTIMIZED: Check inline style width instead of expensive getComputedStyle
			// This is much faster in JSDOM/linkedom and sufficient for table detection
			const styleAttr = table.getAttribute('style') || '';
			const styleWidthMatch = styleAttr.match(/width\s*:\s*(\d+)px/i);
			const styleWidth = styleWidthMatch ? parseInt(styleWidthMatch[1]) : 0;
			
			return width > 400 ||
				styleWidth > 400 ||
				table.getAttribute('align') === 'center' ||
				(table.className || '').toLowerCase().includes('content') ||
				(table.className || '').toLowerCase().includes('article');
		});

		if (!hasTableLayout) {
			return null; // Don't try table-based extraction for modern layouts
		}

		const cells = Array.from(doc.getElementsByTagName('td'));
		return ContentScorer.findBestElement(cells);
	}

	private findContentByScoring(doc: Document): Element | null {
		const candidates: ContentScore[] = [];

		doc.querySelectorAll(BLOCK_ELEMENTS_SELECTOR).forEach((element: Element) => {
			const score = ContentScorer.scoreElement(element);
			if (score > 0) {
				candidates.push({ score, element });
			}
		});

		return candidates.length > 0 ? candidates.sort((a, b) => b.score - a.score)[0].element : null;
	}

	/**
	 * Whether to narrow from <body> to a scored element. Requires the element to
	 * hold most of the body's text (>= 60%, so it isn't a stray fragment) while
	 * leaving real noise outside it (>= 200 chars, so narrowing is worthwhile).
	 */
	private isConfidentContentNarrowing(element: Element, body: Element): boolean {
		const textLen = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim().length;
		const bodyLen = textLen(body);
		if (bodyLen === 0) return false;
		const elementLen = textLen(element);
		return (elementLen / bodyLen) >= 0.6 && (bodyLen - elementLen) >= 200;
	}

	private getElementSelector(element: Element): string {
		const parts: string[] = [];
		let current: Element | null = element;
		
		while (current && current !== this.doc.documentElement) {
			let selector = current.tagName.toLowerCase();
			if (current.id) {
				selector += '#' + current.id;
			} else if (current.className && typeof current.className === 'string') {
				selector += '.' + current.className.trim().split(/\s+/).join('.');
			}
			parts.unshift(selector);
			current = current.parentElement;
		}
		
		return parts.join(' > ');
	}

	/**
	 * Resolve relative URLs to absolute within a DOM element
	 */
	private resolveRelativeUrls(element: Element): void {
		const baseUrl = this.options.url || this.doc.URL;
		if (!baseUrl) return;

		const resolve = (url: string): string => {
			try {
				return new URL(url, baseUrl).href;
			} catch {
				return url;
			}
		};

		element.querySelectorAll('[href]').forEach(el => {
			const href = el.getAttribute('href');
			if (href) el.setAttribute('href', resolve(href));
		});

		element.querySelectorAll('[src]').forEach(el => {
			const src = el.getAttribute('src');
			if (src) el.setAttribute('src', resolve(src));
		});

		element.querySelectorAll('[srcset]').forEach(el => {
			const srcset = el.getAttribute('srcset');
			if (srcset) {
				// Parse srcset using width/density descriptors as delimiters,
				// not commas — URLs may contain commas (e.g. CDN transform params)
				const entryPattern = /(.+?)\s+(\d+(?:\.\d+)?[wx])/g;
				const entries: string[] = [];
				let match;
				let lastIdx = 0;

				while ((match = entryPattern.exec(srcset)) !== null) {
					let url = match[1].trim();
					if (lastIdx > 0) {
						url = url.replace(/^,\s*/, '');
					}
					lastIdx = entryPattern.lastIndex;
					entries.push(`${resolve(url)} ${match[2]}`);
				}

				if (entries.length > 0) {
					el.setAttribute('srcset', entries.join(', '));
				} else {
					// Fallback: simple comma split for srcsets without descriptors
					const resolved = srcset.split(',').map(entry => {
						const parts = entry.trim().split(/\s+/);
						if (parts[0]) parts[0] = resolve(parts[0]);
						return parts.join(' ');
					}).join(', ');
					el.setAttribute('srcset', resolved);
				}
			}
		});

		element.querySelectorAll('[poster]').forEach(el => {
			const poster = el.getAttribute('poster');
			if (poster) el.setAttribute('poster', resolve(poster));
		});
	}

	/**
	 * Flatten shadow DOM content into a cloned document.
	 * Walks both trees in parallel so positional correspondence is exact.
	 */
	private flattenShadowRoots(original: Document, clone: Document): void {
		const origElements = Array.from(original.body.querySelectorAll('*'));

		// Find the first element with a shadow root (also serves as the hasShadowRoots check)
		const firstShadow = origElements.find(el => el.shadowRoot);
		if (!firstShadow) return;

		const cloneElements = Array.from(clone.body.querySelectorAll('*'));

		// Check if we can directly read shadow DOM content (main world / Node.js).
		// In content script isolated worlds, shadowRoot exists but content is empty.
		const canReadShadow = (firstShadow.shadowRoot?.childNodes?.length ?? 0) > 0;

		if (canReadShadow) {
			// Direct traversal works (main world / Node.js)
			for (let i = origElements.length - 1; i >= 0; i--) {
				const origEl = origElements[i];
				if (!origEl.shadowRoot) continue;

				const cloneEl = cloneElements[i];
				if (!cloneEl) continue;

				const shadowHtml = origEl.shadowRoot.innerHTML;
				if (shadowHtml.length > 0) {
					this.replaceShadowHost(cloneEl, shadowHtml, clone);
				}
			}
		} else {
			// Content script isolated world — read data-defuddle-shadow attributes
			// stamped by an external main-world script.
			const shadowData: {cloneEl: Element, html: string}[] = [];
			for (let i = 0; i < origElements.length; i++) {
				const origEl = origElements[i];
				const shadowHtml = origEl.getAttribute('data-defuddle-shadow');
				if (!shadowHtml) continue;

				const cloneEl = cloneElements[i];
				if (!cloneEl) continue;

				shadowData.push({cloneEl, html: shadowHtml});
				// Clean up temporary attributes from both original and clone
				origEl.removeAttribute('data-defuddle-shadow');
				cloneEl.removeAttribute('data-defuddle-shadow');
			}
			for (const {cloneEl, html} of shadowData) {
				this.replaceShadowHost(cloneEl, html, clone);
			}
		}
	}

	/**
	 * Resolve React streaming SSR suspense boundaries.
	 * React's streaming SSR places content in hidden divs (id="S:0") and
	 * template placeholders (id="B:0") with $RC scripts to swap them.
	 * Since we don't execute scripts, we perform the swap manually.
	 */
	private resolveStreamedContent(doc: Document): void {
		// Find $RC("B:X","S:X") calls in inline scripts
		const scripts = doc.querySelectorAll('script');
		const swaps: { templateId: string; contentId: string }[] = [];
		const rcPattern = /\$RC\("(B:\d+)","(S:\d+)"\)/g;

		for (const script of scripts) {
			const text = script.textContent || '';
			if (!text.includes('$RC(')) continue;
			rcPattern.lastIndex = 0;
			let match;
			while ((match = rcPattern.exec(text)) !== null) {
				swaps.push({ templateId: match[1], contentId: match[2] });
			}
		}

		if (swaps.length === 0) return;

		let swapCount = 0;
		for (const { templateId, contentId } of swaps) {
			const template = doc.getElementById(templateId);
			const content = doc.getElementById(contentId);
			if (!template || !content) continue;

			const parent = template.parentNode;
			if (!parent) continue;

			// Remove the fallback/skeleton content after the template
			// until the <!--/$--> comment marker
			let next = template.nextSibling;
			let foundMarker = false;
			while (next) {
				const following = next.nextSibling;
				if (next.nodeType === 8 && (next as Comment).data === '/$') {
					next.remove();
					foundMarker = true;
					break;
				}
				next.remove();
				next = following;
			}

			// Skip swap if marker wasn't found — malformed streaming output
			if (!foundMarker) continue;

			// Insert content children before the template position
			while (content.firstChild) {
				parent.insertBefore(content.firstChild, template);
			}

			// Clean up the template and hidden div
			template.remove();
			content.remove();
			swapCount++;
		}

		if (swapCount > 0) {
			this._log('Resolved streamed content:', swapCount, 'suspense boundaries');
		}
	}

	/**
	 * Unwrap content from <template> elements that contain actual page content.
	 * Frameworks like Vue.js and some CMS systems use <template slot="contents">
	 * to hold the main article content. The template content is not rendered by
	 * default, so we extract it and replace the template with its content.
	 */
	private unwrapTemplateContent(doc: Document): void {
		const templates = doc.querySelectorAll('template[slot]');
		let unwrappedCount = 0;

		for (const template of templates) {
			const content = (template as HTMLTemplateElement).content;
			if (!content || content.childNodes.length === 0) continue;

			const parent = template.parentNode;
			if (!parent) continue;

			// Clone the content so we can insert it
			const fragment = content.cloneNode(true) as DocumentFragment;

			// Insert content before the template
			parent.insertBefore(fragment, template);

			// Remove the template element
			template.remove();
			unwrappedCount++;
		}

		if (unwrappedCount > 0) {
			this._log('Unwrapped template content:', unwrappedCount, 'templates');
		}
	}

	/**
	 * Replace a shadow DOM host element with a div containing its shadow content.
	 * Custom elements (tag names with hyphens) would re-initialize when inserted
	 * into a live DOM, recreating their shadow roots and hiding the content.
	 */
	private replaceShadowHost(el: Element, shadowHtml: string, doc: Document): void {
		const fragment = parseHTML(doc, shadowHtml);
		if (el.tagName.includes('-')) {
			// Custom element — replace with a div to prevent re-initialization
			const div = doc.createElement('div');
			div.appendChild(fragment);
			el.parentNode?.replaceChild(div, el);
		} else {
			el.textContent = '';
			el.appendChild(fragment);
		}
	}

	/**
	 * Resolve relative URLs in an HTML string
	 */
	private resolveContentUrls(html: string): string {
		const baseUrl = this.options.url || this.doc.URL;
		if (!baseUrl) return html;

		const container = this.doc.createElement('div');
		container.appendChild(parseHTML(this.doc, html));
		this.resolveRelativeUrls(container);
		return serializeHTML(container);
	}

	private _extractSchemaOrgData(doc: Document): any {
		const schemaScripts = doc.querySelectorAll('script[type="application/ld+json"]');
		const rawSchemaItems: any[] = [];

		schemaScripts.forEach(script => {
			let jsonContent = script.textContent || '';
			let jsonData: any = null;
			
			try {
				jsonContent = jsonContent
					.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '')
					.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
					.replace(/^\s*(\*\/|\/\*)\s*|\s*(\*\/|\/\*)\s*$/g, '')
					// Remove illegal control characters that JSON doesn't allow in strings
					.replace(/[\x00-\x1F\x7F]/g, '')
					.trim();
					
				jsonData = JSON.parse(jsonContent);

				if (jsonData['@graph'] && Array.isArray(jsonData['@graph'])) {
					rawSchemaItems.push(...jsonData['@graph']);
				} else {
					rawSchemaItems.push(jsonData);
				}
			} catch (error) {
				// Silently skip malformed JSON-LD scripts
				if (this.debug) {
					console.error('Defuddle: Error parsing schema.org data:', error);
					console.error('Defuddle: Problematic JSON content:', jsonContent);
				}
			}
		});

		const decodeStringsInObject = (item: any): any => {
			if (typeof item === 'string') {
				return this._decodeHTMLEntities(item);
			} else if (Array.isArray(item)) {
				return item.map(decodeStringsInObject);
			} else if (typeof item === 'object' && item !== null) {
				const newItem: { [key: string]: any } = {};
				for (const key in item) {
					if (Object.prototype.hasOwnProperty.call(item, key)) {
						newItem[key] = decodeStringsInObject(item[key]);
					}
				}
				return newItem;
			}
			return item;
		};

		return rawSchemaItems.map(decodeStringsInObject);
	}

	private _collectMetaTags(): MetaTagItem[] {
		const pageMetaTags: MetaTagItem[] = [];
		this.doc.querySelectorAll('meta').forEach(meta => {
			const name = meta.getAttribute('name');
			const property = meta.getAttribute('property');
			let content = meta.getAttribute('content');
			if (content) {
				pageMetaTags.push({ name, property, content: this._decodeHTMLEntities(content) });
			}
		});
		return pageMetaTags;
	}

	private _decodeHTMLEntities(text: string): string {
		return decodeHTMLEntities(this.doc, text);
	}

	/**
	 * Content-based pattern removal for elements that can't be detected by
	 * CSS selectors (e.g. Tailwind/CSS-in-JS sites with non-semantic class names).
	 */
	private removeByContentPattern(mainContent: Element, debugRemovals?: DebugRemoval[]) {
		// Remove read time metadata (e.g. "Mar 4th 2026 | 3 min read")
		// Only removes leaf elements whose text is PURELY date + read time,
		// not mixed with other meaningful content like tag names.
		const candidates = Array.from(mainContent.querySelectorAll('p, span, div, time'));
		for (const el of candidates) {
			if (!el.parentNode) continue;
			if (el.closest('pre') || el.closest('code')) continue;

			const text = el.textContent?.trim() || '';
			const words = text.split(/\s+/).length;

			// Match date + read time in short elements
			if (words <= 15 && CONTENT_DATE_PATTERN.test(text) && CONTENT_READ_TIME_PATTERN.test(text)) {
				// Ensure this is a leaf-ish element, not a large container
				if (el.querySelectorAll('p, div, section, article').length === 0) {
					// Verify the text is ONLY date + read time metadata
					// by stripping all date/time words and checking nothing remains
					let cleaned = text;
					for (const pattern of METADATA_STRIP_PATTERNS) {
						cleaned = cleaned.replace(pattern, '');
					}
					if (cleaned.trim().length > 0) continue;

					if (this.debug && debugRemovals) {
						debugRemovals.push({
							step: 'removeByContentPattern',
							reason: 'read time metadata',
							text: textPreview(el)
						});
					}
					el.remove();
				}
			}
		}

		// Remove standalone time/date elements near the start or end of content.
		// A <time> in its own paragraph at the boundary is metadata (publish date),
		// but <time> inline within prose should be preserved (see issue #136).
		const timeElements = Array.from(mainContent.querySelectorAll('time'));
		const contentText = mainContent.textContent || '';
		for (const time of timeElements) {
			if (!time.parentNode) continue;
			// Walk up through inline/formatting wrappers only (i, em, span, b, strong)
			// Stop at block elements to avoid removing containers with other content.
			let target: Element = time;
			let targetText = target.textContent?.trim() || '';
			while (target.parentElement && target.parentElement !== mainContent) {
				const parentTag = target.parentElement.tagName.toLowerCase();
				const parentText = target.parentElement.textContent?.trim() || '';
				// If parent is a <p> that only wraps this time, include it
				if (parentTag === 'p' && parentText === targetText) {
					target = target.parentElement;
					break;
				}
				// Only walk through inline formatting wrappers
				if (['i', 'em', 'span', 'b', 'strong', 'small'].includes(parentTag) &&
					parentText === targetText) {
					target = target.parentElement;
					targetText = parentText;
					continue;
				}
				break;
			}
			const text = target.textContent?.trim() || '';
			const words = text.split(/\s+/).length;
			if (words > 10) continue;
			// Check if this element is near the start or end of mainContent
			const pos = contentText.indexOf(text);
			const distFromEnd = contentText.length - (pos + text.length);
			if (pos > 200 && distFromEnd > 200) continue;
			if (this.debug && debugRemovals) {
				debugRemovals.push({
					step: 'removeByContentPattern',
					reason: 'boundary date element',
					text: textPreview(target)
				});
			}
			target.remove();
		}

		// Remove section breadcrumbs
		// Short elements containing a link to a parent section of the current URL.
		const url = this.options.url || this.doc.URL || '';
		let urlPath = '';
		try { urlPath = new URL(url).pathname; } catch {}
		if (urlPath) {
			const shortElements = mainContent.querySelectorAll('div, span, p');
			for (const el of shortElements) {
				if (!el.parentNode) continue;
				const text = el.textContent?.trim() || '';
				const words = text.split(/\s+/).length;
				if (words > 10) continue;
				// Must be a leaf-ish element (no block children)
				if (el.querySelectorAll('p, div, section, article').length > 0) continue;
				const link = el.querySelector('a[href]');
				if (!link) continue;
				try {
					const linkPath = new URL(link.getAttribute('href') || '', url).pathname;
					if (linkPath !== '/' && linkPath !== urlPath && urlPath.startsWith(linkPath)) {
						if (this.debug && debugRemovals) {
							debugRemovals.push({
								step: 'removeByContentPattern',
								reason: 'section breadcrumb',
								text: textPreview(el)
							});
						}
						el.remove();
					}
				} catch {}
			}
		}

		// Remove boilerplate sentences and trailing non-content.
		// Search elements for end-of-article boilerplate, then truncate
		// from the best ancestor that has siblings to remove.
		const fullText = mainContent.textContent || '';
		const boilerplateElements = mainContent.querySelectorAll('p, div, span, section');
		for (const el of boilerplateElements) {
			if (!el.parentNode) continue;
			const text = el.textContent?.trim() || '';
			const words = text.split(/\s+/).length;
			if (words > 50 || words < 3) continue;

			for (const pattern of BOILERPLATE_PATTERNS) {
				if (pattern.test(text)) {
					// Walk up to find an ancestor that has next siblings to truncate.
					// Don't walk all the way to mainContent's direct child — if there's
					// a single wrapper div, that would remove everything.
					let target: Element = el;
					while (target.parentElement && target.parentElement !== mainContent) {
						if (target.nextElementSibling) break;
						target = target.parentElement;
					}

					// Only truncate if there's substantial content before the boilerplate
					const targetText = target.textContent || '';
					const targetPos = fullText.indexOf(targetText);
					if (targetPos < 200) continue;

					// Collect ancestors before modifying the DOM
					const ancestors: Element[] = [];
					let anc = target.parentElement;
					while (anc && anc !== mainContent) {
						ancestors.push(anc);
						anc = anc.parentElement;
					}

					// Remove target element and its following siblings
					this.removeTrailingSiblings(target, true, debugRemovals);

					// Cascade upward: remove following siblings at each
					// ancestor level too. Everything after the boilerplate
					// in document order is non-content.
					for (const ancestor of ancestors) {
						this.removeTrailingSiblings(ancestor, false, debugRemovals);
					}
					return;
				}
			}
		}
	}

	/**
	 * Remove an element's following siblings, and optionally the element itself.
	 */
	private removeTrailingSiblings(element: Element, removeSelf: boolean, debugRemovals?: DebugRemoval[]) {
		let sibling = element.nextElementSibling;
		while (sibling) {
			const next = sibling.nextElementSibling;
			if (this.debug && debugRemovals) {
				debugRemovals.push({
					step: 'removeByContentPattern',
					reason: 'trailing non-content',
					text: textPreview(sibling)
				});
			}
			sibling.remove();
			sibling = next;
		}
		if (removeSelf) {
			if (this.debug && debugRemovals) {
				debugRemovals.push({
					step: 'removeByContentPattern',
					reason: 'boilerplate text',
					text: textPreview(element)
				});
			}
			element.remove();
		}
	}
}

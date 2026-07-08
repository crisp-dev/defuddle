import { DefuddleOptions, DefuddleResponse } from './types';
export declare class Defuddle {
    private readonly doc;
    private options;
    private debug;
    private _schemaOrgData;
    private _schemaOrgExtracted;
    private _metaTags;
    private _metadata;
    private _mobileStyles;
    /**
     * Create a new Defuddle instance
     * @param doc - The document to parse
     * @param options - Options for parsing
     */
    constructor(doc: Document, options?: DefuddleOptions);
    /**
     * Lazily extract and cache schema.org data. Must be called before
     * parse() strips script tags from the document.
     */
    private getSchemaOrgData;
    /**
     * Parse the document and extract its main content
     */
    parse(): DefuddleResponse;
    /**
     * Extract text content from schema.org data (e.g. SocialMediaPosting, Article)
     */
    private _getSchemaText;
    /**
     * Remove dangerous elements and attributes from this.doc.
     * Called after parseInternal so schema extraction can still read script tags.
     * OPTIMIZED: Single-pass DOM traversal combining element and attribute removal.
     */
    private _stripUnsafeElements;
    /**
     * Find a DOM element whose text matches the schema.org text content.
     * Used when the content scorer picked the wrong element from a feed page.
     * Returns the element's inner HTML including sibling media (images, etc.)
     */
    private _findContentBySchemaText;
    /**
     * Get the largest available src from an img element,
     * checking srcset for higher-resolution versions.
     */
    private _getLargestImageSrc;
    /**
     * Parse the document asynchronously.
     * (Extractors have been removed, so this just calls parse())
     */
    parseAsync(): Promise<DefuddleResponse>;
    /**
     * Internal parse method that does the actual work
     */
    private parseInternal;
    private countWords;
    private _log;
    private _evaluateMediaQueries;
    private applyMobileStyles;
    private removeImages;
    private isHiddenUtilityClass;
    private removeHiddenElements;
    private removeBySelector;
    /**
     * A <form> that wraps the whole page rather than being an input form.
     * ASP.NET WebForms marks these with __VIEWSTATE / __EVENTVALIDATION inputs.
     */
    private isPageWrapperForm;
    private findSmallImages;
    private removeSmallImages;
    private getElementIdentifier;
    private findMainContent;
    private findTableBasedContent;
    private findContentByScoring;
    /**
     * Whether to narrow from <body> to a scored element. Requires the element to
     * hold most of the body's text (>= 60%, so it isn't a stray fragment) while
     * leaving real noise outside it (>= 200 chars, so narrowing is worthwhile).
     */
    private isConfidentContentNarrowing;
    private getElementSelector;
    /**
     * Resolve relative URLs to absolute within a DOM element
     */
    private resolveRelativeUrls;
    /**
     * Flatten shadow DOM content into a cloned document.
     * Walks both trees in parallel so positional correspondence is exact.
     */
    private flattenShadowRoots;
    /**
     * Resolve React streaming SSR suspense boundaries.
     * React's streaming SSR places content in hidden divs (id="S:0") and
     * template placeholders (id="B:0") with $RC scripts to swap them.
     * Since we don't execute scripts, we perform the swap manually.
     */
    private resolveStreamedContent;
    /**
     * Unwrap content from <template> elements that contain actual page content.
     * Frameworks like Vue.js and some CMS systems use <template slot="contents">
     * to hold the main article content. The template content is not rendered by
     * default, so we extract it and replace the template with its content.
     */
    private unwrapTemplateContent;
    /**
     * Replace a shadow DOM host element with a div containing its shadow content.
     * Custom elements (tag names with hyphens) would re-initialize when inserted
     * into a live DOM, recreating their shadow roots and hiding the content.
     */
    private replaceShadowHost;
    /**
     * Resolve relative URLs in an HTML string
     */
    private resolveContentUrls;
    private _extractSchemaOrgData;
    private _collectMetaTags;
    private _decodeHTMLEntities;
    /**
     * Content-based pattern removal for elements that can't be detected by
     * CSS selectors (e.g. Tailwind/CSS-in-JS sites with non-semantic class names).
     */
    private removeByContentPattern;
    /**
     * Remove an element's following siblings, and optionally the element itself.
     */
    private removeTrailingSiblings;
}

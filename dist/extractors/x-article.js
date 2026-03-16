"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XArticleExtractor = void 0;
const _base_1 = require("./_base");
const dom_1 = require("../utils/dom");
const SELECTORS = {
    ARTICLE_CONTAINER: '[data-testid="twitterArticleRichTextView"]',
    TITLE: '[data-testid="twitter-article-title"]',
    AUTHOR: '[itemprop="author"]',
    AUTHOR_NAME: 'meta[itemprop="name"]',
    AUTHOR_HANDLE: 'meta[itemprop="additionalName"]',
    IMAGES: '[data-testid="tweetPhoto"] img',
    DRAFT_PARAGRAPHS: '.longform-unstyled, .public-DraftStyleDefault-block',
    BOLD_SPANS: 'span[style*="font-weight: bold"]',
    DRAFT_ATTRIBUTES: '[data-offset-key]',
    EMBEDDED_TWEET: '[data-testid="simpleTweet"]',
    TWEET_TEXT: '[data-testid="tweetText"]',
    USER_NAME: '[data-testid="User-Name"]',
    CODE_BLOCK: '[data-testid="markdown-code-block"]',
    HEADER_BLOCK: '[data-testid="longform-header"]',
};
class XArticleExtractor extends _base_1.BaseExtractor {
    constructor(document, url, schemaOrgData) {
        super(document, url, schemaOrgData);
        this.articleContainer = document.querySelector(SELECTORS.ARTICLE_CONTAINER);
    }
    canExtract() {
        return !!this.articleContainer;
    }
    extract() {
        const title = this.extractTitle();
        const author = this.extractAuthor();
        const contentHtml = this.extractContent();
        const description = this.createDescription();
        return {
            content: contentHtml,
            contentHtml,
            extractedContent: {
                articleId: this.getArticleId(),
            },
            variables: {
                title,
                author,
                site: 'X (Twitter)',
                description,
            }
        };
    }
    extractTitle() {
        var _a;
        const titleEl = this.document.querySelector(SELECTORS.TITLE);
        return ((_a = titleEl === null || titleEl === void 0 ? void 0 : titleEl.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || 'Untitled X Article';
    }
    extractAuthor() {
        var _a, _b;
        const authorContainer = this.document.querySelector(SELECTORS.AUTHOR);
        if (!authorContainer)
            return this.getAuthorFromUrl();
        const name = (_a = authorContainer.querySelector(SELECTORS.AUTHOR_NAME)) === null || _a === void 0 ? void 0 : _a.getAttribute('content');
        const handle = (_b = authorContainer.querySelector(SELECTORS.AUTHOR_HANDLE)) === null || _b === void 0 ? void 0 : _b.getAttribute('content');
        if (name && handle)
            return `${name} (@${handle})`;
        return name || handle || this.getAuthorFromUrl();
    }
    getAuthorFromUrl() {
        // match username before /article/, excluding system paths like /i/
        const match = this.url.match(/\/([a-zA-Z][a-zA-Z0-9_]{0,14})\/article\/\d+/);
        return match ? `@${match[1]}` : this.getAuthorFromOgTitle();
    }
    getAuthorFromOgTitle() {
        var _a;
        const ogTitle = ((_a = this.document.querySelector('meta[property="og:title"]')) === null || _a === void 0 ? void 0 : _a.getAttribute('content')) || '';
        // Match patterns like "(4) Heinrich on X: ..." or "Heinrich on X: ..."
        const match = ogTitle.match(/^(?:\(\d+\)\s+)?(.+?)\s+on\s+X\s*:/);
        return match ? match[1].trim() : 'Unknown';
    }
    getArticleId() {
        const match = this.url.match(/article\/(\d+)/);
        return match ? match[1] : '';
    }
    extractContent() {
        if (!this.articleContainer)
            return '';
        const clone = this.articleContainer.cloneNode(true);
        this.cleanContent(clone);
        return `<article class="x-article">${(0, dom_1.serializeHTML)(clone)}</article>`;
    }
    cleanContent(container) {
        const ownerDoc = container.ownerDocument || this.document;
        // convert complex elements first (before other transformations)
        this.convertEmbeddedTweets(container, ownerDoc);
        this.convertCodeBlocks(container, ownerDoc);
        this.convertHeaders(container, ownerDoc);
        this.unwrapLinkedImages(container, ownerDoc);
        this.upgradeImageQuality(container);
        // convert bold spans BEFORE paragraphs so formatting is preserved
        this.convertBoldSpans(container, ownerDoc);
        this.convertDraftParagraphs(container, ownerDoc);
        this.removeDraftAttributes(container);
    }
    convertEmbeddedTweets(container, ownerDoc) {
        container.querySelectorAll(SELECTORS.EMBEDDED_TWEET).forEach(tweet => {
            var _a, _b, _c, _d, _e;
            const blockquote = ownerDoc.createElement('blockquote');
            blockquote.className = 'embedded-tweet';
            // extract author info
            const userNameEl = tweet.querySelector(SELECTORS.USER_NAME);
            const authorLinks = userNameEl === null || userNameEl === void 0 ? void 0 : userNameEl.querySelectorAll('a');
            const fullName = ((_b = (_a = authorLinks === null || authorLinks === void 0 ? void 0 : authorLinks[0]) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
            const handle = ((_d = (_c = authorLinks === null || authorLinks === void 0 ? void 0 : authorLinks[1]) === null || _c === void 0 ? void 0 : _c.textContent) === null || _d === void 0 ? void 0 : _d.trim()) || '';
            // extract tweet text
            const tweetTextEl = tweet.querySelector(SELECTORS.TWEET_TEXT);
            const tweetText = ((_e = tweetTextEl === null || tweetTextEl === void 0 ? void 0 : tweetTextEl.textContent) === null || _e === void 0 ? void 0 : _e.trim()) || '';
            // build clean blockquote content
            if (fullName || handle) {
                const cite = ownerDoc.createElement('cite');
                cite.textContent = handle ? `${fullName} ${handle}` : fullName;
                blockquote.appendChild(cite);
            }
            if (tweetText) {
                const p = ownerDoc.createElement('p');
                p.textContent = tweetText;
                blockquote.appendChild(p);
            }
            tweet.replaceWith(blockquote);
        });
    }
    convertCodeBlocks(container, ownerDoc) {
        container.querySelectorAll(SELECTORS.CODE_BLOCK).forEach(block => {
            var _a;
            const pre = block.querySelector('pre');
            const code = block.querySelector('code');
            if (!pre || !code)
                return;
            // extract language from class (e.g., "language-bash") or from span
            let language = '';
            const langClass = code.className.match(/language-(\w+)/);
            if (langClass) {
                language = langClass[1];
            }
            else {
                // fallback: look for language label in the block header
                const langSpan = block.querySelector('span');
                language = ((_a = langSpan === null || langSpan === void 0 ? void 0 : langSpan.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '';
            }
            // create clean pre/code structure
            const newPre = ownerDoc.createElement('pre');
            const newCode = ownerDoc.createElement('code');
            if (language) {
                newCode.setAttribute('data-lang', language);
                newCode.className = `language-${language}`;
            }
            newCode.textContent = code.textContent || '';
            newPre.appendChild(newCode);
            // replace the entire block container
            block.replaceWith(newPre);
        });
    }
    convertHeaders(container, ownerDoc) {
        // X articles use h2/h3 elements but content may be nested in spans/divs
        container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(header => {
            var _a;
            const level = header.tagName.toLowerCase();
            const text = ((_a = header.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '';
            if (!text)
                return;
            const newHeader = ownerDoc.createElement(level);
            newHeader.textContent = text;
            header.replaceWith(newHeader);
        });
    }
    unwrapLinkedImages(container, ownerDoc) {
        // find all tweetPhoto images and extract them from any ancestor anchors
        container.querySelectorAll(SELECTORS.IMAGES).forEach(img => {
            var _a;
            // find closest anchor ancestor
            const anchor = img.closest('a');
            if (!anchor || !container.contains(anchor))
                return;
            // create clean img tag with upgraded quality (like TwitterExtractor does)
            let src = img.getAttribute('src') || '';
            const alt = ((_a = img.getAttribute('alt')) === null || _a === void 0 ? void 0 : _a.replace(/\s+/g, ' ').trim()) || 'Image';
            // upgrade image quality
            if (src.includes('&name=')) {
                src = src.replace(/&name=\w+/, '&name=large');
            }
            else if (src.includes('?')) {
                src = `${src}&name=large`;
            }
            else {
                src = `${src}?name=large`;
            }
            const cleanImg = ownerDoc.createElement('img');
            cleanImg.setAttribute('src', src);
            cleanImg.setAttribute('alt', alt);
            // replace anchor with clean image
            anchor.replaceWith(cleanImg);
        });
    }
    upgradeImageQuality(container) {
        container.querySelectorAll(SELECTORS.IMAGES).forEach(img => {
            const src = img.getAttribute('src');
            if (!src)
                return;
            if (src.includes('&name=')) {
                img.setAttribute('src', src.replace(/&name=\w+/, '&name=large'));
            }
            else if (src.includes('?')) {
                img.setAttribute('src', `${src}&name=large`);
            }
            else {
                img.setAttribute('src', `${src}?name=large`);
            }
        });
    }
    convertDraftParagraphs(container, ownerDoc) {
        // node type constants (avoid using Node global which isn't available in all environments)
        const TEXT_NODE = 3;
        const ELEMENT_NODE = 1;
        container.querySelectorAll(SELECTORS.DRAFT_PARAGRAPHS).forEach(div => {
            const p = ownerDoc.createElement('p');
            // preserve formatting (strong, links, code) by processing children
            const processNode = (node) => {
                if (node.nodeType === TEXT_NODE) {
                    p.appendChild(ownerDoc.createTextNode(node.textContent || ''));
                }
                else if (node.nodeType === ELEMENT_NODE) {
                    const el = node;
                    const tag = el.tagName.toLowerCase();
                    if (tag === 'strong') {
                        const strong = ownerDoc.createElement('strong');
                        strong.textContent = el.textContent || '';
                        p.appendChild(strong);
                    }
                    else if (tag === 'a') {
                        const link = ownerDoc.createElement('a');
                        link.setAttribute('href', el.getAttribute('href') || '');
                        link.textContent = el.textContent || '';
                        p.appendChild(link);
                    }
                    else if (tag === 'code') {
                        const code = ownerDoc.createElement('code');
                        code.textContent = el.textContent || '';
                        p.appendChild(code);
                    }
                    else {
                        // recurse into other elements (spans, divs, etc.)
                        el.childNodes.forEach(child => processNode(child));
                    }
                }
            };
            div.childNodes.forEach(child => processNode(child));
            div.replaceWith(p);
        });
    }
    convertBoldSpans(container, ownerDoc) {
        container.querySelectorAll(SELECTORS.BOLD_SPANS).forEach(span => {
            const strong = ownerDoc.createElement('strong');
            strong.textContent = span.textContent || '';
            span.replaceWith(strong);
        });
    }
    removeDraftAttributes(container) {
        container.querySelectorAll(SELECTORS.DRAFT_ATTRIBUTES).forEach(el => {
            el.removeAttribute('data-offset-key');
        });
    }
    createDescription() {
        var _a, _b;
        const text = ((_b = (_a = this.articleContainer) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
        return text.slice(0, 140) + (text.length > 140 ? '...' : '');
    }
}
exports.XArticleExtractor = XArticleExtractor;
//# sourceMappingURL=x-article.js.map
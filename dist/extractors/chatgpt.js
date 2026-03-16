"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatGPTExtractor = void 0;
const _conversation_1 = require("./_conversation");
const dom_1 = require("../utils/dom");
class ChatGPTExtractor extends _conversation_1.ConversationExtractor {
    constructor(document, url) {
        super(document, url);
        this.cachedMessages = null;
        this.articles = document.querySelectorAll('article[data-testid^="conversation-turn-"]');
        this.footnotes = [];
        this.footnoteCounter = 0;
    }
    canExtract() {
        return !!this.articles && this.articles.length > 0;
    }
    extractMessages() {
        if (this.cachedMessages)
            return this.cachedMessages;
        const messages = [];
        this.footnotes = [];
        this.footnoteCounter = 0;
        if (!this.articles)
            return messages;
        this.articles.forEach((article) => {
            var _a, _b;
            // Get the localized author text from the sr-only heading and clean it
            const authorElement = article.querySelector('h5.sr-only, h6.sr-only');
            const authorText = ((_b = (_a = authorElement === null || authorElement === void 0 ? void 0 : authorElement.textContent) === null || _a === void 0 ? void 0 : _a.trim()) === null || _b === void 0 ? void 0 : _b.replace(/:\s*$/, '') // Remove colon and any trailing whitespace
            )
                || '';
            let currentAuthorRole = '';
            const authorRole = article.getAttribute('data-message-author-role');
            if (authorRole) {
                currentAuthorRole = authorRole;
            }
            let messageContent = (0, dom_1.serializeHTML)(article);
            messageContent = messageContent.replace(/\u200B/g, '');
            // Remove specific elements from the message content
            const tempDiv = this.document.createElement('div');
            tempDiv.appendChild((0, dom_1.parseHTML)(this.document, messageContent));
            tempDiv.querySelectorAll('h5.sr-only, h6.sr-only, span[data-state="closed"]').forEach(el => el.remove());
            messageContent = (0, dom_1.serializeHTML)(tempDiv);
            // Process inline references using regex to find the containers
            // Look for spans containing citation links (a[target=_blank][rel=noopener]), replacing entire structure
            // Also capture optional preceding ZeroWidthSpace
            const citationPattern = /(&ZeroWidthSpace;)?(<span[^>]*?>\s*<a(?=[^>]*?href="([^"]+)")(?=[^>]*?target="_blank")(?=[^>]*?rel="noopener")[^>]*?>[\s\S]*?<\/a>\s*<\/span>)/gi;
            messageContent = messageContent.replace(citationPattern, (match, zws, spanStructure, url) => {
                // url is captured group 3
                let domain = '';
                let fragmentText = '';
                try {
                    // Extract domain without www.
                    domain = new URL(url).hostname.replace(/^www\./, '');
                    // Extract and decode the fragment text if it exists
                    const hashParts = url.split('#:~:text=');
                    if (hashParts.length > 1) {
                        fragmentText = decodeURIComponent(hashParts[1]);
                        fragmentText = fragmentText.replace(/%2C/g, ',');
                        const parts = fragmentText.split(',');
                        if (parts.length > 1 && parts[0].trim()) {
                            fragmentText = ` — ${parts[0].trim()}...`;
                        }
                        else if (parts[0].trim()) {
                            fragmentText = ` — ${fragmentText.trim()}`;
                        }
                        else {
                            fragmentText = '';
                        }
                    }
                }
                catch (e) {
                    console.error(`Failed to parse URL: ${url}`, e);
                    domain = url;
                }
                // Check if this URL already exists in our footnotes
                let footnoteIndex = this.footnotes.findIndex(fn => fn.url === url);
                let footnoteNumber;
                if (footnoteIndex === -1) {
                    this.footnoteCounter++;
                    footnoteNumber = this.footnoteCounter;
                    this.footnotes.push({
                        url,
                        text: `<a href="${url}">${domain}</a>${fragmentText}`
                    });
                }
                else {
                    footnoteNumber = footnoteIndex + 1;
                }
                // Return just the footnote reference, replacing the ZWS (if captured) and the entire span structure
                return `<sup id="fnref:${footnoteNumber}"><a href="#fn:${footnoteNumber}">${footnoteNumber}</a></sup>`;
            });
            // Clean up any stray empty paragraph tags
            messageContent = messageContent
                .replace(/<p[^>]*>\s*<\/p>/g, '');
            messages.push({
                author: authorText,
                content: messageContent.trim(),
                metadata: {
                    role: currentAuthorRole || 'unknown'
                }
            });
        });
        this.cachedMessages = messages;
        return messages;
    }
    getFootnotes() {
        return this.footnotes;
    }
    getMetadata() {
        const title = this.getTitle();
        const messages = this.extractMessages();
        return {
            title,
            site: 'ChatGPT',
            url: this.url,
            messageCount: messages.length,
            description: `ChatGPT conversation with ${messages.length} messages`
        };
    }
    getTitle() {
        var _a, _b, _c;
        // Try to get the page title first
        const pageTitle = (_a = this.document.title) === null || _a === void 0 ? void 0 : _a.trim();
        if (pageTitle && pageTitle !== 'ChatGPT') {
            return pageTitle;
        }
        // Fall back to first user message
        const firstUserTurn = (_c = (_b = this.articles) === null || _b === void 0 ? void 0 : _b.item(0)) === null || _c === void 0 ? void 0 : _c.querySelector('.text-message');
        if (firstUserTurn) {
            const text = firstUserTurn.textContent || '';
            // Truncate to first 50 characters if longer
            return text.length > 50 ? text.slice(0, 50) + '...' : text;
        }
        return 'ChatGPT Conversation';
    }
}
exports.ChatGPTExtractor = ChatGPTExtractor;
//# sourceMappingURL=chatgpt.js.map
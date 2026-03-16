"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeExtractor = void 0;
const _conversation_1 = require("./_conversation");
const dom_1 = require("../utils/dom");
class ClaudeExtractor extends _conversation_1.ConversationExtractor {
    constructor(document, url) {
        super(document, url);
        // Find all message blocks - both user and assistant messages
        this.articles = document.querySelectorAll('div[data-testid="user-message"], div[data-testid="assistant-message"], div.font-claude-response');
    }
    canExtract() {
        return !!this.articles && this.articles.length > 0;
    }
    extractMessages() {
        const messages = [];
        if (!this.articles)
            return messages;
        this.articles.forEach((article) => {
            let role;
            let content;
            if (article.hasAttribute('data-testid')) {
                // Handle user messages
                if (article.getAttribute('data-testid') === 'user-message') {
                    role = 'you';
                    content = (0, dom_1.serializeHTML)(article);
                }
                // Skip non-message elements
                else {
                    return;
                }
            }
            else if (article.classList.contains('font-claude-response')) {
                // Handle Claude messages
                role = 'assistant';
                const assistantBody = article.querySelector('.standard-markdown') || article;
                content = (0, dom_1.serializeHTML)(assistantBody);
            }
            else {
                // Skip unknown elements
                return;
            }
            if (content) {
                // Normalize content similar to ChatGPT extractor
                content = content.replace(/\u200B/g, '').replace(/<p[^>]*>\s*<\/p>/g, '');
                messages.push({
                    author: role === 'you' ? 'You' : 'Claude',
                    content: content.trim(),
                    metadata: {
                        role: role
                    }
                });
            }
        });
        return messages;
    }
    getMetadata() {
        const title = this.getTitle();
        const messages = this.extractMessages();
        return {
            title,
            site: 'Claude',
            url: this.url,
            messageCount: messages.length,
            description: `Claude conversation with ${messages.length} messages`
        };
    }
    getTitle() {
        var _a, _b, _c, _d, _e;
        // Try to get the page title first
        const pageTitle = (_a = this.document.title) === null || _a === void 0 ? void 0 : _a.trim();
        if (pageTitle && pageTitle !== 'Claude') {
            // Remove ' - Claude' suffix if present
            return pageTitle.replace(/ - Claude$/, '');
        }
        // Try to get title from header
        const headerTitle = (_c = (_b = this.document.querySelector('header .font-tiempos')) === null || _b === void 0 ? void 0 : _b.textContent) === null || _c === void 0 ? void 0 : _c.trim();
        if (headerTitle) {
            return headerTitle;
        }
        // Fall back to first user message
        const firstUserMessage = (_e = (_d = this.articles) === null || _d === void 0 ? void 0 : _d.item(0)) === null || _e === void 0 ? void 0 : _e.querySelector('[data-testid="user-message"]');
        if (firstUserMessage) {
            const text = firstUserMessage.textContent || '';
            // Truncate to first 50 characters if longer
            return text.length > 50 ? text.slice(0, 50) + '...' : text;
        }
        return 'Claude Conversation';
    }
}
exports.ClaudeExtractor = ClaudeExtractor;
//# sourceMappingURL=claude.js.map
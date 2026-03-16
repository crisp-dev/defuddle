"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedditExtractor = void 0;
const _base_1 = require("./_base");
const dom_1 = require("../utils/dom");
const comments_1 = require("../utils/comments");
class RedditExtractor extends _base_1.BaseExtractor {
    constructor(document, url) {
        super(document, url);
        this.shredditPost = document.querySelector('shreddit-post');
        this.isOldReddit = !!document.querySelector('.thing.link');
    }
    canExtract() {
        return !!this.shredditPost || this.isOldReddit;
    }
    canExtractAsync() {
        // For new reddit comment pages, extract() returns empty content
        // when shreddit-comment elements are missing (server-side fetch),
        // causing parseAsync() to fall through to this async path.
        return this.isCommentsPage() && !this.isOldReddit;
    }
    isCommentsPage() {
        return /\/r\/.+\/comments\//.test(this.url);
    }
    extractAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // Convert URL to old.reddit.com
            const oldUrl = new URL(this.url);
            oldUrl.hostname = 'old.reddit.com';
            const response = yield fetch(oldUrl.toString(), {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Defuddle/1.0)',
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch old.reddit.com: ${response.status}`);
            }
            const html = yield response.text();
            const Parser = (_b = (_a = this.document.defaultView) === null || _a === void 0 ? void 0 : _a.DOMParser) !== null && _b !== void 0 ? _b : (typeof DOMParser !== 'undefined' ? DOMParser : null);
            if (!Parser) {
                throw new Error('DOMParser is not available in this environment');
            }
            const doc = new Parser().parseFromString(html, 'text/html');
            return this.extractOldReddit(doc);
        });
    }
    extract() {
        var _a, _b;
        if (this.isOldReddit) {
            return this.extractOldReddit(this.document);
        }
        // New reddit server-side HTML includes shreddit-post but not
        // shreddit-comment elements (those require JS). Return empty
        // so parseAsync() falls through to extractAsync() which fetches
        // old.reddit.com with full content.
        const hasComments = this.document.querySelectorAll('shreddit-comment').length > 0;
        if (this.isCommentsPage() && !hasComments) {
            return { content: '', contentHtml: '' };
        }
        const postContent = this.getPostContent();
        const comments = this.extractComments();
        const contentHtml = this.createContentHtml(postContent, comments);
        const postTitle = ((_b = (_a = this.document.querySelector('h1')) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
        const subreddit = this.getSubreddit();
        const postAuthor = this.getPostAuthor();
        const description = this.createDescription(postContent);
        return {
            content: contentHtml,
            contentHtml: contentHtml,
            extractedContent: {
                postId: this.getPostId(),
                subreddit,
                postAuthor,
            },
            variables: {
                title: postTitle,
                author: postAuthor,
                site: `r/${subreddit}`,
                description,
            }
        };
    }
    extractOldReddit(root) {
        var _a, _b;
        const thingLink = root.querySelector('.thing.link');
        const postTitle = ((_b = (_a = thingLink === null || thingLink === void 0 ? void 0 : thingLink.querySelector('a.title')) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
        const postAuthor = (thingLink === null || thingLink === void 0 ? void 0 : thingLink.getAttribute('data-author')) || '';
        const subreddit = (thingLink === null || thingLink === void 0 ? void 0 : thingLink.getAttribute('data-subreddit')) || '';
        const postBodyEl = thingLink === null || thingLink === void 0 ? void 0 : thingLink.querySelector('.usertext-body .md');
        const postBody = postBodyEl ? (0, dom_1.serializeHTML)(postBodyEl) : '';
        const commentArea = root.querySelector('.commentarea .sitetable');
        const commentData = commentArea ? this.collectOldRedditComments(commentArea) : [];
        const comments = commentData.length > 0 ? (0, comments_1.buildCommentTree)(commentData) : '';
        const contentHtml = this.createContentHtml(postBody, comments);
        const description = this.createDescription(postBody);
        return {
            content: contentHtml,
            contentHtml: contentHtml,
            extractedContent: {
                postId: this.getPostId(),
                subreddit,
                postAuthor,
            },
            variables: {
                title: postTitle,
                author: postAuthor,
                site: `r/${subreddit}`,
                description,
            }
        };
    }
    getPostContent() {
        var _a, _b, _c;
        const textBodyEl = (_a = this.shredditPost) === null || _a === void 0 ? void 0 : _a.querySelector('[slot="text-body"]');
        const textBody = textBodyEl ? (0, dom_1.serializeHTML)(textBodyEl) : '';
        const mediaBody = ((_c = (_b = this.shredditPost) === null || _b === void 0 ? void 0 : _b.querySelector('#post-image')) === null || _c === void 0 ? void 0 : _c.outerHTML) || '';
        return textBody + mediaBody;
    }
    createContentHtml(postContent, comments) {
        return (0, comments_1.buildContentHtml)('reddit', postContent, comments);
    }
    extractComments() {
        const comments = Array.from(this.document.querySelectorAll('shreddit-comment'));
        return this.processComments(comments);
    }
    getPostId() {
        const match = this.url.match(/comments\/([a-zA-Z0-9]+)/);
        return (match === null || match === void 0 ? void 0 : match[1]) || '';
    }
    getSubreddit() {
        const match = this.url.match(/\/r\/([^/]+)/);
        return (match === null || match === void 0 ? void 0 : match[1]) || '';
    }
    getPostAuthor() {
        var _a;
        return ((_a = this.shredditPost) === null || _a === void 0 ? void 0 : _a.getAttribute('author')) || '';
    }
    createDescription(postContent) {
        var _a;
        if (!postContent)
            return '';
        const tempDiv = this.document.createElement('div');
        tempDiv.appendChild((0, dom_1.parseHTML)(this.document, postContent));
        return ((_a = tempDiv.textContent) === null || _a === void 0 ? void 0 : _a.trim().slice(0, 140).replace(/\s+/g, ' ')) || '';
    }
    collectOldRedditComments(container, depth = 0) {
        var _a, _b;
        const result = [];
        const comments = Array.from(container.querySelectorAll(':scope > .thing.comment'));
        for (const comment of comments) {
            const author = comment.getAttribute('data-author') || '';
            const permalink = comment.getAttribute('data-permalink') || '';
            const score = ((_b = (_a = comment.querySelector('.entry .tagline .score.unvoted')) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
            const timeEl = comment.querySelector('.entry .tagline time[datetime]');
            const datetime = (timeEl === null || timeEl === void 0 ? void 0 : timeEl.getAttribute('datetime')) || '';
            const date = datetime ? new Date(datetime).toISOString().split('T')[0] : '';
            const bodyEl = comment.querySelector('.entry .usertext-body .md');
            const body = bodyEl ? (0, dom_1.serializeHTML)(bodyEl) : '';
            result.push({
                author,
                date,
                content: body,
                depth,
                score: score || undefined,
                url: permalink ? `https://reddit.com${permalink}` : undefined,
            });
            const childContainer = comment.querySelector('.child > .sitetable');
            if (childContainer) {
                result.push(...this.collectOldRedditComments(childContainer, depth + 1));
            }
        }
        return result;
    }
    processComments(comments) {
        var _a;
        const commentData = [];
        for (const comment of comments) {
            const depth = parseInt(comment.getAttribute('depth') || '0');
            const author = comment.getAttribute('author') || '';
            const score = comment.getAttribute('score') || '0';
            const permalink = comment.getAttribute('permalink') || '';
            const commentEl = comment.querySelector('[slot="comment"]');
            const content = commentEl ? (0, dom_1.serializeHTML)(commentEl) : '';
            const timestamp = comment.getAttribute('created')
                || ((_a = comment.querySelector('time')) === null || _a === void 0 ? void 0 : _a.getAttribute('datetime'))
                || '';
            const date = timestamp ? new Date(timestamp).toISOString().split('T')[0] : '';
            commentData.push({
                author,
                date,
                content,
                depth,
                score: `${score} points`,
                url: permalink ? `https://reddit.com${permalink}` : undefined,
            });
        }
        return (0, comments_1.buildCommentTree)(commentData);
    }
}
exports.RedditExtractor = RedditExtractor;
//# sourceMappingURL=reddit.js.map
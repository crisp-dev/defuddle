"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HackerNewsExtractor = void 0;
const _base_1 = require("./_base");
const dom_1 = require("../utils/dom");
const comments_1 = require("../utils/comments");
class HackerNewsExtractor extends _base_1.BaseExtractor {
    constructor(document, url) {
        super(document, url);
        this.mainPost = document.querySelector('.fatitem');
        this.isCommentPage = this.detectCommentPage();
        this.mainComment = this.isCommentPage ? this.findMainComment() : null;
    }
    detectCommentPage() {
        var _a, _b;
        // Comment pages have an "on: <story title>" link but no story title row
        return !!((_a = this.mainPost) === null || _a === void 0 ? void 0 : _a.querySelector('.onstory')) && !((_b = this.mainPost) === null || _b === void 0 ? void 0 : _b.querySelector('.titleline'));
    }
    findMainComment() {
        var _a;
        // Use the tr.athing row which contains both the comment metadata (.comhead)
        // and the comment text (.commtext). The .comment div alone doesn't include
        // the author (.hnuser) or timestamp (.age) which are in the sibling .comhead.
        return ((_a = this.mainPost) === null || _a === void 0 ? void 0 : _a.querySelector('tr.athing')) || null;
    }
    canExtract() {
        return !!this.mainPost;
    }
    extract() {
        const postContent = this.getPostContent();
        const comments = this.extractComments();
        const contentHtml = this.createContentHtml(postContent, comments);
        const postTitle = this.getPostTitle();
        const postAuthor = this.getPostAuthor();
        const description = this.createDescription();
        const published = this.getPostDate();
        return {
            content: contentHtml,
            contentHtml: contentHtml,
            extractedContent: {
                postId: this.getPostId(),
                postAuthor,
            },
            variables: {
                title: postTitle,
                author: postAuthor,
                site: 'Hacker News',
                description,
                published,
            }
        };
    }
    createContentHtml(postContent, comments) {
        return (0, comments_1.buildContentHtml)('hackernews', postContent, comments);
    }
    getPostContent() {
        var _a, _b, _c, _d;
        if (!this.mainPost)
            return '';
        // If this is a comment page, use the comment as the main content
        if (this.isCommentPage && this.mainComment) {
            const author = ((_a = this.mainComment.querySelector('.hnuser')) === null || _a === void 0 ? void 0 : _a.textContent) || '[deleted]';
            const commtext = this.mainComment.querySelector('.commtext');
            const commentText = commtext ? (0, dom_1.serializeHTML)(commtext) : '';
            const timeElement = this.mainComment.querySelector('.age');
            const timestamp = (timeElement === null || timeElement === void 0 ? void 0 : timeElement.getAttribute('title')) || '';
            const date = timestamp.split('T')[0] || '';
            const points = ((_c = (_b = this.mainComment.querySelector('.score')) === null || _b === void 0 ? void 0 : _b.textContent) === null || _c === void 0 ? void 0 : _c.trim()) || '';
            return (0, comments_1.buildComment)({
                author,
                date,
                content: commentText,
                score: points || undefined,
            });
        }
        // Otherwise handle regular post content
        const titleRow = this.mainPost.querySelector('tr.athing');
        const subRow = titleRow === null || titleRow === void 0 ? void 0 : titleRow.nextElementSibling;
        const url = ((_d = titleRow === null || titleRow === void 0 ? void 0 : titleRow.querySelector('.titleline a')) === null || _d === void 0 ? void 0 : _d.getAttribute('href')) || '';
        let content = '';
        if (url) {
            content += `<p><a href="${url}" target="_blank">${url}</a></p>`;
        }
        const text = this.mainPost.querySelector('.toptext');
        if (text) {
            content += `<div class="post-text">${(0, dom_1.serializeHTML)(text)}</div>`;
        }
        return content;
    }
    extractComments() {
        const comments = Array.from(this.document.querySelectorAll('tr.comtr'));
        return this.processComments(comments);
    }
    processComments(comments) {
        var _a, _b, _c, _d;
        const commentData = [];
        const processedIds = new Set();
        for (const comment of comments) {
            const id = comment.getAttribute('id');
            if (!id || processedIds.has(id))
                continue;
            processedIds.add(id);
            const indent = ((_a = comment.querySelector('.ind img')) === null || _a === void 0 ? void 0 : _a.getAttribute('width')) || '0';
            const depth = parseInt(indent) / 40;
            const commentText = comment.querySelector('.commtext');
            const author = ((_b = comment.querySelector('.hnuser')) === null || _b === void 0 ? void 0 : _b.textContent) || '[deleted]';
            const timeElement = comment.querySelector('.age');
            const points = ((_d = (_c = comment.querySelector('.score')) === null || _c === void 0 ? void 0 : _c.textContent) === null || _d === void 0 ? void 0 : _d.trim()) || '';
            if (!commentText)
                continue;
            const commentUrl = `https://news.ycombinator.com/item?id=${id}`;
            const timestamp = (timeElement === null || timeElement === void 0 ? void 0 : timeElement.getAttribute('title')) || '';
            const date = timestamp.split('T')[0] || '';
            commentData.push({
                author,
                date,
                content: (0, dom_1.serializeHTML)(commentText),
                depth,
                score: points || undefined,
                url: commentUrl,
            });
        }
        return (0, comments_1.buildCommentTree)(commentData);
    }
    getPostId() {
        const match = this.url.match(/id=(\d+)/);
        return (match === null || match === void 0 ? void 0 : match[1]) || '';
    }
    getPostTitle() {
        var _a, _b, _c, _d, _e;
        if (this.isCommentPage && this.mainComment) {
            const author = ((_a = this.mainComment.querySelector('.hnuser')) === null || _a === void 0 ? void 0 : _a.textContent) || '[deleted]';
            const commentText = ((_b = this.mainComment.querySelector('.commtext')) === null || _b === void 0 ? void 0 : _b.textContent) || '';
            // Use first 50 characters of comment as title
            const preview = commentText.trim().slice(0, 50) + (commentText.length > 50 ? '...' : '');
            return `Comment by ${author}: ${preview}`;
        }
        return ((_e = (_d = (_c = this.mainPost) === null || _c === void 0 ? void 0 : _c.querySelector('.titleline')) === null || _d === void 0 ? void 0 : _d.textContent) === null || _e === void 0 ? void 0 : _e.trim()) || '';
    }
    getPostAuthor() {
        var _a, _b, _c;
        return ((_c = (_b = (_a = this.mainPost) === null || _a === void 0 ? void 0 : _a.querySelector('.hnuser')) === null || _b === void 0 ? void 0 : _b.textContent) === null || _c === void 0 ? void 0 : _c.trim()) || '';
    }
    createDescription() {
        const title = this.getPostTitle();
        const author = this.getPostAuthor();
        if (this.isCommentPage) {
            return `Comment by ${author} on Hacker News`;
        }
        return `${title} - by ${author} on Hacker News`;
    }
    getPostDate() {
        if (!this.mainPost)
            return '';
        const timeElement = this.mainPost.querySelector('.age');
        const timestamp = (timeElement === null || timeElement === void 0 ? void 0 : timeElement.getAttribute('title')) || '';
        return timestamp.split('T')[0] || '';
    }
}
exports.HackerNewsExtractor = HackerNewsExtractor;
//# sourceMappingURL=hackernews.js.map
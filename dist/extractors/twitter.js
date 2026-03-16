"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterExtractor = void 0;
const _base_1 = require("./_base");
const dom_1 = require("../utils/dom");
class TwitterExtractor extends _base_1.BaseExtractor {
    constructor(document, url) {
        var _a;
        super(document, url);
        this.mainTweet = null;
        this.threadTweets = [];
        // Get all tweets from the timeline
        const timeline = document.querySelector('[aria-label="Timeline: Conversation"]');
        if (!timeline) {
            // Try to find a single tweet if not in timeline view
            const singleTweet = document.querySelector('article[data-testid="tweet"]');
            if (singleTweet) {
                this.mainTweet = singleTweet;
            }
            return;
        }
        // Get all tweets before any section with "Discover more" or similar headings
        let allTweets = Array.from(timeline.querySelectorAll('article[data-testid="tweet"]'));
        const firstSection = (_a = timeline.querySelector('section, h2')) === null || _a === void 0 ? void 0 : _a.parentElement;
        if (firstSection) {
            // Filter out tweets that appear after the first section
            const cutoffIndex = allTweets.findIndex(tweet => firstSection.compareDocumentPosition(tweet) & Node.DOCUMENT_POSITION_FOLLOWING);
            if (cutoffIndex !== -1) {
                allTweets = allTweets.slice(0, cutoffIndex);
            }
        }
        // Set main tweet and thread tweets
        this.mainTweet = allTweets[0] || null;
        this.threadTweets = allTweets.slice(1);
    }
    canExtract() {
        return !!this.mainTweet;
    }
    extract() {
        const mainContent = this.extractTweet(this.mainTweet);
        const threadContent = this.threadTweets.map(tweet => this.extractTweet(tweet)).join('\n<hr>\n');
        const contentHtml = `
			<div class="tweet-thread">
				<div class="main-tweet">
					${mainContent}
				</div>
				${threadContent ? `
					<hr>
					<div class="thread-tweets">
						${threadContent}
					</div>
				` : ''}
			</div>
		`.trim();
        const tweetId = this.getTweetId();
        const tweetAuthor = this.getTweetAuthor();
        const description = this.createDescription(this.mainTweet);
        return {
            content: contentHtml,
            contentHtml: contentHtml,
            extractedContent: {
                tweetId,
                tweetAuthor,
            },
            variables: {
                title: `Thread by ${tweetAuthor}`,
                author: tweetAuthor,
                site: 'X (Twitter)',
                description,
            }
        };
    }
    formatTweetText(text) {
        if (!text)
            return '';
        // Create a temporary div to parse and clean the HTML
        const tempDiv = this.document.createElement('div');
        tempDiv.appendChild((0, dom_1.parseHTML)(this.document, text));
        // Convert links to plain text with @ handles
        tempDiv.querySelectorAll('a').forEach(link => {
            var _a;
            const handle = ((_a = link.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '';
            link.replaceWith(handle);
        });
        // Remove unnecessary spans and divs but keep their content
        tempDiv.querySelectorAll('span, div').forEach(element => {
            element.replaceWith(...Array.from(element.childNodes));
        });
        // Get cleaned text and split into paragraphs
        const cleanText = (0, dom_1.serializeHTML)(tempDiv);
        const paragraphs = cleanText.split('\n')
            .map(line => line.trim())
            .filter(line => line);
        // Wrap each paragraph in <p> tags
        return paragraphs.map(p => `<p>${p}</p>`).join('\n');
    }
    extractTweet(tweet) {
        var _a, _b;
        if (!tweet)
            return '';
        // Clone the tweet element to modify it
        const tweetClone = tweet.cloneNode(true);
        // Convert emoji images to text
        tweetClone.querySelectorAll('img[src*="/emoji/"]').forEach(img => {
            if (img.tagName.toLowerCase() === 'img' && img.getAttribute('alt')) {
                const altText = img.getAttribute('alt');
                if (altText) {
                    img.replaceWith(altText);
                }
            }
        });
        const tweetTextEl = tweetClone.querySelector('[data-testid="tweetText"]');
        const tweetText = tweetTextEl ? (0, dom_1.serializeHTML)(tweetTextEl) : '';
        const formattedText = this.formatTweetText(tweetText);
        const images = this.extractImages(tweet);
        // Get author info and date
        const userInfo = this.extractUserInfo(tweet);
        // Extract quoted tweet if present
        const quotedTweet = (_b = (_a = tweet.querySelector('[aria-labelledby*="id__"]')) === null || _a === void 0 ? void 0 : _a.querySelector('[data-testid="User-Name"]')) === null || _b === void 0 ? void 0 : _b.closest('[aria-labelledby*="id__"]');
        const quotedContent = quotedTweet ? this.extractTweet(quotedTweet) : '';
        return `
			<div class="tweet">
				<div class="tweet-header">
					<span class="tweet-author"><strong>${userInfo.fullName}</strong> <span class="tweet-handle">${userInfo.handle}</span></span>
					${userInfo.date ? `<a href="${userInfo.permalink}" class="tweet-date">${userInfo.date}</a>` : ''}
				</div>
				${formattedText ? `<div class="tweet-text">${formattedText}</div>` : ''}
				${images.length ? `
					<div class="tweet-media">
						${images.join('\n')}
					</div>
				` : ''}
				${quotedContent ? `
					<blockquote class="quoted-tweet">
						${quotedContent}
					</blockquote>
				` : ''}
			</div>
		`.trim();
    }
    extractUserInfo(tweet) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const nameElement = tweet.querySelector('[data-testid="User-Name"]');
        if (!nameElement)
            return { fullName: '', handle: '', date: '', permalink: '' };
        // Try to get name and handle from links first (main tweet structure)
        const links = nameElement.querySelectorAll('a');
        let fullName = ((_b = (_a = links === null || links === void 0 ? void 0 : links[0]) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
        let handle = ((_d = (_c = links === null || links === void 0 ? void 0 : links[1]) === null || _c === void 0 ? void 0 : _c.textContent) === null || _d === void 0 ? void 0 : _d.trim()) || '';
        // If links don't have the info, try to get from spans (quoted tweet structure)
        if (!fullName || !handle) {
            fullName = ((_f = (_e = nameElement.querySelector('span[style*="color: rgb(15, 20, 25)"] span')) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.trim()) || '';
            handle = ((_h = (_g = nameElement.querySelector('span[style*="color: rgb(83, 100, 113)"]')) === null || _g === void 0 ? void 0 : _g.textContent) === null || _h === void 0 ? void 0 : _h.trim()) || '';
        }
        const timestamp = tweet.querySelector('time');
        const datetime = (timestamp === null || timestamp === void 0 ? void 0 : timestamp.getAttribute('datetime')) || '';
        const date = datetime ? new Date(datetime).toISOString().split('T')[0] : '';
        const permalink = ((_j = timestamp === null || timestamp === void 0 ? void 0 : timestamp.closest('a')) === null || _j === void 0 ? void 0 : _j.href) || '';
        return { fullName, handle, date, permalink };
    }
    extractImages(tweet) {
        var _a, _b;
        // Look for images in different containers
        const imageContainers = [
            '[data-testid="tweetPhoto"]',
            '[data-testid="tweet-image"]',
            'img[src*="media"]'
        ];
        const images = [];
        // Skip images that are inside quoted tweets
        const quotedTweet = (_b = (_a = tweet.querySelector('[aria-labelledby*="id__"]')) === null || _a === void 0 ? void 0 : _a.querySelector('[data-testid="User-Name"]')) === null || _b === void 0 ? void 0 : _b.closest('[aria-labelledby*="id__"]');
        for (const selector of imageContainers) {
            const elements = tweet.querySelectorAll(selector);
            elements.forEach(img => {
                var _a, _b;
                // Skip if the image is inside a quoted tweet
                if (quotedTweet === null || quotedTweet === void 0 ? void 0 : quotedTweet.contains(img)) {
                    return;
                }
                // Check if element is an image by checking tag name and required properties
                if (img.tagName.toLowerCase() === 'img' && img.getAttribute('alt')) {
                    const highQualitySrc = ((_a = img.getAttribute('src')) === null || _a === void 0 ? void 0 : _a.replace(/&name=\w+$/, '&name=large')) || '';
                    const cleanAlt = ((_b = img.getAttribute('alt')) === null || _b === void 0 ? void 0 : _b.replace(/\s+/g, ' ').trim()) || '';
                    images.push(`<img src="${highQualitySrc}" alt="${cleanAlt}" />`);
                }
            });
        }
        return images;
    }
    getTweetId() {
        const match = this.url.match(/status\/(\d+)/);
        return (match === null || match === void 0 ? void 0 : match[1]) || '';
    }
    getTweetAuthor() {
        var _a, _b, _c;
        const nameElement = (_a = this.mainTweet) === null || _a === void 0 ? void 0 : _a.querySelector('[data-testid="User-Name"]');
        const links = nameElement === null || nameElement === void 0 ? void 0 : nameElement.querySelectorAll('a');
        const handle = ((_c = (_b = links === null || links === void 0 ? void 0 : links[1]) === null || _b === void 0 ? void 0 : _b.textContent) === null || _c === void 0 ? void 0 : _c.trim()) || '';
        return handle.startsWith('@') ? handle : `@${handle}`;
    }
    createDescription(tweet) {
        var _a;
        if (!tweet)
            return '';
        const tweetText = ((_a = tweet.querySelector('[data-testid="tweetText"]')) === null || _a === void 0 ? void 0 : _a.textContent) || '';
        return tweetText.trim().slice(0, 140).replace(/\s+/g, ' ');
    }
}
exports.TwitterExtractor = TwitterExtractor;
//# sourceMappingURL=twitter.js.map
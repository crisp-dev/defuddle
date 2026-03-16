"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTextContent = createTextContent;
exports.toText = toText;
const html_to_text_1 = require("html-to-text");
// Default options for html-to-text conversion
const DEFAULT_TEXT_OPTIONS = {
    wordwrap: false,
    selectors: [
        { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'svg', format: 'skip' },
    ],
    preserveNewlines: false,
};
function createTextContent(content, url, options) {
    const textOptions = options || DEFAULT_TEXT_OPTIONS;
    try {
        const text = (0, html_to_text_1.convert)(content, textOptions);
        return text.trim();
    }
    catch (error) {
        console.error('Error converting HTML to text:', error);
        return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
}
function toText(result, options, url) {
    if (options.htmlToText) {
        const textOptions = typeof options.htmlToText === 'object'
            ? options.htmlToText
            : undefined;
        // If both htmlToText and markdown/separateMarkdown are set, 
        // put text in contentText field
        if (options.markdown || options.separateMarkdown) {
            result.contentText = createTextContent(result.content, url, textOptions);
        }
        else {
            // Otherwise replace content with text
            result.content = createTextContent(result.content, url, textOptions);
        }
    }
}
//# sourceMappingURL=text.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefuddleClass = void 0;
exports.Defuddle = Defuddle;
const linkedom_1 = require("linkedom");
const index_1 = __importDefault(require("./index"));
exports.DefuddleClass = index_1.default;
const markdown_1 = require("./markdown");
/**
 * Parse HTML content using linkedom
 * @param html HTML string to parse
 * @param url Optional URL of the page being parsed
 * @param options Optional parsing options
 * @returns Promise with parsed content and metadata
 */
async function Defuddle(html, url, options) {
    const { document } = (0, linkedom_1.parseHTML)(html);
    // linkedom doesn't implement styleSheets, getComputedStyle, or document.URL.
    // Stub them so defuddle's internals proceed without throwing.
    const doc = document;
    if (!doc.styleSheets)
        doc.styleSheets = [];
    if (doc.defaultView && !doc.defaultView.getComputedStyle) {
        doc.defaultView.getComputedStyle = () => ({ display: '' });
    }
    // Fall back to "about:blank" so new URL(document.URL) never throws inside
    // the extractor registry when no URL is provided by the caller.
    const pageUrl = url || 'about:blank';
    if (!doc.URL)
        doc.URL = pageUrl;
    const defuddle = new index_1.default(document, {
        ...options,
        url: pageUrl,
    });
    const result = await defuddle.parseAsync();
    (0, markdown_1.toMarkdown)(result, options ?? {}, pageUrl);
    return result;
}
//# sourceMappingURL=linkedom.js.map
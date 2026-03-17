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
exports.DefuddleClass = void 0;
exports.Defuddle = Defuddle;
const linkedom_1 = require("linkedom");
const defuddle_1 = require("./defuddle");
Object.defineProperty(exports, "DefuddleClass", { enumerable: true, get: function () { return defuddle_1.Defuddle; } });
const markdown_1 = require("./markdown");
const text_1 = require("./text");
/**
 * Parse HTML content using linkedom
 * @param htmlOrDom HTML string or linkedom document to parse
 * @param url Optional URL of the page being parsed
 * @param options Optional parsing options
 * @returns Promise with parsed content and metadata
 */
function Defuddle(htmlOrDom, url, options) {
    return __awaiter(this, void 0, void 0, function* () {
        let document;
        if (typeof htmlOrDom === 'string') {
            const parsed = (0, linkedom_1.parseHTML)(htmlOrDom);
            document = parsed.document;
        }
        else {
            document = htmlOrDom;
        }
        // linkedom doesn't implement styleSheets, getComputedStyle, or document.URL.
        // Stub them so defuddle's internals proceed without throwing.
        const doc = document;
        if (!doc.styleSheets)
            doc.styleSheets = [];
        if (doc.defaultView && !doc.defaultView.getComputedStyle) {
            doc.defaultView.getComputedStyle = () => ({ display: '' });
        }
        // Fall back to "about:blank" so new URL(document.URL) never throws.
        const pageUrl = url || 'about:blank';
        if (!doc.URL)
            doc.URL = pageUrl;
        const defuddle = new defuddle_1.Defuddle(document, Object.assign(Object.assign({}, options), { url: pageUrl }));
        const result = yield defuddle.parseAsync();
        (0, markdown_1.toMarkdown)(result, options !== null && options !== void 0 ? options : {}, pageUrl);
        (0, text_1.toText)(result, options !== null && options !== void 0 ? options : {}, pageUrl);
        return result;
    });
}
exports.default = Defuddle;
//# sourceMappingURL=index.js.map
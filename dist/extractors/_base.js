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
exports.BaseExtractor = void 0;
class BaseExtractor {
    constructor(document, url, schemaOrgData) {
        this.document = document;
        this.url = url;
        this.schemaOrgData = schemaOrgData;
    }
    canExtractAsync() {
        return false;
    }
    /**
     * When true, parseAsync() will prefer extractAsync() over extract(),
     * even if sync extraction produces content. Use this when the async
     * path provides strictly better results (e.g. YouTube transcripts).
     */
    prefersAsync() {
        return false;
    }
    extractAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.extract();
        });
    }
}
exports.BaseExtractor = BaseExtractor;
//# sourceMappingURL=_base.js.map
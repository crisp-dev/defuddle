import type { HtmlToTextOptions, DefuddleResponse, DefuddleOptions } from './types';
export declare function createTextContent(content: string, url: string, options?: HtmlToTextOptions): string;
export declare function toText(result: DefuddleResponse, options: DefuddleOptions, url: string): void;

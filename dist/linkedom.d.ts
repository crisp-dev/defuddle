import DefuddleClass from './index';
import type { DefuddleOptions, DefuddleResponse } from './types';
/**
 * Parse HTML content using linkedom
 * @param html HTML string to parse
 * @param url Optional URL of the page being parsed
 * @param options Optional parsing options
 * @returns Promise with parsed content and metadata
 */
export declare function Defuddle(html: string, url?: string, options?: DefuddleOptions): Promise<DefuddleResponse>;
export { DefuddleClass, DefuddleOptions, DefuddleResponse };

import { Defuddle as DefuddleClass } from './defuddle';
import type { DefuddleOptions, DefuddleResponse } from './types';
export type { DefuddleOptions, DefuddleResponse, DefuddleMetadata, DebugInfo, DebugRemoval } from './types';
/**
 * Parse HTML content using linkedom
 * @param htmlOrDom HTML string or linkedom document to parse
 * @param url Optional URL of the page being parsed
 * @param options Optional parsing options
 * @returns Promise with parsed content and metadata
 */
declare function Defuddle(htmlOrDom: string | Document, url?: string, options?: DefuddleOptions): Promise<DefuddleResponse>;
export { DefuddleClass };
export { Defuddle };
export default Defuddle;

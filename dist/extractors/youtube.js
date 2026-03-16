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
exports.YoutubeExtractor = void 0;
const _base_1 = require("./_base");
const transcript_1 = require("../utils/transcript");
const SENTENCE_END = /[.!?]["'\u2019\u201D)]*\s*$/;
// Unofficial InnerTube API. Uses Android client context to get caption track URLs.
// Version may need updating if Google changes the API.
const INNERTUBE_API_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const INNERTUBE_CLIENT_VERSION = '20.10.38';
const INNERTUBE_CONTEXT = {
    client: {
        clientName: 'ANDROID',
        clientVersion: INNERTUBE_CLIENT_VERSION,
    }
};
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;
const INNERTUBE_NEXT_URL = 'https://www.youtube.com/youtubei/v1/next?prettyPrint=false';
const INNERTUBE_WEB_CONTEXT = {
    client: {
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00',
    }
};
class YoutubeExtractor extends _base_1.BaseExtractor {
    constructor(document, url, schemaOrgData) {
        super(document, url, schemaOrgData);
        this.videoElement = document.querySelector('video');
        this.schemaOrgData = schemaOrgData;
    }
    canExtract() {
        return true;
    }
    canExtractAsync() {
        return true;
    }
    prefersAsync() {
        return true;
    }
    extract() {
        return this.buildResult();
    }
    extractAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            const transcript = yield this.fetchTranscript();
            return this.buildResult(transcript);
        });
    }
    buildResult(transcript) {
        const videoData = this.getVideoData();
        const channelName = this.getChannelName(videoData);
        const description = videoData.description || '';
        const formattedDescription = this.formatDescription(description);
        let contentHtml = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${this.getVideoId()}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>${formattedDescription}`;
        if (transcript === null || transcript === void 0 ? void 0 : transcript.html) {
            contentHtml += transcript.html;
        }
        const variables = {
            title: videoData.name || '',
            author: channelName,
            site: 'YouTube',
            image: Array.isArray(videoData.thumbnailUrl) ? videoData.thumbnailUrl[0] || '' : '',
            published: videoData.uploadDate,
            description: description.slice(0, 200).trim(),
        };
        if (transcript === null || transcript === void 0 ? void 0 : transcript.text) {
            variables.transcript = transcript.text;
        }
        if (transcript === null || transcript === void 0 ? void 0 : transcript.languageCode) {
            variables.language = transcript.languageCode;
        }
        return {
            content: contentHtml,
            contentHtml: contentHtml,
            extractedContent: {
                videoId: this.getVideoId(),
                author: channelName,
            },
            variables,
        };
    }
    formatDescription(description) {
        return `<p>${description.replace(/\n/g, '<br>')}</p>`;
    }
    getVideoData() {
        if (!this.schemaOrgData)
            return {};
        const videoData = Array.isArray(this.schemaOrgData)
            ? this.schemaOrgData.find(item => item['@type'] === 'VideoObject')
            : this.schemaOrgData['@type'] === 'VideoObject' ? this.schemaOrgData : null;
        return videoData || {};
    }
    getChannelName(videoData) {
        const fromDom = this.getChannelNameFromDom();
        if (fromDom) {
            return fromDom;
        }
        const fromPlayer = this.getChannelNameFromPlayerResponse();
        if (fromPlayer) {
            return fromPlayer;
        }
        return (videoData === null || videoData === void 0 ? void 0 : videoData.author) || '';
    }
    getChannelNameFromDom() {
        var _a;
        const ownerSelectors = [
            'ytd-video-owner-renderer #channel-name a[href^="/@"]',
            '#owner-name a[href^="/@"]'
        ];
        for (const selector of ownerSelectors) {
            const element = this.document.querySelector(selector);
            const value = (_a = element === null || element === void 0 ? void 0 : element.textContent) === null || _a === void 0 ? void 0 : _a.trim();
            if (value) {
                return value;
            }
        }
        return this.getChannelNameFromMicrodata();
    }
    getChannelNameFromMicrodata() {
        var _a;
        const authorRoot = this.document.querySelector('[itemprop="author"]');
        if (!authorRoot)
            return '';
        const metaName = authorRoot.querySelector('meta[itemprop="name"]');
        if (metaName === null || metaName === void 0 ? void 0 : metaName.getAttribute('content')) {
            return metaName.getAttribute('content').trim();
        }
        const linkName = authorRoot.querySelector('link[itemprop="name"]');
        if (linkName === null || linkName === void 0 ? void 0 : linkName.getAttribute('content')) {
            return linkName.getAttribute('content').trim();
        }
        const text = authorRoot.querySelector('[itemprop="name"], a, span');
        return ((_a = text === null || text === void 0 ? void 0 : text.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '';
    }
    getChannelNameFromPlayerResponse() {
        var _a, _b, _c, _d;
        const data = this.parseInlineJson('ytInitialPlayerResponse');
        if (!data)
            return '';
        const fromVideoDetails = ((_a = data === null || data === void 0 ? void 0 : data.videoDetails) === null || _a === void 0 ? void 0 : _a.author) || ((_b = data === null || data === void 0 ? void 0 : data.videoDetails) === null || _b === void 0 ? void 0 : _b.ownerChannelName);
        if (fromVideoDetails) {
            return fromVideoDetails;
        }
        const fromMicroformat = (_d = (_c = data === null || data === void 0 ? void 0 : data.microformat) === null || _c === void 0 ? void 0 : _c.playerMicroformatRenderer) === null || _d === void 0 ? void 0 : _d.ownerChannelName;
        return fromMicroformat || '';
    }
    parseInlineJson(globalName) {
        const scripts = Array.from(this.document.querySelectorAll('script'));
        for (const script of scripts) {
            const text = script.textContent || '';
            if (!text.includes(globalName))
                continue;
            const startIndex = text.indexOf('{', text.indexOf(globalName));
            if (startIndex === -1)
                continue;
            let depth = 0;
            for (let i = startIndex; i < text.length; i++) {
                const char = text[i];
                if (char === '{') {
                    depth += 1;
                }
                else if (char === '}') {
                    depth -= 1;
                    if (depth === 0) {
                        const jsonText = text.slice(startIndex, i + 1);
                        try {
                            return JSON.parse(jsonText);
                        }
                        catch (error) {
                            console.error('YoutubeExtractor: failed to parse inline JSON', error);
                            break;
                        }
                    }
                }
            }
        }
        return null;
    }
    fetchTranscript() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const videoId = this.getVideoId();
                if (!videoId)
                    return undefined;
                // Fetch captions and chapters in parallel
                const [playerData, chapters] = yield Promise.all([
                    this.fetchPlayerData(videoId),
                    this.fetchChapters(videoId),
                ]);
                if (!playerData)
                    return undefined;
                const captionTracks = (_b = (_a = playerData === null || playerData === void 0 ? void 0 : playerData.captions) === null || _a === void 0 ? void 0 : _a.playerCaptionsTracklistRenderer) === null || _b === void 0 ? void 0 : _b.captionTracks;
                if (!Array.isArray(captionTracks) || captionTracks.length === 0)
                    return undefined;
                // Prefer English, fall back to first available track
                const track = captionTracks.find((t) => t.languageCode === 'en')
                    || captionTracks[0];
                if (!(track === null || track === void 0 ? void 0 : track.baseUrl))
                    return undefined;
                // Validate URL to prevent SSRF in server-side contexts
                try {
                    const captionUrl = new URL(track.baseUrl);
                    if (!captionUrl.hostname.endsWith('.youtube.com'))
                        return undefined;
                }
                catch (_c) {
                    return undefined;
                }
                const response = yield fetch(track.baseUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                });
                if (!response.ok)
                    return undefined;
                const xml = yield response.text();
                if (!xml)
                    return undefined;
                return this.parseTranscriptXml(xml, track.languageCode || 'en', chapters);
            }
            catch (error) {
                console.error('YoutubeExtractor: failed to fetch transcript', error);
                return undefined;
            }
        });
    }
    fetchPlayerData(videoId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const resp = yield fetch(INNERTUBE_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': INNERTUBE_USER_AGENT,
                    },
                    body: JSON.stringify({
                        context: INNERTUBE_CONTEXT,
                        videoId,
                    })
                });
                if (!resp.ok)
                    return undefined;
                return resp.json();
            }
            catch (_a) {
                return undefined;
            }
        });
    }
    fetchChapters(videoId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const resp = yield fetch(INNERTUBE_NEXT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        context: INNERTUBE_WEB_CONTEXT,
                        videoId,
                    })
                });
                if (!resp.ok)
                    return [];
                const data = yield resp.json();
                // Try chapterRenderer from the player bar (explicit chapters)
                const chapters = this.extractChaptersFromPlayerBar(data);
                if (chapters.length > 0)
                    return chapters;
                // Fall back to macroMarkersListItemRenderer from engagement panels
                // (auto-generated "Key moments" from description timestamps)
                return this.extractChaptersFromEngagementPanels(data);
            }
            catch (_a) {
                return [];
            }
        });
    }
    extractChaptersFromPlayerBar(data) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const chapters = [];
        const panels = (_f = (_e = (_d = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.playerOverlays) === null || _a === void 0 ? void 0 : _a.playerOverlayRenderer) === null || _b === void 0 ? void 0 : _b.decoratedPlayerBarRenderer) === null || _c === void 0 ? void 0 : _c.decoratedPlayerBarRenderer) === null || _d === void 0 ? void 0 : _d.playerBar) === null || _e === void 0 ? void 0 : _e.multiMarkersPlayerBarRenderer) === null || _f === void 0 ? void 0 : _f.markersMap;
        if (!Array.isArray(panels))
            return chapters;
        for (const panel of panels) {
            const markers = (_g = panel === null || panel === void 0 ? void 0 : panel.value) === null || _g === void 0 ? void 0 : _g.chapters;
            if (!Array.isArray(markers))
                continue;
            for (const marker of markers) {
                const ch = marker === null || marker === void 0 ? void 0 : marker.chapterRenderer;
                if (!ch)
                    continue;
                const title = ((_h = ch.title) === null || _h === void 0 ? void 0 : _h.simpleText) || '';
                const startMs = ch.timeRangeStartMillis;
                if (title && typeof startMs === 'number') {
                    chapters.push({ title, start: startMs / 1000 });
                }
            }
        }
        return chapters;
    }
    extractChaptersFromEngagementPanels(data) {
        var _a, _b, _c, _d;
        const chapters = [];
        const panels = data === null || data === void 0 ? void 0 : data.engagementPanels;
        if (!Array.isArray(panels))
            return chapters;
        for (const panel of panels) {
            const content = (_a = panel === null || panel === void 0 ? void 0 : panel.engagementPanelSectionListRenderer) === null || _a === void 0 ? void 0 : _a.content;
            const items = (_b = content === null || content === void 0 ? void 0 : content.macroMarkersListRenderer) === null || _b === void 0 ? void 0 : _b.contents;
            if (!Array.isArray(items))
                continue;
            for (const item of items) {
                const renderer = item === null || item === void 0 ? void 0 : item.macroMarkersListItemRenderer;
                if (!renderer)
                    continue;
                const title = ((_c = renderer.title) === null || _c === void 0 ? void 0 : _c.simpleText) || '';
                const timeStr = ((_d = renderer.timeDescription) === null || _d === void 0 ? void 0 : _d.simpleText) || '';
                if (!title || !timeStr)
                    continue;
                const seconds = this.parseTimestamp(timeStr);
                if (seconds !== null) {
                    chapters.push({ title, start: seconds });
                }
            }
        }
        return chapters;
    }
    parseTimestamp(ts) {
        const parts = ts.split(':').map(Number);
        if (parts.some(isNaN))
            return null;
        if (parts.length === 3)
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2)
            return parts[0] * 60 + parts[1];
        return null;
    }
    parseTranscriptXml(xml, languageCode, chapters = []) {
        const segments = [];
        // Handle srv3 format: <p t="ms" d="ms"><s>word</s>...</p>
        const pRegex = /<p\s+t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
        let match;
        while ((match = pRegex.exec(xml)) !== null) {
            const startMs = parseInt(match[1], 10);
            const inner = match[2];
            // Extract text from <s> children, or use raw text
            let text = '';
            const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
            let sMatch;
            while ((sMatch = sRegex.exec(inner)) !== null) {
                text += sMatch[1];
            }
            // Fall back to stripping all tags if no <s> elements
            if (!text) {
                text = inner.replace(/<[^>]+>/g, '');
            }
            // Decode HTML entities
            text = this.decodeEntities(text);
            if (text.trim()) {
                segments.push({ start: startMs / 1000, text: text.trim() });
            }
        }
        // Fall back to simple format: <text start="s" dur="s">content</text>
        if (segments.length === 0) {
            const textRegex = /<text\s+start="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
            while ((match = textRegex.exec(xml)) !== null) {
                const start = parseFloat(match[1]);
                let text = this.decodeEntities(match[2].replace(/<[^>]+>/g, ''));
                if (text.trim()) {
                    segments.push({ start, text: text.trim() });
                }
            }
        }
        if (segments.length === 0)
            return undefined;
        const groups = this.groupTranscriptSegments(segments);
        const { html, text } = (0, transcript_1.buildTranscript)('youtube', groups, chapters);
        return { html, text, languageCode };
    }
    decodeEntities(text) {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
    }
    getVideoId() {
        const url = new URL(this.url);
        if (url.hostname === 'youtu.be') {
            return url.pathname.slice(1);
        }
        return new URLSearchParams(url.search).get('v') || '';
    }
    /**
     * Group raw transcript segments into readable blocks.
     * If speaker markers (>>) are present, groups by speaker turn.
     * Otherwise, groups by sentence boundaries.
     */
    groupTranscriptSegments(segments) {
        if (segments.length === 0)
            return [];
        const hasSpeakerMarkers = segments.some(s => /^>>/.test(s.text));
        return hasSpeakerMarkers
            ? this.groupBySpeaker(segments)
            : this.groupBySentence(segments);
    }
    /**
     * Group segments by speaker turns, then by sentences within each turn.
     * Each ">>" marker starts a new speaker turn (with blank line separation).
     * Within a turn, text is split at sentence boundaries for readability.
     * Tracks alternating speaker identity (0/1).
     */
    groupBySpeaker(segments) {
        // First pass: collect segments into speaker turns
        const turns = [];
        let currentTurn = null;
        let speakerIndex = -1;
        let prevSegText = '';
        for (const seg of segments) {
            const isSpeakerChange = /^>>/.test(seg.text);
            const cleanText = seg.text.replace(/^>>\s*/, '');
            // Only treat >> as a real speaker change if the previous segment
            // ended at a sentence boundary — otherwise it's a mid-sentence
            // false positive from auto-captions
            const prevEndsWithComma = /,\s*$/.test(prevSegText);
            const prevEndedSentence = (SENTENCE_END.test(prevSegText) || !prevSegText) && !prevEndsWithComma;
            const isRealSpeakerChange = isSpeakerChange && prevEndedSentence;
            if (isRealSpeakerChange) {
                if (currentTurn)
                    turns.push(currentTurn);
                speakerIndex = (speakerIndex + 1) % 2;
                currentTurn = { start: seg.start, segments: [{ start: seg.start, text: cleanText }], speakerChange: true, speaker: speakerIndex };
            }
            else {
                if (!currentTurn) {
                    currentTurn = { start: seg.start, segments: [], speakerChange: false };
                }
                currentTurn.segments.push({ start: seg.start, text: cleanText });
            }
            prevSegText = cleanText;
        }
        if (currentTurn)
            turns.push(currentTurn);
        // Split turns that start with a short affirmative (e.g. "Mhm.", "Yeah.")
        // followed by longer text — the affirmative is likely the other speaker
        this.splitAffirmativeTurns(turns);
        // Second pass: split each turn into sentence groups
        const groups = [];
        for (const turn of turns) {
            const sentenceGroups = this.groupBySentence(turn.segments);
            for (let i = 0; i < sentenceGroups.length; i++) {
                groups.push(Object.assign(Object.assign({}, sentenceGroups[i]), { speakerChange: i === 0 && turn.speakerChange, speaker: turn.speaker }));
            }
        }
        return groups;
    }
    /**
     * Split turns that start with a short affirmative response (e.g. "Mhm.", "Yeah.")
     * followed by longer content. The affirmative belongs to the current speaker,
     * but the rest is likely the other speaker (missed diarization in auto-captions).
     */
    splitAffirmativeTurns(turns) {
        const affirmativePattern = /^(mhm|yeah|yes|yep|right|okay|ok|absolutely|sure|exactly|uh-huh|mm-hmm)[.!,]?\s+/i;
        for (let i = 0; i < turns.length; i++) {
            const turn = turns[i];
            if (turn.speaker === undefined || turn.segments.length === 0)
                continue;
            const firstSeg = turn.segments[0];
            const match = affirmativePattern.exec(firstSeg.text);
            if (!match)
                continue;
            // Don't split if the affirmative ends with a comma — the speaker is continuing
            if (/,\s*$/.test(match[0]))
                continue;
            // Check that there's substantial content after the affirmative
            // Only split when the remainder is long enough to be a different speaker's
            // response, not just the same speaker continuing after an affirmative
            const remainder = firstSeg.text.slice(match[0].length).trim();
            const restSegments = turn.segments.slice(1);
            const restWords = remainder.split(/\s+/).filter(w => w).length
                + restSegments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
            if (restWords < 30)
                continue;
            // Split: keep affirmative in current turn, move rest to new turn with flipped speaker
            const affirmativeText = match[0].trimEnd();
            const newRestSegments = remainder
                ? [{ start: firstSeg.start, text: remainder }, ...restSegments]
                : restSegments;
            const affirmativeTurn = {
                start: turn.start,
                segments: [{ start: firstSeg.start, text: affirmativeText }],
                speakerChange: turn.speakerChange,
                speaker: turn.speaker,
            };
            const restTurn = {
                start: newRestSegments[0].start,
                segments: newRestSegments,
                speakerChange: true,
                speaker: turn.speaker === 0 ? 1 : 0,
            };
            turns.splice(i, 1, affirmativeTurn, restTurn);
            i++; // skip the newly inserted rest turn
        }
    }
    /**
     * Group segments by sentence boundaries for transcripts without speaker markers.
     * Accumulates text until a segment ends with sentence-ending punctuation (.!?),
     * or until a time gap >5 seconds between segments.
     */
    groupBySentence(segments) {
        const groups = [];
        let buffer = '';
        let bufferStart = 0;
        let lastStart = 0;
        const flush = () => {
            if (buffer.trim()) {
                groups.push({
                    start: bufferStart,
                    text: buffer.trim(),
                    speakerChange: false,
                });
                buffer = '';
            }
        };
        for (const seg of segments) {
            // Flush on a significant time gap (>5s between segments)
            if (buffer && seg.start - lastStart > 5) {
                flush();
            }
            if (!buffer) {
                bufferStart = seg.start;
            }
            buffer += (buffer ? ' ' : '') + seg.text;
            lastStart = seg.start;
            // Only flush when the segment itself ends with sentence punctuation
            if (SENTENCE_END.test(seg.text)) {
                flush();
            }
        }
        flush();
        return groups;
    }
}
exports.YoutubeExtractor = YoutubeExtractor;
//# sourceMappingURL=youtube.js.map
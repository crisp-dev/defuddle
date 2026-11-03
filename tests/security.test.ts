import { describe, test, expect } from 'vitest';
import Defuddle from '../src/index';
import { parseSrcset, isDangerousUrl } from '../src/utils/dom';
import { escapeMarkdownUrl } from '../src/markdown';

const filler = '<p>' + 'Lorem ipsum dolor sit amet consectetur adipiscing elit. '.repeat(40) + '</p>';
const page = (inner: string) =>
	`<html><head><title>Test</title></head><body><article><h1>Test</h1>${filler}${inner}${filler}</article></body></html>`;

async function markdown(inner: string): Promise<string> {
	const result = await Defuddle(page(inner), 'https://example.com/post', { markdown: true });
	return result.content;
}

/** A live markdown link/image destination using a dangerous scheme. */
const LIVE_DANGEROUS_LINK = /(?<!\\)\]\(\s*(javascript|vbscript|data:text)/i;

describe('Dangerous link unwrapping', () => {
	test.each([
		['javascript', '<p>see <a href="javascript:alert(1)">link text</a> now</p>'],
		['mixed-case scheme', '<p>see <a href="JavaScript:alert(1)">link text</a> now</p>'],
		['tab inside scheme', '<p>see <a href="java&#9;script:alert(1)">link text</a> now</p>'],
		['vbscript', '<p>see <a href="vbscript:msgbox(1)">link text</a> now</p>'],
		['data:text/html', '<p>see <a href="data:text/html,x">link text</a> now</p>'],
	])('keeps the text, removes the link: %s', async (_, payload) => {
		const md = await markdown(payload);
		expect(md).toContain('see link text now');
		expect(md).not.toMatch(/javascript:|vbscript:|data:text/i);
	});

	test('keeps inner markup', async () => {
		const md = await markdown('<p>see <a href="javascript:void(0)"><strong>bold text</strong></a> now</p>');
		expect(md).toContain('see **bold text** now');
		expect(md).not.toMatch(/javascript:/i);
	});

	test('discards links without content', async () => {
		const md = await markdown('<p>see <a href="JavaScript:alert(1)"></a>now</p>');
		expect(md).toContain('see now');
		expect(md).not.toMatch(/javascript:/i);
	});

	test('unwraps regardless of pipeline toggles', async () => {
		const result = await Defuddle(page('<p><a href="JavaScript:alert(1)">link text</a></p>'), 'https://example.com/post', {
			markdown: true, standardize: false, removeExactSelectors: false, removePartialSelectors: false,
		});
		expect(result.content).toContain('link text');
		expect(result.content).not.toMatch(/javascript:/i);
	});

	test('unwraps in the fallback (no main content) path', async () => {
		const html = '<html><body><a href="JavaScript:alert(1)">link text</a></body></html>';
		const result = await Defuddle(html, 'https://example.com/post', { markdown: true });
		expect(result.content).not.toMatch(/javascript:/i);
	});

	test('unwraps in schema.org text used as fallback content', async () => {
		const text = `<a href="JavaScript:alert(1)">link text</a> ${'word '.repeat(400)}`;
		const html = `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'SocialMediaPosting', text })}</script></head><body><div><p>hi</p></div></body></html>`;
		const result = await Defuddle(html, 'https://example.com/post', { markdown: true });
		expect(result.content).toContain('link text');
		expect(result.content).not.toMatch(/javascript:/i);
	});

	test('keeps safe links', async () => {
		const md = await markdown('<p>see <a href="/other">link</a></p>');
		expect(md).toContain('[link](https://example.com/other)');
	});
});

describe('Event handler stripping', () => {
	const ON_ATTR = /\son\w+\s*=/i;

	test.each([
		['svg onload', '<svg onload="alert(1)" width="100" height="100"><circle r="5"/></svg>'],
		['nested svg element', '<svg width="100" height="100"><circle r="5" onmouseover="alert(1)"/></svg>'],
		['img in svg foreignObject', '<svg width="50" height="50"><foreignObject><img src="x" onerror="alert(1)"></foreignObject></svg>'],
		['mixed-case attribute', '<p><img src="x" OnError="alert(1)" width="400" height="300"></p>'],
	])('%s', async (_, payload) => {
		for (const options of [{}, { markdown: true }]) {
			const result = await Defuddle(page(payload), 'https://example.com/post', options);
			expect(result.content).not.toMatch(ON_ATTR);
		}
	});

	test('strips regardless of pipeline toggles', async () => {
		const result = await Defuddle(page('<p><img src="x" onerror="alert(1)" width="400" height="300"></p>'), 'https://example.com/post', {
			standardize: false, removeExactSelectors: false, removePartialSelectors: false, removeHiddenElements: false, removeLowScoring: false,
		});
		expect(result.content).not.toMatch(ON_ATTR);
	});

	test('strips in schema.org text used as fallback content', async () => {
		const text = `<img src=x onerror=alert(1)> ${'word '.repeat(400)}`;
		const html = `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'SocialMediaPosting', text })}</script></head><body><div><p>hi</p></div></body></html>`;
		const result = await Defuddle(html, 'https://example.com/post');
		expect(result.content).not.toMatch(ON_ATTR);
	});
});

describe('Unsafe element removal', () => {
	const UNSAFE = /<(script|style|noscript|template|frame|frameset|object|embed|applet|base|meta|link)\b/i;
	const payload = [
		'<script>alert(1)</script>', '<style>p{}</style>', '<noscript><p>x</p></noscript>',
		'<template><p>x</p></template>', '<object data="x.swf"></object>', '<embed src="x.swf">',
		'<base href="https://evil.example/">', '<meta http-equiv="refresh" content="0;url=https://evil.example/">',
		'<link rel="stylesheet" href="https://evil.example/x.css">',
	].join('');

	test.each([
		[{}],
		[{ removeExactSelectors: false }],
		[{ standardize: false, removeExactSelectors: false, removePartialSelectors: false, removeHiddenElements: false, removeLowScoring: false }],
	])('removes unsafe elements regardless of toggles: %j', async (options) => {
		const result = await Defuddle(page(payload), 'https://example.com/post', options);
		expect(result.content).not.toMatch(UNSAFE);
	});

	test('keeps math scripts and allowlisted iframes', async () => {
		const result = await Defuddle(page('<script type="math/tex">x^2</script><iframe src="https://www.youtube.com/embed/abc123" width="560" height="315"></iframe>'), 'https://example.com/post', { removeExactSelectors: false });
		expect(result.content).toContain('<iframe');
	});
});

describe('Markdown link injection via attributes', () => {
	test.each([
		['image alt', '<p><img src="https://x.test/a.png" alt="x](y) [click](javascript:alert(1)) ![z" width="400" height="300"></p>'],
		['figure alt', '<figure><img src="https://x.test/a.png" alt="x](y) [click](javascript:alert(1)) ![z" width="400" height="300"><figcaption>cap</figcaption></figure>'],
		['image src', '<p><img src="https://x.test/a.png)[click](javascript:alert(1)" width="400" height="300"></p>'],
		['link href', '<p><a href="https://x.test/)[click](javascript:alert(1)">t</a></p>'],
		['math latex', '<p>eq <math data-latex="[click](javascript:alert(1))"><mi>x</mi></math> end</p>'],
		['embed url', '<iframe src="https://x.com/a)[click](javascript:alert(1))/status/1" width="560" height="315"></iframe>'],
	])('%s', async (_, payload) => {
		const md = await markdown(payload);
		expect(md).not.toMatch(LIVE_DANGEROUS_LINK);
	});
});

describe('Markdown titles cannot break out of their quotes', () => {
	// The payload ends up inside the title; backslashes and quotes are
	// escaped, so the title only closes at the final quote.
	const title = 'a\\&quot;) [click](javascript:alert(1)) (&quot;';
	const escaped = '"a\\\\\\") [click](javascript:alert(1)) (\\"")';

	test('image title', async () => {
		const md = await markdown(`<p><img src="https://x.test/a.png" title="${title}" width="400" height="300"></p>`);
		expect(md).toContain(`![](https://x.test/a.png ${escaped}`);
	});

	test('link title', async () => {
		const md = await markdown(`<p><a href="https://x.test/" title="${title}">t</a></p>`);
		expect(md).toContain(`[t](https://x.test/ ${escaped}`);
	});
});

describe('escapeMarkdownUrl', () => {
	test('escapes parentheses and encodes whitespace', () => {
		expect(escapeMarkdownUrl('https://x.test/a (b).png')).toBe('https://x.test/a%20\\(b\\).png');
	});
});

describe('isDangerousUrl', () => {
	test.each([
		'javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' java\tscript:x', 'vbscript:x',
		'data:text/html,x', 'data:application/xhtml+xml,x', 'data:,x',
	])('flags %s', (url) => expect(isDangerousUrl(url)).toBe(true));

	test.each([
		'https://example.com', '/relative', '#anchor', 'mailto:a@example.com', 'data:image/png;base64,AAAA',
	])('allows %s', (url) => expect(isDangerousUrl(url)).toBe(false));
});

describe('parseSrcset', () => {
	test('parses standard srcset', () => {
		expect(parseSrcset('a.jpg 100w, b.jpg 200w')).toEqual([
			{ url: 'a.jpg', descriptor: '100w' },
			{ url: 'b.jpg', descriptor: '200w' },
		]);
	});

	test('keeps commas inside CDN URLs', () => {
		expect(parseSrcset('https://cdn.example.com/f_auto,w_424,c_limit/img.jpg 424w, https://cdn.example.com/f_auto,w_848/img.jpg 848w')).toEqual([
			{ url: 'https://cdn.example.com/f_auto,w_424,c_limit/img.jpg', descriptor: '424w' },
			{ url: 'https://cdn.example.com/f_auto,w_848/img.jpg', descriptor: '848w' },
		]);
	});

	test('handles missing space after comma and density descriptors', () => {
		expect(parseSrcset('a.jpg 1x,b.jpg 2.5x')).toEqual([
			{ url: 'a.jpg', descriptor: '1x' },
			{ url: 'b.jpg', descriptor: '2.5x' },
		]);
	});

	test('runs in linear time on adversarial input', async () => {
		const start = Date.now();
		parseSrcset(' '.repeat(100000) + 'a');
		parseSrcset('a,'.repeat(100000));
		await markdown(`<img width="500" height="500" src="a.jpg" srcset="${' '.repeat(20000)}a">`);
		expect(Date.now() - start).toBeLessThan(1000);
	});
});

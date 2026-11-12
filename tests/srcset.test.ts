import { describe, test, expect } from 'vitest';
import Defuddle from '../src/index';
import { parseSrcset } from '../src/utils/dom';

const filler = '<p>' + 'Lorem ipsum dolor sit amet consectetur adipiscing elit. '.repeat(40) + '</p>';
const page = (inner: string) =>
	`<html><head><title>Test</title></head><body><article><h1>Test</h1>${filler}${inner}${filler}</article></body></html>`;

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
});

describe('srcset ReDoS', () => {
	// The previous /(.+?)\s+(\d+(?:\.\d+)?[wx])/g parser was cubic on long whitespace
	// runs with no descriptor (4k spaces: 16s). Non-space ends survive srcset.trim().
	// Kept small enough that the old parser fails these tests instead of hanging them.
	const adversarial = 'a' + ' '.repeat(3000) + 'a';

	test('parseSrcset runs in linear time', () => {
		const start = Date.now();
		parseSrcset(' '.repeat(100000) + 'a');
		parseSrcset('a,'.repeat(100000));
		parseSrcset('a '.repeat(100000));
		parseSrcset('a' + ' '.repeat(100000) + 'a');
		expect(Date.now() - start).toBeLessThan(1000);
	});

	test.each([
		['img srcset (best image / URL resolution)', `<img width="500" height="500" src="a.jpg" srcset="${adversarial}">`],
		['picture source srcset (image standardization)', `<picture><source srcset="${adversarial}"><img src="a.jpg" width="500" height="500"></picture>`],
	])('%s does not hang', async (_, inner) => {
		const start = Date.now();
		await Defuddle(page(inner), 'https://example.com/post', { markdown: true });
		expect(Date.now() - start).toBeLessThan(2000);
	});
});

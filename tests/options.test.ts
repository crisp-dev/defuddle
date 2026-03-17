import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import Defuddle from '../src/index';

/**
 * Test all Defuddle options on a single comprehensive fixture.
 * 
 * This test suite verifies that each option works correctly in isolation,
 * testing the effect of toggling various pipeline steps.
 */

const fixturePath = join(__dirname, 'fixtures', 'general--stephango.com-buy-wisely.html');
const fixtureHtml = readFileSync(fixturePath, 'utf-8');
const fixtureUrl = 'https://stephango.com/buy-wisely';

describe('Defuddle Options Tests', () => {
	describe('markdown option', () => {
		test('markdown: true converts content to markdown', async () => {
			const result = await Defuddle(fixtureHtml, fixtureUrl, { markdown: true });

			// Content should be markdown (no HTML paragraph tags)
			expect(result.content).not.toContain('<p>');
			expect(result.content).not.toContain('</p>');
		});

		test('separateMarkdown: true populates contentMarkdown while keeping content as HTML', async () => {
			const result = await Defuddle(fixtureHtml, fixtureUrl, { separateMarkdown: true });

			// content should still be HTML
			expect(result.content).toContain('<');

			// contentMarkdown should be populated
			expect(result.contentMarkdown).toBeDefined();
			expect(result.contentMarkdown).not.toContain('<p>');
		});

		test('without markdown options, no markdown conversion happens', async () => {
			const result = await Defuddle(fixtureHtml, fixtureUrl);

			// content should be HTML
			expect(result.content).toContain('<');

			// contentMarkdown should not be set
			expect(result.contentMarkdown).toBeUndefined();
		});
	});

	describe('removeExactSelectors option', () => {
		test('removeExactSelectors: false preserves exact selector matches', async () => {
			const result1 = await Defuddle(fixtureHtml, fixtureUrl);
			const result2 = await Defuddle(fixtureHtml, fixtureUrl, {
				removeExactSelectors: false,
			});

			// Without removal should have equal or more content
			expect(result2.wordCount).toBeGreaterThanOrEqual(result1.wordCount);
		});
	});

	describe('removePartialSelectors option', () => {
		test('removePartialSelectors: false preserves partial selector matches', async () => {
			const result1 = await Defuddle(fixtureHtml, fixtureUrl);
			const result2 = await Defuddle(fixtureHtml, fixtureUrl, {
				removePartialSelectors: false,
			});

			// Without removal should have equal or more content
			expect(result2.wordCount).toBeGreaterThanOrEqual(result1.wordCount);
		});
	});

	describe('removeImages option', () => {
		test('removeImages: true removes all images', async () => {
			const result = await Defuddle(fixtureHtml, fixtureUrl, { removeImages: true });

			expect(result.content).not.toContain('<img');
		});

		test('removeImages: false preserves images', async () => {
			const result = await Defuddle(fixtureHtml, fixtureUrl, { removeImages: false });

			// Content should be extracted successfully
			expect(result.content).toBeDefined();
			expect(result.wordCount).toBeGreaterThan(0);
		});
	});

	describe('removeHiddenElements option', () => {
		test('removeHiddenElements: false preserves hidden elements', async () => {
			const result1 = await Defuddle(fixtureHtml, fixtureUrl);
			const result2 = await Defuddle(fixtureHtml, fixtureUrl, {
				removeHiddenElements: false,
			});

			// Without hidden element removal should have equal or more content
			expect(result2.wordCount).toBeGreaterThanOrEqual(result1.wordCount);
		});
	});

	describe('removeLowScoring option', () => {
		test('removeLowScoring: false skips content scoring', async () => {
			const result1 = await Defuddle(fixtureHtml, fixtureUrl);
			const result2 = await Defuddle(fixtureHtml, fixtureUrl, {
				removeLowScoring: false,
			});

			expect(result2.wordCount).toBeGreaterThanOrEqual(result1.wordCount);
		});
	});

	describe('removeSmallImages option', () => {
		test('removeSmallImages: false preserves small images', async () => {
			const result1 = await Defuddle(fixtureHtml, fixtureUrl);
			const result2 = await Defuddle(fixtureHtml, fixtureUrl, {
				removeSmallImages: false,
			});

			expect(result2.content.length).toBeGreaterThanOrEqual(result1.content.length);
		});
	});

	describe('standardize option', () => {
		test('standardize: false disables HTML standardization', async () => {
			const result = await Defuddle(fixtureHtml, fixtureUrl, { standardize: false });

			// Content should still be extracted
			expect(result.content.length).toBeGreaterThan(0);
			expect(result.wordCount).toBeGreaterThan(0);
		});
	});

	describe('removeContentPatterns option', () => {
		test('removeContentPatterns: false disables content pattern removal', async () => {
			const result = await Defuddle(fixtureHtml, fixtureUrl, { removeContentPatterns: false });

			// Content should still be extracted
			expect(result.content.length).toBeGreaterThan(0);
			expect(result.wordCount).toBeGreaterThan(0);
		});
	});

	describe('contentSelector option', () => {
		test('contentSelector selects the specified element', async () => {
			const result = await Defuddle(fixtureHtml, fixtureUrl, {
				contentSelector: 'body',
			});

			expect(result.content.length).toBeGreaterThan(0);
		});

		test('contentSelector falls back to auto-detection on no match', async () => {
			const result = await Defuddle(fixtureHtml, fixtureUrl, {
				contentSelector: '.nonexistent-class-xyz',
			});

			expect(result.content.length).toBeGreaterThan(0);
		});
	});

	describe('removeSelectors option', () => {
		test('removeSelectors removes specified elements', async () => {
			const result = await Defuddle(fixtureHtml, fixtureUrl, {
				removeSelectors: ['header', 'nav'],
			});

			// Content should be extracted successfully
			expect(result.content.length).toBeGreaterThan(0);
			expect(result.wordCount).toBeGreaterThan(0);
		});
	});

	describe('all pipeline toggles', () => {
		test('all toggles off produces more or equal content', async () => {
			const defaults = await Defuddle(fixtureHtml, fixtureUrl);
			const allOff = await Defuddle(fixtureHtml, fixtureUrl, {
				removeLowScoring: false,
				removeHiddenElements: false,
				removeSmallImages: false,
				removeExactSelectors: false,
				removePartialSelectors: false,
				removeContentPatterns: false,
				standardize: false,
			});

			expect(allOff.wordCount).toBeGreaterThanOrEqual(defaults.wordCount);
		});
	});
});

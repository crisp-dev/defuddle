import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, basename, extname } from 'path';
import Defuddle from '../src/index';

/**
 * Snapshot testing for all fixture files in default mode.
 * 
 * This test suite runs Defuddle on every HTML fixture in tests/fixtures/
 * and compares the output against stored snapshots. This ensures that
 * changes to the codebase don't unintentionally alter the extraction output.
 * 
 * To update snapshots after intentional changes:
 *   npm test -- --update
 */

const fixturesDir = join(__dirname, 'fixtures');

function getFixtures(): Array<{ name: string; path: string }> {
	const files = readdirSync(fixturesDir).filter(file => file.endsWith('.html'));

	return files.map(file => {
		const name = basename(file, extname(file));
		const path = join(fixturesDir, file);
		return { name, path };
	});
}

describe('Fixtures Snapshot Tests', () => {
	const fixtures = getFixtures();

	test('should have fixtures to test', () => {
		expect(fixtures.length).toBeGreaterThan(0);
	});

		test.each(fixtures)('$name — should match snapshot', async ({ name, path }) => {
		const html = readFileSync(path, 'utf-8');
		
		// Extract URL from fixture name (format: prefix--domain:path)
		const urlMatch = name.match(/^[^--]+--(.+)$/);
		const urlPath = urlMatch ? urlMatch[1].replace(/:/g, '/') : 'example.com';
		const url = `https://${urlPath}`;

		// Process with Defuddle using default options + markdown
		const result = await Defuddle(html, url, { separateMarkdown: true });

		// Basic sanity checks
		expect(result.content).toBeDefined();
		expect(result.content.length).toBeGreaterThan(0);
		expect(result.wordCount).toBeGreaterThan(0);
		expect(result.contentMarkdown).toBeDefined();

		// Create snapshot data (metadata + markdown content)
		const snapshot = {
			title: result.title,
			author: result.author,
			site: result.site,
			published: result.published,
			wordCount: result.wordCount,
			content: result.contentMarkdown,
		};

		// Compare against snapshot
		expect(snapshot).toMatchSnapshot(name);
	});
});

#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { Defuddle } from './dist/index.js';

const fixtures = ['fixture_1.txt', 'fixture_2.txt', 'fixture_3.txt'];

// Selectors to remove from DOM before processing
const removeSelectors = [
	// Specials
	'noscript',
	
	// Headers
	'header',
	'.header',
	'#header',
	
	// Footers
	'footer',
	'.footer',
	'#footer',
	
	// Sidebars
	'sidebar',
	'.sidebar',
	'#sidebar'
];

// html-to-text options
const htmlParserOptions = {
	preserveNewlines: true,

	limits: {
		maxDepth: 30,
		maxBaseElements: 200,
		maxInputLength: 10 * 1024 * 1024 // 10MB default
	},

	selectors: [
		{
			selector: "img",
			format: "skip"
		},

		{
			selector: "a",

			options: {
				linkBrackets: false
			}
		}
	]
};

for (const fixture of fixtures) {
	console.log(`\n=== Processing ${fixture} ===`);

	try {
		const html = readFileSync(`./${fixture}`, 'utf-8');
		const url = undefined;

		const now = Date.now();
		const result = await Defuddle(html, url, { 
			removeSelectors,
			htmlToText: htmlParserOptions
		});

		const { content, wordCount, title, description, author, published, parseTime } = result;
		const realTime = Date.now() - now;

		console.log('title      :', title);
		console.log('description:', description?.slice(0, 120));
		console.log('author     :', author);
		console.log('published  :', published);
		console.log('wordCount  :', wordCount);
		console.log('charCount  :', content.length);
		console.log('parseTime  :', parseTime, 'ms');
		console.log('realTime   :', realTime, 'ms');

		const outputFile = fixture.replace('.txt', '-result.md');
		writeFileSync(`./${outputFile}`, content ?? '');
		console.log(`Wrote output to ${outputFile}`);
	} catch (error) {
		console.error(`Error processing ${fixture}:`, error.message);
	}
}

console.log('\n=== Done ===');

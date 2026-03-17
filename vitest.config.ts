import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		testTimeout: 30000,
		// Use 'forks' pool to prevent dangling worker threads
		// linkedom and DOM operations can leave async handles that prevent thread cleanup
		pool: 'forks',
	},
});

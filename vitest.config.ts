import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
		plugins: [svelte({ hot: !process.env.VITEST })],
		resolve: {
			conditions: ['browser'],
			alias: {
				$app: path.resolve('./node_modules/@sveltejs/kit/src/runtime/app'),
				$lib: path.resolve('./src/lib')
			}
		},
		test: {
			environment: 'jsdom',
			globals: true,
			testTimeout: 30_000,
			setupFiles: ['./vitest.setup.ts'],
			server: {
				deps: {
					inline: ['@sveltejs/kit', 'svelte', '@testing-library/svelte', '@testing-library/svelte-core']
				}
			}
		}
	});

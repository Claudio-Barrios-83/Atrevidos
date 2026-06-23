import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	{
		rules: {
			// Add your project-specific rules here
		},
		ignores: [
			'build/',
			'.svelte-kit/',
			'dist/',
		],
	}
);

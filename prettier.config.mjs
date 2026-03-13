/** @type {import('prettier').Config} */
export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 110,
  tabWidth: 2,
  plugins: ['prettier-plugin-svelte'],
  overrides: [
    {
      files: '*.svelte',
      options: { parser: 'svelte' },
    },
    {
      files: '*.md',
      options: { printWidth: 110, proseWrap: 'always' },
    },
  ],
}

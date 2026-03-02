/** @type {import('prettier').Config} */
export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 120,
  tabWidth: 2,
  plugins: [],
  overrides: [
    {
      files: '*.md',
      options: { printWidth: 100, proseWrap: 'always' },
    },
  ],
}

export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/build/**"]
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {
      "no-unused-vars": "off"
    }
  }
];


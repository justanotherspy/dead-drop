import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", ".wrangler/", "coverage/", "node_modules/"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);

import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["**/dist"],
}, ...compat.extends(
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
    "plugin:prettier/recommended",
), {
    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2018,
        sourceType: "module",
    },

    rules: {
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        "prettier/prettier": "error",
    },
}];
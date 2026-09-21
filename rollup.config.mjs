import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import url from "node:url";
import fs from "node:fs";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.codex-demo.google-text-commands.sdPlugin";

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input: "src/plugin.ts",
	external: ["keytar"],
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		inlineDynamicImports: true,
		banner: `import { fileURLToPath as __rollupFileURLToPath } from "node:url"; import { dirname as __rollupDirname } from "node:path"; import { createRequire as __rollupCreateRequire } from "node:module"; const __dirname = __rollupDirname(__rollupFileURLToPath(import.meta.url)); globalThis.require ??= __rollupCreateRequire(import.meta.url);`,
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
			return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
		}
	},
	plugins: [
		{
			name: "watch-externals",
			buildStart: function () {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
			},
		},
		typescript({
			mapRoot: isWatching ? "./" : undefined
		}),
		json(),
		nodeResolve({
			browser: false,
			exportConditions: ["node"],
			preferBuiltins: true
		}),
		commonjs({ ignoreDynamicRequires: true }),
		!isWatching && terser(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			}
		},
		{
			name: "copy-runtime-assets",
			writeBundle() {
				const pluginRoot = path.resolve(sdPlugin);
				fs.cpSync(path.resolve("node_modules/google-assistant/lib"), path.join(pluginRoot, "lib"), { recursive: true, force: true });
				fs.cpSync(path.resolve("node_modules/keytar/lib"), path.join(pluginRoot, "node_modules/keytar/lib"), { recursive: true, force: true });
				fs.cpSync(path.resolve("node_modules/keytar/build"), path.join(pluginRoot, "node_modules/keytar/build"), { recursive: true, force: true });
				fs.copyFileSync(path.resolve("node_modules/keytar/package.json"), path.join(pluginRoot, "node_modules/keytar/package.json"));
			}
		}
	]
};

export default config;

import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import resolve from "vite-plugin-resolve";

const aztecVersion = "0.65.2";

export default defineConfig({
	plugins: [
		process.env.NODE_ENV === "production"
			? /** @type {any} */ resolve({
					"@aztec/bb.js": `export * from "https://unpkg.com/@aztec/bb.js@${aztecVersion}/dest/browser/index.js"`,
			  })
			: undefined,
		nodePolyfills({ protocolImports: true }),
	].filter(Boolean),
	resolve: {
		alias: {
			"fs/promises": "node:fs/promises",
			fs: "node:fs",
			path: "node:path",
		},
	},
	build: {
		target: "esnext",
		sourcemap: true,
		minify: false,
	},
	base: "/",
	optimizeDeps: {
		include: ["@aztec/bb.js"],
		esbuildOptions: {
			target: "esnext",
			sourcemap: true,
			minify: false,
		},
	},
	server: {
		/// host: "myapp.local", // or use 'localhost' for local development
		port: 3000, // specify the port you want to use
	},
});

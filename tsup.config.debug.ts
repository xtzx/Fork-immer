import {defineConfig} from "tsup"

export default defineConfig({
	entry: {
		"immer.debug": "src/immer.ts"
	},
	format: "esm",
	target: "esnext",
	outDir: "./dist-debug",
	sourcemap: true,
	minify: false,
	clean: true,
	dts: false,
	splitting: false,
	treeshake: false,
	// 禁用所有可能的代码转换
	esbuildOptions(options) {
		options.minify = false
		options.keepNames = true
		options.mangleProps = undefined
		options.drop = []
		options.target = "esnext"
		options.treeShaking = false
		options.ignoreAnnotations = true
		// 尝试禁用更多转换
		options.legalComments = "inline"
		options.charset = "utf8"
	}
})

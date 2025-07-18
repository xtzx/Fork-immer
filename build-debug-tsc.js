const {execSync} = require("child_process")
const fs = require("fs")
const path = require("path")

// 清理输出目录
const outDir = "./dist-debug"
if (fs.existsSync(outDir)) {
	fs.rmSync(outDir, {recursive: true, force: true})
}
fs.mkdirSync(outDir, {recursive: true})

console.log("使用TypeScript编译器编译debug版本...")

try {
	// 使用正确的TypeScript编译器路径
	execSync("./node_modules/typescript/bin/tsc --project tsconfig.debug.json", {
		stdio: "inherit",
		cwd: process.cwd()
	})

	console.log("编译完成！")
	console.log(`输出目录: ${outDir}`)
} catch (error) {
	console.error("编译失败:", error.message)
	process.exit(1)
}

#!/usr/bin/env node

/**
 * immer 本地开发演示环境
 * 使用方法：node dev-playground.js
 * 或者：yarn dev (添加到 package.json scripts 中)
 *
 * 🐛 调试指南：
 * 1. 在 VS Code 中打开调试面板 (Ctrl+Shift+D)
 * 2. 选择 "调试 dev-playground" 或 "调试 immer 源码"
 * 3. 在源码文件中设置断点（如 src/core/immerClass.ts 的 produce 方法）
 * 4. 启动调试，程序会在断点处暂停
 */

// 导入源码版本进行开发测试
// 使用 ts-node 直接运行 TypeScript 源码
// 注意：这里不需要手动require ts-node/register，因为我们在命令行中使用ts-node运行

// 直接导入 TypeScript 源码
const {produce, enablePatches, enableMapSet} = require("./src/immer.ts")

// 启用功能
enablePatches()
enableMapSet()

console.log("🚀 immer 开发环境启动!")
console.log("📝 修改此文件来测试新功能，使用 nodemon 可实现自动重载")
console.log("🐛 在 VS Code 中使用调试配置来调试源码\n")

// ============= 调试专用简单测试 =============

console.log("🔍 调试用简单测试:")
const debugState = {
	count: 0,
	user: {name: "Debug", age: 25}
}

// 在这里设置断点容易进入 produce 函数调试
const debugResult = produce(debugState, draft => {
	console.log("📍 进入 producer 函数")
	draft.count = 1 // 在此行设置断点，观察 draft 对象结构
	draft.user.name = "Debugged" // 观察嵌套对象的代理行为
	console.log("📍 修改完成")
})

console.log("调试结果:", debugResult)
console.log()

// ============= 开发测试区域 =============

// 1. 基础功能测试
console.log("1️⃣ 基础 produce 功能:")
const baseState = {
	user: {name: "John", age: 30},
	todos: [
		{id: 1, text: "学习 immer", done: false},
		{id: 2, text: "理解源码", done: true}
	]
}

const newState = produce(baseState, draft => {
	draft.user.age = 31
	draft.todos.push({id: 3, text: "开发新功能", done: false})
})

console.log("原始状态:", JSON.stringify(baseState, null, 2))
console.log("新状态:", JSON.stringify(newState, null, 2))
console.log("是否是新对象:", baseState !== newState)
console.log("用户对象是否变更:", baseState.user !== newState.user)
console.log()

// 2. 补丁功能测试
console.log("2️⃣ 补丁 (Patches) 功能:")
const {produceWithPatches} = require("./src/immer.ts")

const [result, patches, inversePatches] = produceWithPatches(
	baseState,
	draft => {
		draft.user.name = "Jane"
		draft.todos[0].done = true
	}
)

console.log("应用的补丁:", JSON.stringify(patches, null, 2))
console.log("逆向补丁:", JSON.stringify(inversePatches, null, 2))
console.log()

// 3. Map/Set 功能测试
console.log("3️⃣ Map/Set 功能:")
const mapState = new Map([
	["user", {name: "Bob", preferences: new Set(["dark-mode", "notifications"])}]
])

const newMapState = produce(mapState, draft => {
	const user = draft.get("user")
	user.name = "Alice"
	user.preferences.add("email-updates")
})

console.log("原始 Map:", mapState)
console.log("新 Map:", newMapState)
console.log("Set 内容:", Array.from(newMapState.get("user").preferences))
console.log()

// 4. 性能测试
console.log("4️⃣ 性能测试:")
const largeState = {
	items: Array.from({length: 10000}, (_, i) => ({
		id: i,
		value: Math.random(),
		nested: {deep: {value: i}}
	}))
}

console.time("大数据结构处理")
const updatedLargeState = produce(largeState, draft => {
	// 只修改一个元素
	draft.items[5000].value = 999
	draft.items[5000].nested.deep.value = "updated"
})
console.timeEnd("大数据结构处理")

console.log("结构共享验证:")
console.log(
	"第1个元素是否共享:",
	largeState.items[0] === updatedLargeState.items[0]
)
console.log(
	"第5000个元素是否新建:",
	largeState.items[5000] !== updatedLargeState.items[5000]
)
console.log()

// 5. 边界情况测试
console.log("5️⃣ 边界情况测试:")

try {
	// 测试冻结对象
	const frozenState = Object.freeze({count: 0})
	const unfrozenResult = produce(frozenState, draft => {
		draft.count = 1
	})
	console.log("冻结对象处理成功:", unfrozenResult)
} catch (error) {
	console.log("冻结对象处理失败:", error.message)
}

try {
	// 测试循环引用
	const circularState = {name: "test"}
	circularState.self = circularState

	const circularResult = produce(circularState, draft => {
		draft.name = "updated"
	})
	console.log("循环引用处理成功:", circularResult.name)
} catch (error) {
	console.log("循环引用处理失败:", error.message)
}

console.log("\n✅ 开发环境测试完成!")
console.log("💡 修改源码后重新运行此脚本查看效果")
console.log("�� 也可以在此文件中添加你的测试代码")

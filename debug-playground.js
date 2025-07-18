#!/usr/bin/env node

/**
 * immer 源码调试专用环境
 *
 * 这个文件专门用于调试immer的TypeScript源码，不依赖构建过程。
 * 使用方法：
 * 1. ts-node debug-playground.js
 * 2. 在VS Code中使用调试配置
 */

// 注意：这个文件需要通过 ts-node 命令行运行，不需要手动require ts-node
// 例如：ts-node debug-playground.js

// 导入immer源码
import * as immer from "./src/immer.ts"

console.log("🚀 immer 源码调试环境启动!")
console.log("📝 可以直接调试 TypeScript 源码文件")
console.log("🐛 在 VS Code 中设置断点开始调试\n")

// ============= 调试专用测试 =============

console.log("🔍 源码调试测试:")

// 测试基础功能
const baseState = {
	count: 0,
	user: {name: "Debug", age: 25},
	todos: [{id: 1, text: "学习 immer 源码", done: false}]
}

console.log("原始状态:", JSON.stringify(baseState, null, 2))

// 在这里设置断点，观察 produce 函数的执行
const result = immer.produce(baseState, draft => {
	console.log("📍 进入 producer 函数")
	console.log("📍 draft 对象类型:", typeof draft)
	console.log("📍 draft 是否为代理:", draft[immer.DRAFT_STATE] !== undefined)

	// 观察属性修改
	draft.count = 1
	console.log("📍 修改 count 后:", draft.count)

	// 观察嵌套对象修改
	draft.user.name = "Debugged"
	console.log("📍 修改嵌套属性后:", draft.user.name)

	// 观察数组修改
	draft.todos.push({id: 2, text: "调试源码", done: true})
	console.log("📍 数组修改后长度:", draft.todos.length)

	console.log("📍 producer 函数执行完成")
})

console.log("最终结果:", JSON.stringify(result, null, 2))
console.log("对象相等性:", baseState === result)
console.log("用户对象相等性:", baseState.user === result.user)
console.log("todos数组相等性:", baseState.todos === result.todos)

// ============= 高级调试测试 =============

console.log("\n🔬 高级调试测试:")

// 测试作用域管理
console.log("测试嵌套 produce 调用:")
const nestedResult = immer.produce(baseState, draft1 => {
	console.log("📍 外层作用域")
	draft1.count = 100

	// 嵌套调用
	draft1.nested = immer.produce({value: 0}, draft2 => {
		console.log("📍 内层作用域")
		draft2.value = 999
		return draft2
	})
})

console.log("嵌套结果:", nestedResult)

// 测试错误处理
console.log("\n测试错误处理:")
try {
	const errorResult = immer.produce(baseState, draft => {
		draft.count = 999
		throw new Error("测试异常")
	})
} catch (error) {
	console.log("📍 捕获异常:", error.message)
}

// ============= 源码探索 =============

console.log("\n📚 源码结构探索:")

// 查看immer的内部结构
console.log("immer 导出内容:", Object.keys(immer))

// 查看Draft类型
console.log("Draft 类型定义:", typeof immer.Draft)

// 查看工具函数
console.log("isDraft 函数:", typeof immer.isDraft)
console.log("current 函数:", typeof immer.current)

console.log("\n✅ 源码调试环境准备完成!")
console.log("💡 现在可以在 VS Code 中设置断点进行调试")
console.log("🎯 推荐断点位置:")
console.log("   - src/core/immerClass.ts 的 produce 方法")
console.log("   - src/core/proxy.ts 的 objectTraps.set 方法")
console.log("   - src/core/scope.ts 的 enterScope 方法")
console.log("   - src/core/finalize.ts 的 processResult 方法")

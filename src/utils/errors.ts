/**
 * errors.ts - Immer错误处理系统
 *
 * 这个模块实现了immer的统一错误处理机制，具有以下特点：
 *
 * 核心设计理念：
 * - 开发友好：开发环境提供详细错误信息
 * - 生产优化：生产环境最小化代码体积
 * - 中心化管理：所有错误信息统一维护
 * - 类型安全：错误处理的类型化管理
 *
 * 优化策略：
 * - 条件编译：基于NODE_ENV的代码分支
 * - 体积优化：生产环境只保留错误代码
 * - 延迟求值：错误消息的懒加载生成
 * - 在线文档：生产环境提供在线错误说明链接
 */

/**
 * 错误信息数组
 *
 * 这个数组包含了immer所有可能的错误信息。使用数组而不是
 * 对象的好处是可以通过数字索引快速访问，同时支持条件编译。
 *
 * 组织结构：
 * - 错误按功能模块分组
 * - 每个错误有唯一的数字ID
 * - 支持参数化的错误消息
 * - 函数形式的错误支持动态参数
 *
 * 编译优化：
 * - 开发环境：完整的错误信息和调用栈
 * - 生产环境：空数组，减少打包体积
 * - Tree-shaking：未使用的错误信息会被移除
 */
export const errors =
	process.env.NODE_ENV !== "production"
		? [
				// 所有错误代码，从0开始编号：

				/**
				 * 错误0：插件未加载
				 * 当尝试使用未启用的插件功能时抛出
				 *
				 * 触发场景：
				 * - 使用Map/Set但未调用enableMapSet()
				 * - 使用补丁功能但未调用enablePatches()
				 *
				 * 解决方案：在应用初始化时调用相应的enable函数
				 */
				function(plugin: string) {
					return `The plugin for '${plugin}' has not been loaded into Immer. To enable the plugin, import and call \`enable${plugin}()\` when initializing your application.`
				},

				/**
				 * 错误1：非草稿化对象
				 * 当produce接收到无法草稿化的对象时抛出
				 *
				 * 可草稿化的类型：
				 * - 普通对象（plain objects）
				 * - 数组（arrays）
				 * - Map和Set（需要启用插件）
				 * - 标记了[immerable]: true的类实例
				 *
				 * 不可草稿化的类型：
				 * - 基本类型（string, number, boolean等）
				 * - null和undefined
				 * - 函数
				 * - Date、RegExp等内置对象（除非特别处理）
				 * - 未标记的类实例
				 */
				function(thing: string) {
					return `produce can only be called on things that are draftable: plain objects, arrays, Map, Set or classes that are marked with '[immerable]: true'. Got '${thing}'`
				},

				/**
				 * 错误2：修改冻结对象
				 * 当尝试修改已冻结的对象时抛出
				 *
				 * 触发场景：
				 * - 在produce外部修改immer生成的对象
				 * - 修改手动冻结的对象
				 * - 尝试修改已完成的草稿
				 *
				 * 预防措施：
				 * - 只在producer函数内修改状态
				 * - 使用current()获取可检查的快照
				 * - 确保草稿生命周期的正确管理
				 */
				"This object has been frozen and should not be mutated",

				/**
				 * 错误3：使用已撤销的代理
				 * 当使用已撤销的Proxy对象时抛出
				 *
				 * 撤销场景：
				 * - producer函数执行完成后
				 * - 发生错误导致作用域清理
				 * - 手动调用finishDraft后
				 *
				 * 常见原因：
				 * - 将草稿对象传递给异步函数
				 * - 在producer外部保存草稿引用
				 * - 错误的生命周期管理
				 *
				 * 解决方案：
				 * - 在producer内完成所有同步操作
				 * - 使用current()获取持久化快照
				 * - 正确管理createDraft/finishDraft的生命周期
				 */
				function(data: any) {
					return (
						"Cannot use a proxy that has been revoked. Did you pass an object from inside an immer function to an async process? " +
						data
					)
				},

				/**
				 * 错误4：混合修改模式
				 * 当producer既修改草稿又返回新值时抛出
				 *
				 * Immer支持两种模式，但不能混用：
				 *
				 * 1. 修改模式（推荐）：
				 *    produce(state, draft => {
				 *      draft.value = newValue  // 修改草稿
				 *      // 不返回任何值，或返回undefined
				 *    })
				 *
				 * 2. 替换模式：
				 *    produce(state, draft => {
				 *      return newCompleteState  // 返回全新状态
				 *      // 不能修改draft
				 *    })
				 *
				 * 错误示例：
				 *    produce(state, draft => {
				 *      draft.value = newValue  // 修改了草稿
				 *      return newState         // 又返回了新值 - 错误！
				 *    })
				 */
				"An immer producer returned a new value *and* modified its draft. Either return a new value *or* modify the draft.",

				/**
				 * 错误5：循环引用
				 * 当检测到对象循环引用时抛出
				 *
				 * 循环引用场景：
				 * - 对象直接引用自己
				 * - 对象间的相互引用
				 * - 深层嵌套的循环结构
				 *
				 * Immer限制：
				 * - 无法安全处理循环引用的草稿化
				 * - 避免无限递归和内存泄漏
				 * - 确保最终化过程的确定性
				 *
				 * 解决方案：
				 * - 重新设计数据结构避免循环引用
				 * - 使用ID引用代替直接对象引用
				 * - 扁平化嵌套结构
				 */
				"Immer forbids circular references",

				/**
				 * 错误6：无效的producer参数
				 * 当produce的第一或第二个参数不是函数时抛出
				 *
				 * 有效调用形式：
				 * - produce(state, producer)
				 * - produce(producer) // 柯里化形式
				 *
				 * 无效示例：
				 * - produce(state, "not a function")
				 * - produce(123, producer)
				 */
				"The first or second argument to `produce` must be a function",

				/**
				 * 错误7：无效的补丁监听器
				 * 当produce的第三个参数不是函数或undefined时抛出
				 */
				"The third argument to `produce` must be a function or undefined",

				/**
				 * 错误8：无效的createDraft参数
				 * 当createDraft接收到无法草稿化的对象时抛出
				 *
				 * 参见错误1的说明，createDraft的要求与produce相同
				 */
				"First argument to `createDraft` must be a plain object, an array, or an immerable object",

				/**
				 * 错误9：无效的finishDraft参数
				 * 当finishDraft接收到非草稿对象时抛出
				 *
				 * 确保传入的是由createDraft创建的草稿对象
				 */
				"First argument to `finishDraft` must be a draft returned by `createDraft`",

				/**
				 * 错误10：current函数参数错误
				 * 当current函数接收到非草稿对象时抛出
				 *
				 * current函数只能用于草稿对象，用于获取当前状态快照
				 */
				function(thing: string) {
					return `'current' expects a draft, got: ${thing}`
				},

				/**
				 * 错误11：禁止defineProperty
				 * 当尝试在草稿对象上使用Object.defineProperty时抛出
				 *
				 * 限制原因：
				 * - defineProperty的语义复杂，难以正确处理
				 * - 可能破坏草稿对象的内部状态
				 * - 与Proxy的交互可能产生意外行为
				 *
				 * 替代方案：
				 * - 使用直接赋值：draft.prop = value
				 * - 在原始对象上预定义属性
				 */
				"Object.defineProperty() cannot be used on an Immer draft",

				/**
				 * 错误12：禁止setPrototypeOf
				 * 当尝试在草稿对象上修改原型时抛出
				 *
				 * 限制原因：
				 * - 原型修改会影响对象的基本行为
				 * - 可能破坏草稿系统的假设
				 * - 性能和安全考虑
				 *
				 * 替代方案：
				 * - 在创建对象时设置正确的原型
				 * - 使用Object.create指定原型
				 */
				"Object.setPrototypeOf() cannot be used on an Immer draft",

				/**
				 * 错误13：数组索引删除限制
				 * 当尝试删除非数字索引的数组属性时抛出
				 *
				 * 限制原因：
				 * - 数组应该只通过数字索引操作
				 * - 保持数组语义的一致性
				 * - 避免将数组当作对象使用
				 *
				 * 正确做法：
				 * - 使用splice删除元素
				 * - 设置为undefined而不是删除
				 */
				"Immer only supports deleting array indices",

				/**
				 * 错误14：数组属性设置限制
				 * 当尝试设置非数字索引或length的数组属性时抛出
				 *
				 * 允许的数组操作：
				 * - 设置数字索引：arr[0] = value
				 * - 修改长度：arr.length = newLength
				 *
				 * 不允许的操作：
				 * - 设置字符串属性：arr.customProp = value
				 * - 添加方法：arr.customMethod = function() {}
				 */
				"Immer only supports setting array indices and the 'length' property",

				/**
				 * 错误15：original函数参数错误
				 * 当original函数接收到非草稿对象时抛出
				 *
				 * original函数用于获取草稿对应的原始对象
				 */
				function(thing: string) {
					return `'original' expects a draft, got: ${thing}`
				}

				// 注意：如果添加更多错误，需要增加Patches.ts中的errorOffset
				// 参见Patches.ts了解额外的错误信息
		  ]
		: [] // 生产环境：空数组，减少打包体积

/**
 * die - 统一的错误抛出函数
 *
 * 这是immer内部统一的错误处理入口，根据环境提供不同的错误信息：
 *
 * 开发环境行为：
 * - 获取详细的错误信息
 * - 支持参数化的错误消息
 * - 提供完整的调用栈信息
 * - 帮助开发者快速定位问题
 *
 * 生产环境行为：
 * - 只提供错误代码和在线文档链接
 * - 最小化代码体积
 * - 减少字符串常量占用
 * - 保持基本的错误处理能力
 *
 * 错误信息处理：
 * - 字符串：直接使用
 * - 函数：调用并传入参数，支持动态错误信息
 * - 支持多参数的复杂错误消息构建
 *
 * @param error - 错误代码（对应errors数组的索引）
 * @param args - 传递给错误信息函数的参数
 * @throws {Error} 永远抛出错误，函数不会正常返回
 * @returns {never} TypeScript类型标记，表示函数不会返回
 *
 * 使用示例：
 * - die(0, "Patches") // 插件未加载错误
 * - die(1, "string") // 非草稿化对象错误
 * - die(2) // 简单的字符串错误
 *
 * 设计优势：
 * - 中心化：所有错误都通过此函数抛出
 * - 一致性：统一的错误格式和前缀
 * - 可配置：基于环境的不同行为
 * - 可扩展：容易添加新的错误类型
 * - 类型安全：never返回类型确保正确的控制流
 */
export function die(error: number, ...args: any[]): never {
	if (process.env.NODE_ENV !== "production") {
		// 开发环境：提供详细的错误信息
		const e = errors[error]
		// 处理函数式错误信息
		const msg = typeof e === "function" ? e.apply(null, args as any) : e
		throw new Error(`[Immer] ${msg}`)
	}
	// 生产环境：最小化错误信息，提供在线文档链接
	throw new Error(
		`[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`
	)
}

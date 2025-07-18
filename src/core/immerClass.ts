// 导入所有必需的类型定义和工具函数
// 这些导入展现了 immer 的模块化设计，每个模块负责特定功能
import {
	IProduceWithPatches, // 带补丁的 produce 接口类型
	IProduce, // 标准 produce 接口类型
	ImmerState, // 草稿对象的内部状态结构
	Drafted, // 已代理的草稿对象类型
	isDraftable, // 判断对象是否可被代理
	processResult, // 处理 recipe 函数的返回结果
	Patch, // 补丁对象类型
	Objectish, // 类对象类型（对象、数组、Map、Set）
	DRAFT_STATE, // 草稿状态的 Symbol 键
	Draft, // 草稿类型定义
	PatchListener, // 补丁监听器类型
	isDraft, // 判断是否为草稿对象
	isMap, // 判断是否为 Map 类型
	isSet, // 判断是否为 Set 类型
	createProxyProxy, // 创建普通对象/数组的代理
	getPlugin, // 获取插件实现
	die, // 错误处理函数
	enterScope, // 进入新的执行作用域
	revokeScope, // 撤销作用域（错误时）
	leaveScope, // 正常离开作用域
	usePatchesInScope, // 在作用域中使用补丁功能
	getCurrentScope, // 获取当前执行作用域
	NOTHING, // 表示删除操作的特殊符号
	freeze, // 冻结对象函数
	current // 获取草稿当前状态快照
} from "../internal"

/**
 * 生产者函数接口
 * 定义了 Immer 类必须实现的核心方法
 */
interface ProducersFns {
	produce: IProduce // 标准的 produce 方法
	produceWithPatches: IProduceWithPatches // 带补丁信息的 produce 方法
}

/**
 * 严格模式类型定义
 * - true: 对所有对象启用严格浅拷贝
 * - false: 使用默认拷贝策略
 * - "class_only": 仅对类实例启用严格拷贝
 */
export type StrictMode = boolean | "class_only"

/**
 * Immer 核心类 - 不可变数据处理的协调中心
 *
 * 职责：
 * 1. 管理全局配置（自动冻结、严格拷贝等）
 * 2. 协调作用域、代理、最终化等各个模块
 * 3. 提供所有对外 API 的具体实现
 * 4. 处理不同使用模式（标准调用、柯里化、手动草稿等）
 */
export class Immer implements ProducersFns {
	/**
	 * 自动冻结配置
	 * true: 自动冻结所有生成的不可变对象（默认）
	 * false: 不自动冻结，提升性能但降低安全性
	 */
	autoFreeze_: boolean = true

	/**
	 * 严格浅拷贝配置
	 * 控制是否拷贝对象的属性描述符（getter、setter、可枚举性等）
	 */
	useStrictShallowCopy_: StrictMode = false

	/**
	 * 构造函数 - 初始化 Immer 实例
	 * @param config 可选的配置对象
	 */
	constructor(config?: {
		autoFreeze?: boolean
		useStrictShallowCopy?: StrictMode
	}) {
		// 配置自动冻结选项
		if (typeof config?.autoFreeze === "boolean")
			this.setAutoFreeze(config!.autoFreeze)
		// 配置严格浅拷贝选项
		if (typeof config?.useStrictShallowCopy === "boolean")
			this.setUseStrictShallowCopy(config!.useStrictShallowCopy)
	}

	/**
	 * 🎯 核心方法：produce - 创建不可变副本
	 *
	 * 这是 immer 最重要的方法，实现了写时复制的核心逻辑
	 *
	 * 工作流程：
	 * 1. 处理柯里化调用模式
	 * 2. 验证参数合法性
	 * 3. 判断是否需要创建代理（isDraftable）
	 * 4. 创建执行作用域和代理对象
	 * 5. 执行用户的 recipe 函数
	 * 6. 处理异常和清理工作
	 * 7. 生成最终的不可变结果
	 *
	 * @param base 基础状态对象
	 * @param recipe 修改函数，接收草稿对象并进行修改
	 * @param patchListener 可选的补丁监听器
	 * @returns 新的不可变状态，如果没有修改则返回原对象
	 */
	produce: IProduce = (base: any, recipe?: any, patchListener?: any) => {
		// 🔄 处理柯里化调用：produce(recipe) 或 produce(recipe, defaultBase)
		if (typeof base === "function" && typeof recipe !== "function") {
			const defaultBase = recipe // 第二个参数作为默认基础状态
			recipe = base // 第一个参数作为 recipe 函数

			const self = this
			// 返回柯里化的生产者函数
			return function curriedProduce(
				this: any,
				base = defaultBase, // 使用默认基础状态
				...args: any[] // 额外参数传递给 recipe
			) {
				// 递归调用标准 produce，并正确绑定 this 上下文
				return self.produce(base, (draft: Drafted) =>
					recipe.call(this, draft, ...args)
				)
			}
		}

		// 📋 参数验证
		if (typeof recipe !== "function") die(6) // recipe 必须是函数
		if (patchListener !== undefined && typeof patchListener !== "function")
			die(7) // 补丁监听器必须是函数或 undefined

		let result

		// 🎯 核心逻辑分支：处理可代理对象
		if (isDraftable(base)) {
			// 1️⃣ 创建执行作用域 - 管理本次 produce 调用的生命周期
			const scope = enterScope(this)

			// 2️⃣ 创建代理对象 - 实现写时复制的关键
			const proxy = createProxy(base, undefined)

			// 3️⃣ 执行用户 recipe 函数，使用 try-finally 确保清理
			let hasError = true
			try {
				result = recipe(proxy) // 用户在代理上进行修改
				hasError = false
			} finally {
				// 📝 清理工作：无论成功失败都要清理作用域
				// finally 比 catch + rethrow 更好地保留原始堆栈信息
				if (hasError) revokeScope(scope)
				// 错误时撤销所有修改
				else leaveScope(scope) // 正常完成时离开作用域
			}

			// 4️⃣ 处理补丁功能（如果启用）
			usePatchesInScope(scope, patchListener)

			// 5️⃣ 生成最终结果 - 进行最终化处理
			return processResult(result, scope)
		} else if (!base || typeof base !== "object") {
			// 🔄 处理原始值或不可代理对象
			// 直接调用 recipe，不创建代理
			result = recipe(base)

			// 处理特殊返回值
			if (result === undefined) result = base // undefined -> 保持原值
			if (result === NOTHING) result = undefined // NOTHING -> 转为 undefined

			// 自动冻结（如果启用）
			if (this.autoFreeze_) freeze(result, true)

			// 生成替换补丁（整个对象被替换）
			if (patchListener) {
				const p: Patch[] = [] // 正向补丁
				const ip: Patch[] = [] // 逆向补丁
				getPlugin("Patches").generateReplacementPatches_(base, result, p, ip)
				patchListener(p, ip)
			}
			return result
		} else {
			// ❌ 无效的 base 参数
			die(1, base)
		}
	}

	/**
	 * 🎯 带补丁的 produce 方法
	 *
	 * 与 produce 相似，但总是返回元组 [nextState, patches, inversePatches]
	 *
	 * @param base 基础状态
	 * @param recipe 修改函数
	 * @returns [新状态, 正向补丁数组, 逆向补丁数组]
	 */
	produceWithPatches: IProduceWithPatches = (base: any, recipe?: any): any => {
		// 🔄 处理柯里化调用
		if (typeof base === "function") {
			return (state: any, ...args: any[]) =>
				this.produceWithPatches(state, (draft: any) => base(draft, ...args))
		}

		// 📦 使用内部变量收集补丁信息
		let patches: Patch[], inversePatches: Patch[]
		const result = this.produce(base, recipe, (p: Patch[], ip: Patch[]) => {
			patches = p // 正向补丁：如何从 base 到 result
			inversePatches = ip // 逆向补丁：如何从 result 回到 base
		})

		// 📤 返回完整的补丁信息
		return [result, patches!, inversePatches!]
	}

	/**
	 * 🔧 手动创建草稿对象
	 *
	 * 用于需要多步修改的复杂场景：
	 * 1. 创建草稿但不立即完成
	 * 2. 在多个函数间传递草稿
	 * 3. 精确控制修改时机
	 *
	 * @param base 基础对象
	 * @returns 草稿对象，可以直接修改
	 */
	createDraft<T extends Objectish>(base: T): Draft<T> {
		// 📋 验证：只有可代理对象才能创建草稿
		if (!isDraftable(base)) die(8)

		// 🔄 如果已经是草稿，先获取当前状态
		if (isDraft(base)) base = current(base)

		// 🎯 创建手动管理的草稿
		const scope = enterScope(this)
		const proxy = createProxy(base, undefined)

		// 🏷️ 标记为手动模式：不会自动完成
		proxy[DRAFT_STATE].isManual_ = true

		// 📤 立即离开作用域，但保持草稿有效
		leaveScope(scope)
		return proxy as any
	}

	/**
	 * 🎯 完成手动创建的草稿
	 *
	 * 将手动草稿转换为最终的不可变对象
	 *
	 * @param draft 通过 createDraft 创建的草稿
	 * @param patchListener 可选的补丁监听器
	 * @returns 最终的不可变对象
	 */
	finishDraft<D extends Draft<any>>(
		draft: D,
		patchListener?: PatchListener
	): D extends Draft<infer T> ? T : never {
		// 📋 获取草稿的内部状态
		const state: ImmerState = draft && (draft as any)[DRAFT_STATE]

		// 🔍 验证：必须是手动创建的草稿
		if (!state || !state.isManual_) die(9)

		// 🎯 完成最终化处理
		const {scope_: scope} = state
		usePatchesInScope(scope, patchListener) // 处理补丁
		return processResult(undefined, scope) // undefined 表示使用草稿本身
	}

	/**
	 * ⚙️ 设置自动冻结配置
	 *
	 * 自动冻结的作用：
	 * - 防止意外修改不可变对象
	 * - 提供更强的不可变保证
	 * - 在开发时帮助发现错误使用
	 *
	 * 性能考虑：
	 * - 冻结操作有性能开销
	 * - 生产环境可以考虑关闭以提升性能
	 *
	 * @param value true=启用自动冻结，false=禁用
	 */
	setAutoFreeze(value: boolean) {
		this.autoFreeze_ = value
	}

	/**
	 * ⚙️ 设置严格浅拷贝模式
	 *
	 * 严格浅拷贝会保留：
	 * - 属性描述符（writable、enumerable、configurable）
	 * - getter 和 setter
	 * - 原型链信息
	 *
	 * 适用场景：
	 * - 处理复杂的类实例
	 * - 需要保留完整对象语义
	 * - 与现有代码库的兼容性要求
	 *
	 * @param value 严格模式配置
	 */
	setUseStrictShallowCopy(value: StrictMode) {
		this.useStrictShallowCopy_ = value
	}

	/**
	 * 🔄 应用补丁到对象
	 *
	 * 这个方法实现了补丁的"重放"功能：
	 * 1. 优化：如果有完整替换补丁，直接使用替换值作为基础
	 * 2. 对于草稿对象，直接应用补丁
	 * 3. 对于普通对象，先创建草稿再应用补丁
	 *
	 * @param base 基础对象
	 * @param patches 要应用的补丁数组
	 * @returns 应用补丁后的新对象
	 */
	applyPatches<T extends Objectish>(base: T, patches: readonly Patch[]): T {
		// 🎯 优化：查找完整替换补丁
		// 如果存在路径为空且操作为 replace 的补丁，说明整个对象被替换
		let i: number
		for (i = patches.length - 1; i >= 0; i--) {
			const patch = patches[i]
			if (patch.path.length === 0 && patch.op === "replace") {
				base = patch.value // 使用替换值作为新的基础
				break
			}
		}

		// 📝 跳过已处理的完整替换补丁
		if (i > -1) {
			patches = patches.slice(i + 1)
		}

		// 🔧 获取补丁应用的具体实现（来自插件）
		const applyPatchesImpl = getPlugin("Patches").applyPatches_

		if (isDraft(base)) {
			// 🎯 对草稿对象直接应用补丁
			// 注意：如果有替换补丁，补丁永远不会是草稿
			return applyPatchesImpl(base, patches)
		}

		// 🔄 对普通对象：创建草稿后再应用补丁
		return this.produce(base, (draft: Drafted) =>
			applyPatchesImpl(draft, patches)
		)
	}
}

/**
 * 🏭 代理工厂函数 - 创建不同类型的代理对象
 *
 * 这个函数是代理创建的统一入口，根据对象类型选择合适的代理策略：
 * - Map -> MapSet 插件的 proxyMap_
 * - Set -> MapSet 插件的 proxySet_
 * - 普通对象/数组 -> createProxyProxy
 *
 * 设计优势：
 * 1. 统一的代理创建接口
 * 2. 插件化的类型处理
 * 3. 自动的作用域管理
 *
 * @param value 要代理的原始对象
 * @param parent 父级 ImmerState（用于嵌套对象）
 * @returns 创建的草稿代理对象
 */
export function createProxy<T extends Objectish>(
	value: T,
	parent?: ImmerState
): Drafted<T, ImmerState> {
	// 🎯 根据对象类型选择代理策略
	// 前提：createProxy 应该被 isDraftable 保护，确保对象可以安全代理
	const draft: Drafted = isMap(value)
		? getPlugin("MapSet").proxyMap_(value, parent) // Map 类型的特殊代理
		: isSet(value)
		? getPlugin("MapSet").proxySet_(value, parent) // Set 类型的特殊代理
		: createProxyProxy(value, parent) // 普通对象/数组的代理

	// 📋 作用域管理：将新创建的草稿注册到当前作用域
	const scope = parent ? parent.scope_ : getCurrentScope()
	scope.drafts_.push(draft) // 用于最终化时的清理和处理

	return draft
}

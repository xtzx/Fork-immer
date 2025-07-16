/**
 * patches.ts - 补丁系统插件
 *
 * 这个插件实现了immer的补丁系统，提供状态变更的跟踪、记录和应用功能。
 * 补丁系统遵循JSON Patch规范（RFC 6902），支持三种操作：add、remove、replace。
 *
 * 核心功能：
 * - 生成正向补丁：描述如何从旧状态到新状态
 * - 生成逆向补丁：描述如何从新状态回到旧状态
 * - 应用补丁：将补丁应用到指定对象上
 * - 深度克隆：确保补丁中的值不会意外修改
 *
 * 应用场景：
 * - 状态同步：客户端间的状态同步
 * - 撤销重做：基于补丁的历史管理
 * - 调试工具：可视化状态变更
 * - 持久化：只保存变更而不是完整状态
 * - 协同编辑：冲突检测和解决
 *
 * 设计挑战：
 * - 不同数据结构：Object、Array、Map、Set的不同处理
 * - 路径计算：准确定位嵌套属性的变更
 * - 值克隆：避免补丁值的意外修改
 * - 安全性：防止原型污染攻击
 */

import {immerable} from "../immer"
import {
	ImmerState,
	Patch,
	SetState,
	ProxyArrayState,
	MapState,
	ProxyObjectState,
	PatchPath,
	get,
	each,
	has,
	getArchtype,
	getPrototypeOf,
	isSet,
	isMap,
	loadPlugin,
	ArchType,
	die,
	isDraft,
	isDraftable,
	NOTHING,
	errors
} from "../internal"

/**
 * enablePatches - 启用补丁系统
 *
 * 这是补丁插件的入口函数，定义了所有补丁相关的功能
 * 并将它们注册到插件系统中。
 */
export function enablePatches() {
	/**
	 * 错误偏移量
	 *
	 * 补丁系统有自己的错误代码，从16开始编号
	 * 以避免与核心错误代码冲突
	 */
	const errorOffset = 16

	// 添加补丁系统特有的错误信息
	if (process.env.NODE_ENV !== "production") {
		errors.push(
			'Sets cannot have "replace" patches.',     // 错误16：Set不能有replace补丁
			function(op: string) {                      // 错误17：不支持的补丁操作
				return "Unsupported patch operation: " + op
			},
			function(path: string) {                    // 错误18：补丁路径无法解析
				return "Cannot apply patch, path doesn't resolve: " + path
			},
			// 错误19：禁止修改保留属性
			"Patching reserved attributes like __proto__, prototype and constructor is not allowed"
		)
	}

	// 补丁操作类型常量
	const REPLACE = "replace"  // 替换操作
	const ADD = "add"         // 添加操作
	const REMOVE = "remove"   // 删除操作

	/**
	 * generatePatches_ - 生成标准补丁
	 *
	 * 根据草稿状态的类型选择相应的补丁生成策略。
	 * 不同的数据结构需要不同的处理逻辑。
	 *
	 * @param state - 草稿状态对象
	 * @param basePath - 当前对象的路径
	 * @param patches - 正向补丁数组
	 * @param inversePatches - 逆向补丁数组
	 */
	function generatePatches_(
		state: ImmerState,
		basePath: PatchPath,
		patches: Patch[],
		inversePatches: Patch[]
	): void {
		// 根据数据结构类型分发处理
		switch (state.type_) {
			case ArchType.Object:
			case ArchType.Map:
				// 对象和Map使用相同的处理逻辑（基于assigned_）
				return generatePatchesFromAssigned(
					state,
					basePath,
					patches,
					inversePatches
				)
			case ArchType.Array:
				// 数组有特殊的处理逻辑
				return generateArrayPatches(state, basePath, patches, inversePatches)
			case ArchType.Set:
				// Set需要特殊处理
				return generateSetPatches(
					(state as any) as SetState,
					basePath,
					patches,
					inversePatches
				)
		}
	}

	/**
	 * generateArrayPatches - 生成数组补丁
	 *
	 * 数组补丁生成有特殊的复杂性：
	 * - 索引变化：元素的添加和删除会影响后续元素的索引
	 * - 长度变化：数组长度的变化需要特殊处理
	 * - 效率优化：通过base/copy交换简化处理逻辑
	 *
	 * @param state - 数组草稿状态
	 * @param basePath - 当前路径
	 * @param patches - 正向补丁数组
	 * @param inversePatches - 逆向补丁数组
	 */
	function generateArrayPatches(
		state: ProxyArrayState,
		basePath: PatchPath,
		patches: Patch[],
		inversePatches: Patch[]
	) {
		let {base_, assigned_} = state
		let copy_ = state.copy_!

		// 性能优化：确保base永远不会比copy长
		// 通过交换base和copy简化后续的处理逻辑
		if (copy_.length < base_.length) {
			// @ts-ignore
			;[base_, copy_] = [copy_, base_]
			// 同时交换补丁数组，保持逻辑一致性
			;[patches, inversePatches] = [inversePatches, patches]
		}

		// 处理被替换的索引
		for (let i = 0; i < base_.length; i++) {
			if (assigned_[i] && copy_[i] !== base_[i]) {
				const path = basePath.concat([i])
				patches.push({
					op: REPLACE,
					path,
					// 需要克隆值，因为由于上面的base/copy交换，
					// 这实际上可能是原始值
					value: clonePatchValueIfNeeded(copy_[i])
				})
				inversePatches.push({
					op: REPLACE,
					path,
					value: clonePatchValueIfNeeded(base_[i])
				})
			}
		}

		// 处理添加的索引（新增元素）
		for (let i = base_.length; i < copy_.length; i++) {
			const path = basePath.concat([i])
			patches.push({
				op: ADD,
				path,
				// 需要克隆值，原因同上
				value: clonePatchValueIfNeeded(copy_[i])
			})
		}

		// 处理删除的索引（移除元素）
		// 注意：删除补丁需要从后往前生成，以保证索引的正确性
		for (let i = copy_.length - 1; base_.length <= i; --i) {
			const path = basePath.concat([i])
			inversePatches.push({
				op: REMOVE,
				path
			})
		}
	}

	/**
	 * generatePatchesFromAssigned - 基于分配记录生成补丁
	 *
	 * 这个函数同时用于处理Map对象和普通对象，因为它们都使用
	 * assigned_字段来跟踪属性的修改状态。
	 *
	 * @param state - Map或Object的草稿状态
	 * @param basePath - 当前路径
	 * @param patches - 正向补丁数组
	 * @param inversePatches - 逆向补丁数组
	 */
	function generatePatchesFromAssigned(
		state: MapState | ProxyObjectState,
		basePath: PatchPath,
		patches: Patch[],
		inversePatches: Patch[]
	) {
		const {base_, copy_} = state

		// 遍历所有分配记录
		each(state.assigned_!, (key, assignedValue) => {
			const origValue = get(base_, key)
			const value = get(copy_!, key)

			// 根据分配状态确定操作类型
			const op = !assignedValue ? REMOVE : has(base_, key) ? REPLACE : ADD

			// 性能优化：如果值相同且是替换操作，跳过
			if (origValue === value && op === REPLACE) return

			const path = basePath.concat(key as any)

			// 生成正向补丁
			patches.push(op === REMOVE ? {op, path} : {op, path, value})

			// 生成逆向补丁
			inversePatches.push(
				op === ADD
					? {op: REMOVE, path}  // ADD的逆向是REMOVE
					: op === REMOVE
					? {op: ADD, path, value: clonePatchValueIfNeeded(origValue)} // REMOVE的逆向是ADD
					: {op: REPLACE, path, value: clonePatchValueIfNeeded(origValue)} // REPLACE的逆向是REPLACE
			)
		})
	}

	/**
	 * generateSetPatches - 生成Set补丁
	 *
	 * Set的补丁生成最为复杂，因为：
	 * - Set没有键的概念，只能基于插入顺序生成路径
	 * - 需要检测哪些值被添加、哪些值被删除
	 * - 插入顺序必须在补丁中保持
	 *
	 * @param state - Set草稿状态
	 * @param basePath - 当前路径
	 * @param patches - 正向补丁数组
	 * @param inversePatches - 逆向补丁数组
	 */
	function generateSetPatches(
		state: SetState,
		basePath: PatchPath,
		patches: Patch[],
		inversePatches: Patch[]
	) {
		let {base_, copy_} = state

		let i = 0
		// 检查删除的值
		base_.forEach((value: any) => {
			if (!copy_!.has(value)) {
				const path = basePath.concat([i])
				patches.push({
					op: REMOVE,
					path,
					value // Set的删除需要指定值
				})
				// 注意：使用unshift保持逆向补丁的正确顺序
				inversePatches.unshift({
					op: ADD,
					path,
					value
				})
			}
			i++
		})

		i = 0
		// 检查添加的值
		copy_!.forEach((value: any) => {
			if (!base_.has(value)) {
				const path = basePath.concat([i])
				patches.push({
					op: ADD,
					path,
					value
				})
				// 注意：使用unshift保持逆向补丁的正确顺序
				inversePatches.unshift({
					op: REMOVE,
					path,
					value
				})
			}
			i++
		})
	}

	/**
	 * generateReplacementPatches_ - 生成替换补丁
	 *
	 * 当producer函数返回全新对象时（替换模式），生成描述
	 * 整个对象被替换的补丁。这比详细的属性级补丁更简洁。
	 *
	 * @param baseValue - 原始值
	 * @param replacement - 替换值
	 * @param patches - 正向补丁数组
	 * @param inversePatches - 逆向补丁数组
	 */
	function generateReplacementPatches_(
		baseValue: any,
		replacement: any,
		patches: Patch[],
		inversePatches: Patch[]
	): void {
		// 正向补丁：将根路径替换为新值
		patches.push({
			op: REPLACE,
			path: [],
			value: replacement === NOTHING ? undefined : replacement
		})
		// 逆向补丁：将根路径替换为原始值
		inversePatches.push({
			op: REPLACE,
			path: [],
			value: baseValue
		})
	}

	/**
	 * applyPatches_ - 应用补丁
	 *
	 * 将补丁数组应用到目标对象上。这个函数需要处理各种复杂情况：
	 * - 路径解析：正确导航到目标位置
	 * - 类型检查：确保操作与目标类型兼容
	 * - 安全检查：防止原型污染攻击
	 * - 值克隆：避免补丁值的意外修改
	 *
	 * @param draft - 目标对象（会被修改）
	 * @param patches - 要应用的补丁数组
	 * @returns 修改后的对象
	 */
	function applyPatches_<T>(draft: T, patches: readonly Patch[]): T {
		patches.forEach(patch => {
			const {path, op} = patch

			let base: any = draft
			// 导航到补丁的目标位置（除了最后一级）
			for (let i = 0; i < path.length - 1; i++) {
				const parentType = getArchtype(base)
				let p = path[i]

				// 类型标准化：确保路径组件是字符串或数字
				if (typeof p !== "string" && typeof p !== "number") {
					p = "" + p
				}

				// 安全检查：防止原型污染攻击（参见#738）
				if (
					(parentType === ArchType.Object || parentType === ArchType.Array) &&
					(p === "__proto__" || p === "constructor")
				)
					die(errorOffset + 3)
				if (typeof base === "function" && p === "prototype")
					die(errorOffset + 3)

				// 继续导航
				base = get(base, p)
				if (typeof base !== "object") die(errorOffset + 2, path.join("/"))
			}

			// 获取目标类型和操作参数
			const type = getArchtype(base)
			const value = deepClonePatchValue(patch.value) // 克隆补丁值以确保原始补丁不被修改，参见#411
			const key = path[path.length - 1]

			// 根据操作类型执行相应的操作
			switch (op) {
				case REPLACE:
					switch (type) {
						case ArchType.Map:
							return base.set(key, value)
						/* istanbul ignore next */
						case ArchType.Set:
							// Set不能有replace操作
							die(errorOffset)
						default:
							// 普通对象和数组：直接赋值
							// 如果value是对象，则通过引用赋值
							// 在下面的add或remove操作中，补丁内的value字段也会被修改
							// 所以我们使用克隆补丁的值
							// @ts-ignore
							return (base[key] = value)
					}
				case ADD:
					switch (type) {
						case ArchType.Array:
							// 数组添加的特殊处理
							return key === "-"
								? base.push(value)  // "-"表示添加到末尾
								: base.splice(key as any, 0, value) // 在指定位置插入
						case ArchType.Map:
							return base.set(key, value)
						case ArchType.Set:
							return base.add(value)
						default:
							// 普通对象：设置属性
							return (base[key] = value)
					}
				case REMOVE:
					switch (type) {
						case ArchType.Array:
							// 数组删除：移除指定索引的元素
							return base.splice(key as any, 1)
						case ArchType.Map:
							return base.delete(key)
						case ArchType.Set:
							// Set删除：删除指定的值
							return base.delete(patch.value)
						default:
							// 普通对象：删除属性
							return delete base[key]
					}
				default:
					// 不支持的操作
					die(errorOffset + 1, op)
			}
		})

		return draft
	}

	/**
	 * deepClonePatchValue - 深度克隆补丁值
	 *
	 * 这是一个性能关键的函数，用于克隆补丁中的值以防止意外修改。
	 * 可以考虑智能检测何时需要克隆，例如当新对象来自外部被分配和修改时自动草稿化。
	 *
	 * @param obj - 要克隆的对象
	 * @returns 深度克隆的对象
	 */
	function deepClonePatchValue<T>(obj: T): T
	function deepClonePatchValue(obj: any) {
		// 快速路径：不可草稿化的值直接返回
		if (!isDraftable(obj)) return obj

		// 递归克隆不同类型的对象
		if (Array.isArray(obj)) return obj.map(deepClonePatchValue)
		if (isMap(obj))
			return new Map(
				Array.from(obj.entries()).map(([k, v]) => [k, deepClonePatchValue(v)])
			)
		if (isSet(obj)) return new Set(Array.from(obj).map(deepClonePatchValue))

		// 普通对象的克隆
		const cloned = Object.create(getPrototypeOf(obj))
		for (const key in obj) cloned[key] = deepClonePatchValue(obj[key])

		// 保持immerable标记
		if (has(obj, immerable)) cloned[immerable] = obj[immerable]
		return cloned
	}

	/**
	 * clonePatchValueIfNeeded - 按需克隆补丁值
	 *
	 * 只有当值是草稿时才进行深度克隆，普通值直接返回。
	 *
	 * @param obj - 可能需要克隆的值
	 * @returns 克隆的值或原值
	 */
	function clonePatchValueIfNeeded<T>(obj: T): T {
		if (isDraft(obj)) {
			return deepClonePatchValue(obj)
		} else return obj
	}

	// 注册补丁插件
	loadPlugin("Patches", {
		applyPatches_,
		generatePatches_,
		generateReplacementPatches_
	})
}

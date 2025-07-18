var __defProp = Object.defineProperty
var __name = (target, value) =>
	__defProp(target, "name", {value, configurable: true})

// src/utils/env.ts
var NOTHING = Symbol.for("immer-nothing")
var DRAFTABLE = Symbol.for("immer-draftable")
var DRAFT_STATE = Symbol.for("immer-state")

// src/utils/errors.ts
var errors =
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
				function(plugin) {
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
				function(thing) {
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
				function(data) {
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
				function(thing) {
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
				function(thing) {
					return `'original' expects a draft, got: ${thing}`
				}
				// 注意：如果添加更多错误，需要增加Patches.ts中的errorOffset
				// 参见Patches.ts了解额外的错误信息
		  ]
		: []
function die(error, ...args) {
	if (process.env.NODE_ENV !== "production") {
		const e = errors[error]
		const msg = typeof e === "function" ? e.apply(null, args) : e
		throw new Error(`[Immer] ${msg}`)
	}
	throw new Error(
		`[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`
	)
}
__name(die, "die")

// src/utils/common.ts
var getPrototypeOf = Object.getPrototypeOf
function isDraft(value) {
	return !!value && !!value[DRAFT_STATE]
}
__name(isDraft, "isDraft")
function isDraftable(value) {
	if (!value) return false
	return (
		isPlainObject(value) || // 普通对象
		Array.isArray(value) || // 数组
		!!value[DRAFTABLE] || // 实例上的可代理标记
		!!value.constructor?.[DRAFTABLE] || // 构造函数上的可代理标记
		isMap(value) || // Map（插件支持）
		isSet(value)
	)
}
__name(isDraftable, "isDraftable")
var objectCtorString = Object.prototype.constructor.toString()
function isPlainObject(value) {
	if (!value || typeof value !== "object") return false
	const proto = getPrototypeOf(value)
	if (proto === null) {
		return true
	}
	const Ctor =
		Object.hasOwnProperty.call(proto, "constructor") && proto.constructor
	if (Ctor === Object) return true
	return (
		typeof Ctor == "function" &&
		Function.toString.call(Ctor) === objectCtorString
	)
}
__name(isPlainObject, "isPlainObject")
function original(value) {
	if (!isDraft(value)) die(15, value)
	return value[DRAFT_STATE].base_
}
__name(original, "original")
function each(obj, iter) {
	if (getArchtype(obj) === 0 /* Object */) {
		Reflect.ownKeys(obj).forEach(key => {
			iter(key, obj[key], obj)
		})
	} else {
		obj.forEach((entry, index) => iter(index, entry, obj))
	}
}
__name(each, "each")
function getArchtype(thing) {
	const state = thing[DRAFT_STATE]
	return state
		? state.type_
		: Array.isArray(thing)
		? 1 /* Array */
		: isMap(thing)
		? 2 /* Map */
		: isSet(thing)
		? 3 /* Set */
		: 0 /* Object */
}
__name(getArchtype, "getArchtype")
function has(thing, prop) {
	return getArchtype(thing) === 2 /* Map */
		? thing.has(prop)
		: Object.prototype.hasOwnProperty.call(thing, prop)
}
__name(has, "has")
function get(thing, prop) {
	return getArchtype(thing) === 2 /* Map */ ? thing.get(prop) : thing[prop]
}
__name(get, "get")
function set(thing, propOrOldValue, value) {
	const t = getArchtype(thing)
	if (t === 2 /* Map */) thing.set(propOrOldValue, value)
	else if (t === 3 /* Set */) {
		thing.add(value)
	} else thing[propOrOldValue] = value
}
__name(set, "set")
function is(x, y) {
	if (x === y) {
		return x !== 0 || 1 / x === 1 / y
	} else {
		return x !== x && y !== y
	}
}
__name(is, "is")
function isMap(target) {
	return target instanceof Map
}
__name(isMap, "isMap")
function isSet(target) {
	return target instanceof Set
}
__name(isSet, "isSet")
function latest(state) {
	return state.copy_ || state.base_
}
__name(latest, "latest")
function shallowCopy(base, strict) {
	if (isMap(base)) {
		return new Map(base)
	}
	if (isSet(base)) {
		return new Set(base)
	}
	if (Array.isArray(base)) return Array.prototype.slice.call(base)
	const isPlain = isPlainObject(base)
	if (strict === true || (strict === "class_only" && !isPlain)) {
		const descriptors = Object.getOwnPropertyDescriptors(base)
		delete descriptors[DRAFT_STATE]
		let keys = Reflect.ownKeys(descriptors)
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i]
			const desc = descriptors[key]
			if (desc.writable === false) {
				desc.writable = true
				desc.configurable = true
			}
			if (desc.get || desc.set)
				descriptors[key] = {
					configurable: true,
					writable: true,
					// 也可以用 !!desc.set 来决定是否可写
					enumerable: desc.enumerable,
					value: base[key]
					// 读取当前值，避免 getter 的副作用
				}
		}
		return Object.create(getPrototypeOf(base), descriptors)
	} else {
		const proto = getPrototypeOf(base)
		if (proto !== null && isPlain) {
			return {...base}
		}
		const obj = Object.create(proto)
		return Object.assign(obj, base)
	}
}
__name(shallowCopy, "shallowCopy")
function freeze(obj, deep = false) {
	if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj)) return obj
	if (getArchtype(obj) > 1) {
		obj.set = obj.add = obj.clear = obj.delete = dontMutateFrozenCollections
	}
	Object.freeze(obj)
	if (deep) Object.values(obj).forEach(value => freeze(value, true))
	return obj
}
__name(freeze, "freeze")
function dontMutateFrozenCollections() {
	die(2)
}
__name(dontMutateFrozenCollections, "dontMutateFrozenCollections")
function isFrozen(obj) {
	return Object.isFrozen(obj)
}
__name(isFrozen, "isFrozen")

// src/utils/plugins.ts
var plugins = {}
function getPlugin(pluginKey) {
	const plugin = plugins[pluginKey]
	if (!plugin) {
		die(0, pluginKey)
	}
	return plugin
}
__name(getPlugin, "getPlugin")
function loadPlugin(pluginKey, implementation) {
	if (!plugins[pluginKey]) plugins[pluginKey] = implementation
}
__name(loadPlugin, "loadPlugin")

// src/core/scope.ts
var currentScope
function getCurrentScope() {
	return currentScope
}
__name(getCurrentScope, "getCurrentScope")
function createScope(parent_, immer_) {
	return {
		drafts_: [],
		// 空数组，准备收集草稿
		parent_,
		// 父级作用域引用
		immer_,
		// Immer 实例引用
		// 自动冻结控制的重要注释：
		// 当修改的草稿包含来自其他作用域的草稿时，
		// 需要禁用自动冻结，以便未拥有的草稿可以被正确最终化
		canAutoFreeze_: true,
		// 默认允许自动冻结
		unfinalizedDrafts_: 0
		// 初始无未最终化草稿
	}
}
__name(createScope, "createScope")
function usePatchesInScope(scope, patchListener) {
	if (patchListener) {
		getPlugin("Patches")
		scope.patches_ = []
		scope.inversePatches_ = []
		scope.patchListener_ = patchListener
	}
}
__name(usePatchesInScope, "usePatchesInScope")
function revokeScope(scope) {
	leaveScope(scope)
	scope.drafts_.forEach(revokeDraft)
	scope.drafts_ = null
}
__name(revokeScope, "revokeScope")
function leaveScope(scope) {
	if (scope === currentScope) {
		currentScope = scope.parent_
	}
}
__name(leaveScope, "leaveScope")
function enterScope(immer2) {
	return (currentScope = createScope(currentScope, immer2))
}
__name(enterScope, "enterScope")
function revokeDraft(draft) {
	const state = draft[DRAFT_STATE]
	if (state.type_ === 0 /* Object */ || state.type_ === 1 /* Array */)
		state.revoke_()
	else state.revoked_ = true
}
__name(revokeDraft, "revokeDraft")

// src/core/finalize.ts
function processResult(result, scope) {
	scope.unfinalizedDrafts_ = scope.drafts_.length
	const baseDraft = scope.drafts_[0]
	const isReplaced = result !== void 0 && result !== baseDraft
	if (isReplaced) {
		if (baseDraft[DRAFT_STATE].modified_) {
			revokeScope(scope)
			die(4)
		}
		if (isDraftable(result)) {
			result = finalize(scope, result)
			if (!scope.parent_) maybeFreeze(scope, result)
		}
		if (scope.patches_) {
			getPlugin("Patches").generateReplacementPatches_(
				baseDraft[DRAFT_STATE].base_,
				result,
				scope.patches_,
				scope.inversePatches_
			)
		}
	} else {
		result = finalize(scope, baseDraft, [])
	}
	revokeScope(scope)
	if (scope.patches_) {
		scope.patchListener_(scope.patches_, scope.inversePatches_)
	}
	return result !== NOTHING ? result : void 0
}
__name(processResult, "processResult")
function finalize(rootScope, value, path) {
	if (isFrozen(value)) return value
	const state = value[DRAFT_STATE]
	if (!state) {
		each(value, (key, childValue) =>
			finalizeProperty(rootScope, state, value, key, childValue, path)
		)
		return value
	}
	if (state.scope_ !== rootScope) return value
	if (!state.modified_) {
		maybeFreeze(rootScope, state.base_, true)
		return state.base_
	}
	if (!state.finalized_) {
		state.finalized_ = true
		state.scope_.unfinalizedDrafts_--
		const result = state.copy_
		let resultEach = result
		let isSet2 = false
		if (state.type_ === 3 /* Set */) {
			resultEach = new Set(result)
			result.clear()
			isSet2 = true
		}
		each(resultEach, (key, childValue) =>
			finalizeProperty(rootScope, state, result, key, childValue, path, isSet2)
		)
		maybeFreeze(rootScope, result, false)
		if (path && rootScope.patches_) {
			getPlugin("Patches").generatePatches_(
				state,
				path,
				rootScope.patches_,
				rootScope.inversePatches_
			)
		}
	}
	return state.copy_
}
__name(finalize, "finalize")
function finalizeProperty(
	rootScope,
	parentState,
	targetObject,
	prop,
	childValue,
	rootPath,
	targetIsSet
) {
	if (process.env.NODE_ENV !== "production" && childValue === targetObject)
		die(5)
	if (isDraft(childValue)) {
		const path =
			rootPath &&
			parentState &&
			parentState.type_ !== 3 /* Set */ && // Set对象是原子性的
			!has(parentState.assigned_, prop)
				? rootPath.concat(prop)
				: void 0
		const res = finalize(rootScope, childValue, path)
		set(targetObject, prop, res)
		if (isDraft(res)) {
			rootScope.canAutoFreeze_ = false
		} else return
	} else if (targetIsSet) {
		targetObject.add(childValue)
	}
	if (isDraftable(childValue) && !isFrozen(childValue)) {
		if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) {
			return
		}
		finalize(rootScope, childValue)
		if (
			(!parentState || !parentState.scope_.parent_) &&
			typeof prop !== "symbol" &&
			Object.prototype.propertyIsEnumerable.call(targetObject, prop)
		)
			maybeFreeze(rootScope, childValue)
	}
}
__name(finalizeProperty, "finalizeProperty")
function maybeFreeze(scope, value, deep = false) {
	if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) {
		freeze(value, deep)
	}
}
__name(maybeFreeze, "maybeFreeze")

// src/core/proxy.ts
function createProxyProxy(base, parent) {
	const isArray = Array.isArray(base)
	const state = {
		// 类型标识：数组或对象
		type_: isArray ? 1 /* Array */ : 0 /* Object */,
		// 作用域管理：继承父级作用域或使用当前作用域
		scope_: parent ? parent.scope_ : getCurrentScope(),
		// 修改标记：初始为false，表示未修改
		modified_: false,
		// 最终化标记：用于最终化过程的控制
		finalized_: false,
		// 属性分配跟踪：记录哪些属性被设置或删除
		assigned_: {},
		// 父级状态：建立层次关系
		parent_: parent,
		// 原始对象：保持引用用于比较和继承
		base_: base,
		// 草稿引用：稍后设置
		draft_: null,
		// 修改副本：延迟创建
		copy_: null,
		// 撤销函数：稍后设置
		revoke_: null,
		// 手动标记：false表示自动管理
		isManual_: false
	}
	let target = state
	let traps = objectTraps
	if (isArray) {
		target = [state]
		traps = arrayTraps
	}
	const {revoke, proxy} = Proxy.revocable(target, traps)
	state.draft_ = proxy
	state.revoke_ = revoke
	return proxy
}
__name(createProxyProxy, "createProxyProxy")
var objectTraps = {
	/**
	 * get陷阱 - 属性访问拦截
	 *
	 * 这是最复杂和最重要的陷阱，处理所有的属性访问。
	 * 它需要处理多种情况：现有属性、新属性、嵌套对象等。
	 *
	 * 处理逻辑：
	 * 1. 特殊属性：DRAFT_STATE直接返回状态
	 * 2. 现有属性：从最新状态获取值
	 * 3. 不存在属性：从原型链查找
	 * 4. 可草稿化值：自动创建嵌套草稿
	 * 5. 普通值：直接返回
	 *
	 * 性能优化：
	 * - 快速路径：已最终化的对象直接返回值
	 * - 缓存机制：避免重复创建嵌套草稿
	 * - 延迟拷贝：只在实际修改时创建副本
	 */
	get(state, prop) {
		if (prop === DRAFT_STATE) return state
		const source = latest(state)
		if (!has(source, prop)) {
			return readPropFromProto(state, source, prop)
		}
		const value = source[prop]
		if (state.finalized_ || !isDraftable(value)) {
			return value
		}
		if (value === peek(state.base_, prop)) {
			prepareCopy(state)
			return (state.copy_[prop] = createProxy(value, state))
		}
		return value
	},
	/**
	 * has陷阱 - 属性存在性检查
	 *
	 * 处理 'prop' in object 操作，检查属性是否存在。
	 * 简单地委托给最新状态的检查。
	 */
	has(state, prop) {
		return prop in latest(state)
	},
	/**
	 * ownKeys陷阱 - 自有属性枚举
	 *
	 * 处理 Object.keys()、Object.getOwnPropertyNames() 等操作。
	 * 返回最新状态的所有自有属性键。
	 */
	ownKeys(state) {
		return Reflect.ownKeys(latest(state))
	},
	/**
	 * set陷阱 - 属性设置拦截
	 *
	 * 这是实现写时复制的核心陷阱，处理所有的属性赋值操作。
	 * 它需要检测是否真的发生了变化，并相应地更新状态。
	 *
	 * 复杂性来源：
	 * - 属性描述符：处理getter/setter属性
	 * - 变化检测：区分真实变化和重复赋值
	 * - 状态管理：更新修改标记和分配记录
	 * - 性能优化：避免不必要的拷贝操作
	 *
	 * 处理流程：
	 * 1. 检查属性描述符，处理setter
	 * 2. 检测是否为真实的变化
	 * 3. 处理特殊情况（草稿赋值、相同值等）
	 * 4. 创建副本并更新状态
	 * 5. 标记修改并更新分配记录
	 */
	set(state, prop, value) {
		const desc = getDescriptorFromProto(latest(state), prop)
		if (desc?.set) {
			desc.set.call(state.draft_, value)
			return true
		}
		if (!state.modified_) {
			const current2 = peek(latest(state), prop)
			const currentState = current2?.[DRAFT_STATE]
			if (currentState && currentState.base_ === value) {
				state.copy_[prop] = value
				state.assigned_[prop] = false
				return true
			}
			if (is(value, current2) && (value !== void 0 || has(state.base_, prop)))
				return true
			prepareCopy(state)
			markChanged(state)
		}
		if (
			(state.copy_[prop] === value && // 特殊情况：处理值为undefined的新属性
				(value !== void 0 || prop in state.copy_)) || // 特殊情况：NaN的处理
			(Number.isNaN(value) && Number.isNaN(state.copy_[prop]))
		)
			return true
		state.copy_[prop] = value
		state.assigned_[prop] = true
		return true
	},
	/**
	 * deleteProperty陷阱 - 属性删除拦截
	 *
	 * 处理 delete object.prop 操作。需要区分删除现有属性
	 * 和删除不存在的属性，并正确更新状态。
	 *
	 * 处理逻辑：
	 * 1. 检查属性是否在原始对象中存在
	 * 2. 标记为删除（assigned_[prop] = false）
	 * 3. 准备副本并标记修改
	 * 4. 从副本中删除属性
	 */
	deleteProperty(state, prop) {
		if (peek(state.base_, prop) !== void 0 || prop in state.base_) {
			state.assigned_[prop] = false
			prepareCopy(state)
			markChanged(state)
		} else {
			delete state.assigned_[prop]
		}
		if (state.copy_) {
			delete state.copy_[prop]
		}
		return true
	},
	/**
	 * getOwnPropertyDescriptor陷阱 - 属性描述符获取
	 *
	 * 处理 Object.getOwnPropertyDescriptor() 操作。
	 * 注意：我们不会将desc.value强制转换为Immer草稿，
	 * 因为在ES5模式下无法做出同样的保证。
	 */
	getOwnPropertyDescriptor(state, prop) {
		const owner = latest(state)
		const desc = Reflect.getOwnPropertyDescriptor(owner, prop)
		if (!desc) return desc
		return {
			writable: true,
			// 数组的length属性不可配置
			configurable: state.type_ !== 1 /* Array */ || prop !== "length",
			enumerable: desc.enumerable,
			value: owner[prop]
		}
	},
	/**
	 * defineProperty陷阱 - 属性定义拦截
	 *
	 * 禁止在草稿上使用Object.defineProperty()，
	 * 因为这会使草稿系统变得复杂且难以预测。
	 */
	defineProperty() {
		die(11)
	},
	/**
	 * getPrototypeOf陷阱 - 原型获取
	 *
	 * 返回原始对象的原型，保持原型链的一致性。
	 */
	getPrototypeOf(state) {
		return getPrototypeOf(state.base_)
	},
	/**
	 * setPrototypeOf陷阱 - 原型设置拦截
	 *
	 * 禁止修改草稿对象的原型，因为这会影响对象的基本行为。
	 */
	setPrototypeOf() {
		die(12)
	}
}
var arrayTraps = {}
each(objectTraps, (key, fn) => {
	arrayTraps[key] = function() {
		arguments[0] = arguments[0][0]
		return fn.apply(this, arguments)
	}
})
arrayTraps.deleteProperty = function(state, prop) {
	if (process.env.NODE_ENV !== "production" && isNaN(parseInt(prop))) die(13)
	return arrayTraps.set.call(this, state, prop, void 0)
}
arrayTraps.set = function(state, prop, value) {
	if (
		process.env.NODE_ENV !== "production" &&
		prop !== "length" &&
		isNaN(parseInt(prop))
	)
		die(14)
	return objectTraps.set.call(this, state[0], prop, value, state[0])
}
function peek(draft, prop) {
	const state = draft[DRAFT_STATE]
	const source = state ? latest(state) : draft
	return source[prop]
}
__name(peek, "peek")
function readPropFromProto(state, source, prop) {
	const desc = getDescriptorFromProto(source, prop)
	return desc
		? `value` in desc
			? desc.value
			: // 特殊情况：如果是原型定义的getter，需要用草稿作为上下文调用
			  desc.get?.call(state.draft_)
		: void 0
}
__name(readPropFromProto, "readPropFromProto")
function getDescriptorFromProto(source, prop) {
	if (!(prop in source)) return void 0
	let proto = getPrototypeOf(source)
	while (proto) {
		const desc = Object.getOwnPropertyDescriptor(proto, prop)
		if (desc) return desc
		proto = getPrototypeOf(proto)
	}
	return void 0
}
__name(getDescriptorFromProto, "getDescriptorFromProto")
function markChanged(state) {
	if (!state.modified_) {
		state.modified_ = true
		if (state.parent_) {
			markChanged(state.parent_)
		}
	}
}
__name(markChanged, "markChanged")
function prepareCopy(state) {
	if (!state.copy_) {
		state.copy_ = shallowCopy(
			state.base_,
			state.scope_.immer_.useStrictShallowCopy_
		)
	}
}
__name(prepareCopy, "prepareCopy")

// src/core/immerClass.ts
var Immer2 = class {
	/**
	 * 自动冻结配置
	 * true: 自动冻结所有生成的不可变对象（默认）
	 * false: 不自动冻结，提升性能但降低安全性
	 */
	autoFreeze_ = true
	/**
	 * 严格浅拷贝配置
	 * 控制是否拷贝对象的属性描述符（getter、setter、可枚举性等）
	 */
	useStrictShallowCopy_ = false
	/**
	 * 构造函数 - 初始化 Immer 实例
	 * @param config 可选的配置对象
	 */
	constructor(config) {
		if (typeof config?.autoFreeze === "boolean")
			this.setAutoFreeze(config.autoFreeze)
		if (typeof config?.useStrictShallowCopy === "boolean")
			this.setUseStrictShallowCopy(config.useStrictShallowCopy)
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
	produce = (base, recipe, patchListener) => {
		if (typeof base === "function" && typeof recipe !== "function") {
			const defaultBase = recipe
			recipe = base
			const self = this
			return /* @__PURE__ */ __name(function curriedProduce(
				base2 = defaultBase,
				...args
			) {
				return self.produce(base2, draft => recipe.call(this, draft, ...args))
			},
			"curriedProduce")
		}
		if (typeof recipe !== "function") die(6)
		if (patchListener !== void 0 && typeof patchListener !== "function") die(7)
		let result
		if (isDraftable(base)) {
			const scope = enterScope(this)
			const proxy = createProxy(base, void 0)
			let hasError = true
			try {
				result = recipe(proxy)
				hasError = false
			} finally {
				if (hasError) revokeScope(scope)
				else leaveScope(scope)
			}
			usePatchesInScope(scope, patchListener)
			return processResult(result, scope)
		} else if (!base || typeof base !== "object") {
			result = recipe(base)
			if (result === void 0) result = base
			if (result === NOTHING) result = void 0
			if (this.autoFreeze_) freeze(result, true)
			if (patchListener) {
				const p = []
				const ip = []
				getPlugin("Patches").generateReplacementPatches_(base, result, p, ip)
				patchListener(p, ip)
			}
			return result
		} else {
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
	produceWithPatches = (base, recipe) => {
		if (typeof base === "function") {
			return (state, ...args) =>
				this.produceWithPatches(state, draft => base(draft, ...args))
		}
		let patches, inversePatches
		const result = this.produce(base, recipe, (p, ip) => {
			patches = p
			inversePatches = ip
		})
		return [result, patches, inversePatches]
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
	createDraft(base) {
		if (!isDraftable(base)) die(8)
		if (isDraft(base)) base = current(base)
		const scope = enterScope(this)
		const proxy = createProxy(base, void 0)
		proxy[DRAFT_STATE].isManual_ = true
		leaveScope(scope)
		return proxy
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
	finishDraft(draft, patchListener) {
		const state = draft && draft[DRAFT_STATE]
		if (!state || !state.isManual_) die(9)
		const {scope_: scope} = state
		usePatchesInScope(scope, patchListener)
		return processResult(void 0, scope)
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
	setAutoFreeze(value) {
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
	setUseStrictShallowCopy(value) {
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
	applyPatches(base, patches) {
		let i
		for (i = patches.length - 1; i >= 0; i--) {
			const patch = patches[i]
			if (patch.path.length === 0 && patch.op === "replace") {
				base = patch.value
				break
			}
		}
		if (i > -1) {
			patches = patches.slice(i + 1)
		}
		const applyPatchesImpl = getPlugin("Patches").applyPatches_
		if (isDraft(base)) {
			return applyPatchesImpl(base, patches)
		}
		return this.produce(base, draft => applyPatchesImpl(draft, patches))
	}
}
__name(Immer2, "Immer")
function createProxy(value, parent) {
	const draft = isMap(value)
		? getPlugin("MapSet").proxyMap_(value, parent)
		: isSet(value)
		? getPlugin("MapSet").proxySet_(value, parent)
		: createProxyProxy(value, parent)
	const scope = parent ? parent.scope_ : getCurrentScope()
	scope.drafts_.push(draft)
	return draft
}
__name(createProxy, "createProxy")

// src/core/current.ts
function current(value) {
	if (!isDraft(value)) die(10, value)
	return currentImpl(value)
}
__name(current, "current")
function currentImpl(value) {
	if (!isDraftable(value) || isFrozen(value)) return value
	const state = value[DRAFT_STATE]
	let copy
	if (state) {
		if (!state.modified_) return state.base_
		state.finalized_ = true
		copy = shallowCopy(value, state.scope_.immer_.useStrictShallowCopy_)
	} else {
		copy = shallowCopy(value, true)
	}
	each(copy, (key, childValue) => {
		set(copy, key, currentImpl(childValue))
	})
	if (state) {
		state.finalized_ = false
	}
	return copy
}
__name(currentImpl, "currentImpl")

// src/plugins/patches.ts
function enablePatches() {
	const errorOffset = 16
	if (process.env.NODE_ENV !== "production") {
		errors.push(
			'Sets cannot have "replace" patches.',
			// 错误16：Set不能有replace补丁
			function(op) {
				return "Unsupported patch operation: " + op
			},
			function(path) {
				return "Cannot apply patch, path doesn't resolve: " + path
			},
			// 错误19：禁止修改保留属性
			"Patching reserved attributes like __proto__, prototype and constructor is not allowed"
		)
	}
	const REPLACE = "replace"
	const ADD = "add"
	const REMOVE = "remove"
	function generatePatches_(state, basePath, patches, inversePatches) {
		switch (state.type_) {
			case 0 /* Object */:
			case 2 /* Map */:
				return generatePatchesFromAssigned(
					state,
					basePath,
					patches,
					inversePatches
				)
			case 1 /* Array */:
				return generateArrayPatches(state, basePath, patches, inversePatches)
			case 3 /* Set */:
				return generateSetPatches(state, basePath, patches, inversePatches)
		}
	}
	__name(generatePatches_, "generatePatches_")
	function generateArrayPatches(state, basePath, patches, inversePatches) {
		let {base_, assigned_} = state
		let copy_ = state.copy_
		if (copy_.length < base_.length) {
			;[base_, copy_] = [copy_, base_]
			;[patches, inversePatches] = [inversePatches, patches]
		}
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
		for (let i = base_.length; i < copy_.length; i++) {
			const path = basePath.concat([i])
			patches.push({
				op: ADD,
				path,
				// 需要克隆值，原因同上
				value: clonePatchValueIfNeeded(copy_[i])
			})
		}
		for (let i = copy_.length - 1; base_.length <= i; --i) {
			const path = basePath.concat([i])
			inversePatches.push({
				op: REMOVE,
				path
			})
		}
	}
	__name(generateArrayPatches, "generateArrayPatches")
	function generatePatchesFromAssigned(
		state,
		basePath,
		patches,
		inversePatches
	) {
		const {base_, copy_} = state
		each(state.assigned_, (key, assignedValue) => {
			const origValue = get(base_, key)
			const value = get(copy_, key)
			const op = !assignedValue ? REMOVE : has(base_, key) ? REPLACE : ADD
			if (origValue === value && op === REPLACE) return
			const path = basePath.concat(key)
			patches.push(op === REMOVE ? {op, path} : {op, path, value})
			inversePatches.push(
				op === ADD
					? {op: REMOVE, path}
					: op === REMOVE
					? {op: ADD, path, value: clonePatchValueIfNeeded(origValue)}
					: {op: REPLACE, path, value: clonePatchValueIfNeeded(origValue)}
				// REPLACE的逆向是REPLACE
			)
		})
	}
	__name(generatePatchesFromAssigned, "generatePatchesFromAssigned")
	function generateSetPatches(state, basePath, patches, inversePatches) {
		let {base_, copy_} = state
		let i = 0
		base_.forEach(value => {
			if (!copy_.has(value)) {
				const path = basePath.concat([i])
				patches.push({
					op: REMOVE,
					path,
					value
					// Set的删除需要指定值
				})
				inversePatches.unshift({
					op: ADD,
					path,
					value
				})
			}
			i++
		})
		i = 0
		copy_.forEach(value => {
			if (!base_.has(value)) {
				const path = basePath.concat([i])
				patches.push({
					op: ADD,
					path,
					value
				})
				inversePatches.unshift({
					op: REMOVE,
					path,
					value
				})
			}
			i++
		})
	}
	__name(generateSetPatches, "generateSetPatches")
	function generateReplacementPatches_(
		baseValue,
		replacement,
		patches,
		inversePatches
	) {
		patches.push({
			op: REPLACE,
			path: [],
			value: replacement === NOTHING ? void 0 : replacement
		})
		inversePatches.push({
			op: REPLACE,
			path: [],
			value: baseValue
		})
	}
	__name(generateReplacementPatches_, "generateReplacementPatches_")
	function applyPatches_(draft, patches) {
		patches.forEach(patch => {
			const {path, op} = patch
			let base = draft
			for (let i = 0; i < path.length - 1; i++) {
				const parentType = getArchtype(base)
				let p = path[i]
				if (typeof p !== "string" && typeof p !== "number") {
					p = "" + p
				}
				if (
					(parentType === 0 /* Object */ || parentType === 1) /* Array */ &&
					(p === "__proto__" || p === "constructor")
				)
					die(errorOffset + 3)
				if (typeof base === "function" && p === "prototype")
					die(errorOffset + 3)
				base = get(base, p)
				if (typeof base !== "object") die(errorOffset + 2, path.join("/"))
			}
			const type = getArchtype(base)
			const value = deepClonePatchValue(patch.value)
			const key = path[path.length - 1]
			switch (op) {
				case REPLACE:
					switch (type) {
						case 2 /* Map */:
							return base.set(key, value)
						case 3 /* Set */:
							die(errorOffset)
						default:
							return (base[key] = value)
					}
				case ADD:
					switch (type) {
						case 1 /* Array */:
							return key === "-" ? base.push(value) : base.splice(key, 0, value)
						case 2 /* Map */:
							return base.set(key, value)
						case 3 /* Set */:
							return base.add(value)
						default:
							return (base[key] = value)
					}
				case REMOVE:
					switch (type) {
						case 1 /* Array */:
							return base.splice(key, 1)
						case 2 /* Map */:
							return base.delete(key)
						case 3 /* Set */:
							return base.delete(patch.value)
						default:
							return delete base[key]
					}
				default:
					die(errorOffset + 1, op)
			}
		})
		return draft
	}
	__name(applyPatches_, "applyPatches_")
	function deepClonePatchValue(obj) {
		if (!isDraftable(obj)) return obj
		if (Array.isArray(obj)) return obj.map(deepClonePatchValue)
		if (isMap(obj))
			return new Map(
				Array.from(obj.entries()).map(([k, v]) => [k, deepClonePatchValue(v)])
			)
		if (isSet(obj)) return new Set(Array.from(obj).map(deepClonePatchValue))
		const cloned = Object.create(getPrototypeOf(obj))
		for (const key in obj) cloned[key] = deepClonePatchValue(obj[key])
		if (has(obj, DRAFTABLE)) cloned[DRAFTABLE] = obj[DRAFTABLE]
		return cloned
	}
	__name(deepClonePatchValue, "deepClonePatchValue")
	function clonePatchValueIfNeeded(obj) {
		if (isDraft(obj)) {
			return deepClonePatchValue(obj)
		} else return obj
	}
	__name(clonePatchValueIfNeeded, "clonePatchValueIfNeeded")
	loadPlugin("Patches", {
		applyPatches_,
		generatePatches_,
		generateReplacementPatches_
	})
}
__name(enablePatches, "enablePatches")

// src/plugins/mapset.ts
function enableMapSet() {
	class DraftMap extends Map {
		/**
		 * 草稿状态标识
		 * 使用Symbol键存储Map的草稿状态信息
		 */
		[DRAFT_STATE]
		/**
		 * 构造函数 - 初始化Map草稿
		 *
		 * @param target - 要草稿化的原始Map
		 * @param parent - 父级草稿状态（用于嵌套）
		 */
		constructor(target, parent) {
			super()
			this[DRAFT_STATE] = {
				type_: 2 /* Map */,
				// 类型标识
				parent_: parent,
				// 父级状态
				scope_: parent ? parent.scope_ : getCurrentScope(),
				// 作用域
				modified_: false,
				// 修改标记
				finalized_: false,
				// 最终化标记
				copy_: void 0,
				// 副本（懒创建）
				assigned_: void 0,
				// 分配跟踪（懒创建）
				base_: target,
				// 原始Map
				draft_: this,
				// 草稿引用
				isManual_: false,
				// 自动管理
				revoked_: false
				// 撤销标记
			}
		}
		/**
		 * size属性 - 获取Map大小
		 *
		 * 返回当前有效状态的大小。如果已修改，返回copy的大小；
		 * 否则返回base的大小。
		 */
		get size() {
			return latest(this[DRAFT_STATE]).size
		}
		/**
		 * has方法 - 检查键是否存在
		 *
		 * @param key - 要检查的键
		 * @returns 键是否存在
		 */
		has(key) {
			return latest(this[DRAFT_STATE]).has(key)
		}
		/**
		 * set方法 - 设置键值对
		 *
		 * 这是Map修改的核心方法，实现了写时复制逻辑。
		 * 只有在值真正发生变化时才会创建副本和标记修改。
		 *
		 * @param key - 要设置的键
		 * @param value - 要设置的值
		 * @returns this（支持链式调用）
		 */
		set(key, value) {
			const state = this[DRAFT_STATE]
			assertUnrevoked(state)
			if (!latest(state).has(key) || latest(state).get(key) !== value) {
				prepareMapCopy(state)
				markChanged(state)
				state.assigned_.set(key, true)
				state.copy_.set(key, value)
				state.assigned_.set(key, true)
			}
			return this
		}
		/**
		 * delete方法 - 删除键值对
		 *
		 * @param key - 要删除的键
		 * @returns 是否成功删除
		 */
		delete(key) {
			if (!this.has(key)) {
				return false
			}
			const state = this[DRAFT_STATE]
			assertUnrevoked(state)
			prepareMapCopy(state)
			markChanged(state)
			if (state.base_.has(key)) {
				state.assigned_.set(key, false)
			} else {
				state.assigned_.delete(key)
			}
			state.copy_.delete(key)
			return true
		}
		/**
		 * clear方法 - 清空Map
		 *
		 * 删除所有键值对，等同于删除每个键。
		 */
		clear() {
			const state = this[DRAFT_STATE]
			assertUnrevoked(state)
			if (latest(state).size) {
				prepareMapCopy(state)
				markChanged(state)
				state.assigned_ = /* @__PURE__ */ new Map()
				each(state.base_, key => {
					state.assigned_.set(key, false)
				})
				state.copy_.clear()
			}
		}
		/**
		 * forEach方法 - 遍历Map
		 *
		 * 注意：回调函数接收的值可能是草稿化的，
		 * 这确保了在遍历过程中访问嵌套对象时的一致性。
		 *
		 * @param cb - 回调函数
		 * @param thisArg - this绑定值
		 */
		forEach(cb, thisArg) {
			const state = this[DRAFT_STATE]
			latest(state).forEach((_value, key, _map) => {
				cb.call(thisArg, this.get(key), key, this)
			})
		}
		/**
		 * get方法 - 获取键对应的值
		 *
		 * 这个方法可能返回草稿化的值。如果值是可草稿化的对象
		 * 且首次访问，会自动创建草稿并缓存。
		 *
		 * @param key - 要获取的键
		 * @returns 对应的值（可能是草稿）
		 */
		get(key) {
			const state = this[DRAFT_STATE]
			assertUnrevoked(state)
			const value = latest(state).get(key)
			if (state.finalized_ || !isDraftable(value)) {
				return value
			}
			if (value !== state.base_.get(key)) {
				return value
			}
			const draft = createProxy(value, state)
			prepareMapCopy(state)
			state.copy_.set(key, draft)
			return draft
		}
		/**
		 * keys方法 - 获取键的迭代器
		 *
		 * @returns 键的迭代器
		 */
		keys() {
			return latest(this[DRAFT_STATE]).keys()
		}
		/**
		 * values方法 - 获取值的迭代器
		 *
		 * 返回的迭代器会通过get方法获取值，确保返回的是
		 * 正确的草稿化值。
		 *
		 * @returns 值的迭代器
		 */
		values() {
			const iterator = this.keys()
			return {
				[Symbol.iterator]: () => this.values(),
				next: () => {
					const r = iterator.next()
					if (r.done) return r
					const value = this.get(r.value)
					return {
						done: false,
						value
					}
				}
			}
		}
		/**
		 * entries方法 - 获取键值对的迭代器
		 *
		 * @returns 键值对的迭代器
		 */
		entries() {
			const iterator = this.keys()
			return {
				[Symbol.iterator]: () => this.entries(),
				next: () => {
					const r = iterator.next()
					if (r.done) return r
					const value = this.get(r.value)
					return {
						done: false,
						value: [r.value, value]
					}
				}
			}
		}
		/**
		 * Symbol.iterator方法 - 默认迭代器
		 *
		 * Map的默认迭代器是entries迭代器
		 */
		[Symbol.iterator]() {
			return this.entries()
		}
	}
	__name(DraftMap, "DraftMap")
	function proxyMap_(target, parent) {
		return new DraftMap(target, parent)
	}
	__name(proxyMap_, "proxyMap_")
	function prepareMapCopy(state) {
		if (!state.copy_) {
			state.assigned_ = /* @__PURE__ */ new Map()
			state.copy_ = new Map(state.base_)
		}
	}
	__name(prepareMapCopy, "prepareMapCopy")
	class DraftSet extends Set {
		[DRAFT_STATE]
		constructor(target, parent) {
			super()
			this[DRAFT_STATE] = {
				type_: 3 /* Set */,
				parent_: parent,
				scope_: parent ? parent.scope_ : getCurrentScope(),
				modified_: false,
				finalized_: false,
				copy_: void 0,
				// Set副本
				base_: target,
				// 原始Set
				draft_: this,
				// 草稿引用
				drafts_: /* @__PURE__ */ new Map(),
				// 原始值→草稿值映射
				revoked_: false,
				isManual_: false
			}
		}
		/**
		 * size属性 - 获取Set大小
		 */
		get size() {
			return latest(this[DRAFT_STATE]).size
		}
		/**
		 * has方法 - 检查值是否存在
		 *
		 * 需要特殊处理：既要检查原始值，也要检查对应的草稿值
		 *
		 * @param value - 要检查的值
		 * @returns 值是否存在
		 */
		has(value) {
			const state = this[DRAFT_STATE]
			assertUnrevoked(state)
			if (!state.copy_) {
				return state.base_.has(value)
			}
			if (state.copy_.has(value)) return true
			if (state.drafts_.has(value) && state.copy_.has(state.drafts_.get(value)))
				return true
			return false
		}
		/**
		 * add方法 - 添加值到Set
		 *
		 * @param value - 要添加的值
		 * @returns this（支持链式调用）
		 */
		add(value) {
			const state = this[DRAFT_STATE]
			assertUnrevoked(state)
			if (!this.has(value)) {
				prepareSetCopy(state)
				markChanged(state)
				state.copy_.add(value)
			}
			return this
		}
		/**
		 * delete方法 - 删除值
		 *
		 * @param value - 要删除的值
		 * @returns 是否成功删除
		 */
		delete(value) {
			if (!this.has(value)) {
				return false
			}
			const state = this[DRAFT_STATE]
			assertUnrevoked(state)
			prepareSetCopy(state)
			markChanged(state)
			return (
				state.copy_.delete(value) ||
				(state.drafts_.has(value)
					? state.copy_.delete(state.drafts_.get(value))
					: /* istanbul ignore next */
					  false)
			)
		}
		/**
		 * clear方法 - 清空Set
		 */
		clear() {
			const state = this[DRAFT_STATE]
			assertUnrevoked(state)
			if (latest(state).size) {
				prepareSetCopy(state)
				markChanged(state)
				state.copy_.clear()
			}
		}
		/**
		 * values方法 - 获取值的迭代器
		 *
		 * 注意：为了保持插入顺序和正确处理草稿值，
		 * 我们需要准备副本并返回副本的迭代器
		 */
		values() {
			const state = this[DRAFT_STATE]
			assertUnrevoked(state)
			prepareSetCopy(state)
			return state.copy_.values()
		}
		/**
		 * entries方法 - 获取值对的迭代器
		 *
		 * Set的entries返回[value, value]格式
		 */
		entries() {
			const state = this[DRAFT_STATE]
			assertUnrevoked(state)
			prepareSetCopy(state)
			return state.copy_.entries()
		}
		/**
		 * keys方法 - 获取键的迭代器
		 *
		 * 对于Set，keys等同于values
		 */
		keys() {
			return this.values()
		}
		/**
		 * Symbol.iterator方法 - 默认迭代器
		 */
		[Symbol.iterator]() {
			return this.values()
		}
		/**
		 * forEach方法 - 遍历Set
		 *
		 * @param cb - 回调函数
		 * @param thisArg - this绑定值
		 */
		forEach(cb, thisArg) {
			const iterator = this.values()
			let result = iterator.next()
			while (!result.done) {
				cb.call(thisArg, result.value, result.value, this)
				result = iterator.next()
			}
		}
	}
	__name(DraftSet, "DraftSet")
	function proxySet_(target, parent) {
		return new DraftSet(target, parent)
	}
	__name(proxySet_, "proxySet_")
	function prepareSetCopy(state) {
		if (!state.copy_) {
			state.copy_ = /* @__PURE__ */ new Set()
			state.base_.forEach(value => {
				if (isDraftable(value)) {
					const draft = createProxy(value, state)
					state.drafts_.set(value, draft)
					state.copy_.add(draft)
				} else {
					state.copy_.add(value)
				}
			})
		}
	}
	__name(prepareSetCopy, "prepareSetCopy")
	function assertUnrevoked(state) {
		if (state.revoked_) die(3, JSON.stringify(latest(state)))
	}
	__name(assertUnrevoked, "assertUnrevoked")
	loadPlugin("MapSet", {proxyMap_, proxySet_})
}
__name(enableMapSet, "enableMapSet")

// src/immer.ts
var immer = new Immer2()
var produce = immer.produce
var produceWithPatches = immer.produceWithPatches.bind(immer)
var setAutoFreeze = immer.setAutoFreeze.bind(immer)
var setUseStrictShallowCopy = immer.setUseStrictShallowCopy.bind(immer)
var applyPatches = immer.applyPatches.bind(immer)
var createDraft = immer.createDraft.bind(immer)
var finishDraft = immer.finishDraft.bind(immer)
function castDraft(value) {
	return value
}
__name(castDraft, "castDraft")
function castImmutable(value) {
	return value
}
__name(castImmutable, "castImmutable")
export {
	Immer2 as Immer,
	applyPatches,
	castDraft,
	castImmutable,
	createDraft,
	current,
	enableMapSet,
	enablePatches,
	finishDraft,
	freeze,
	DRAFTABLE as immerable,
	isDraft,
	isDraftable,
	NOTHING as nothing,
	original,
	produce,
	produceWithPatches,
	setAutoFreeze,
	setUseStrictShallowCopy
}
//# sourceMappingURL=immer.debug.mjs.map

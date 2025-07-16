/**
 * proxy.ts - Immer Proxy代理核心实现
 *
 * 这是immer最核心和最复杂的模块，实现了基于ES6 Proxy的草稿化机制。
 * 通过劫持对象的属性访问和修改操作，实现了写时复制和状态跟踪。
 *
 * 核心设计理念：
 * - 透明代理：用户感觉像在直接修改对象
 * - 写时复制：只有在实际修改时才创建副本
 * - 结构共享：未修改的部分继续共享引用
 * - 嵌套支持：自动处理嵌套对象的草稿化
 *
 * 技术特点：
 * - Proxy劫持：拦截所有属性操作
 * - 延迟创建：推迟昂贵操作到真正需要时
 * - 状态跟踪：精确记录哪些属性被修改
 * - 类型保持：保持原对象的类型和行为
 *
 * 架构亮点：
 * - 统一接口：对象和数组使用相同的代理逻辑
 * - 性能优化：多层缓存和快速路径
 * - 错误处理：完善的边界条件处理
 * - 扩展性：支持自定义对象类型
 */

import {
	each,
	has,
	is,
	isDraftable,
	shallowCopy,
	latest,
	ImmerBaseState,
	ImmerState,
	Drafted,
	AnyObject,
	AnyArray,
	Objectish,
	getCurrentScope,
	getPrototypeOf,
	DRAFT_STATE,
	die,
	createProxy,
	ArchType,
	ImmerScope
} from "../internal"

/**
 * ProxyBaseState - Proxy代理状态的基础接口
 *
 * 扩展了ImmerBaseState，添加了Proxy特有的状态管理属性。
 * 这个接口是对象和数组代理状态的共同基础。
 *
 * 关键特性：
 * - 属性跟踪：记录哪些属性被访问和修改
 * - 撤销支持：支持代理的撤销操作
 * - 层次关系：维护父子草稿的关系
 */
interface ProxyBaseState extends ImmerBaseState {
	/**
	 * assigned_ - 属性分配跟踪表
	 *
	 * 这是Proxy代理的核心数据结构，跟踪每个属性的修改状态：
	 * - true: 属性被设置了新值
	 * - false: 属性被删除
	 * - undefined: 属性未被触碰
	 *
	 * 用途：
	 * - 补丁生成：确定哪些属性需要生成补丁
	 * - 性能优化：避免不必要的拷贝操作
	 * - 状态跟踪：支持精确的变更检测
	 */
	assigned_: {
		[property: string]: boolean
	}

	/**
	 * parent_ - 父级草稿状态引用
	 *
	 * 建立草稿对象的层次关系，支持：
	 * - 变更冒泡：子对象的修改会标记父对象为已修改
	 * - 作用域管理：确保所有草稿属于同一作用域
	 * - 错误恢复：在异常时正确清理整个草稿树
	 */
	parent_?: ImmerState

	/**
	 * revoke_ - 代理撤销函数
	 *
	 * ES6 Proxy.revocable返回的撤销函数，用于：
	 * - 生命周期管理：在草稿完成后撤销代理
	 * - 安全性：防止在错误状态下继续使用代理
	 * - 内存清理：释放代理相关的资源
	 * - 错误处理：在异常情况下快速失效代理
	 */
	revoke_(): void
}

/**
 * ProxyObjectState - 普通对象的代理状态
 *
 * 专门用于普通对象的草稿状态管理，继承了ProxyBaseState
 * 的所有功能，并添加了对象特有的属性。
 *
 * 对象特性：
 * - 属性访问：支持任意字符串键的属性
 * - 动态结构：可以添加和删除属性
 * - 原型链：保持原始对象的原型链
 * - 描述符：处理属性描述符的复制
 */
export interface ProxyObjectState extends ProxyBaseState {
	/**
	 * type_ - 架构类型标识
	 * 固定为ArchType.Object，用于运行时类型识别
	 */
	type_: ArchType.Object

	/**
	 * base_ - 原始对象引用
	 * 保持对原始对象的引用，用于：
	 * - 属性继承：从原始对象继承未修改的属性
	 * - 比较操作：检测是否发生了实际修改
	 * - 性能优化：避免不必要的属性复制
	 */
	base_: any

	/**
	 * copy_ - 修改副本
	 * 延迟创建的对象副本，包含所有修改：
	 * - 懒创建：只在首次修改时创建
	 * - 写时复制：共享未修改的部分
	 * - 完整性：包含所有最终的属性值
	 */
	copy_: any

	/**
	 * draft_ - 草稿对象引用
	 * 指向用户操作的草稿对象（即Proxy本身）
	 */
	draft_: Drafted<AnyObject, ProxyObjectState>
}

/**
 * ProxyArrayState - 数组的代理状态
 *
 * 专门用于数组对象的草稿状态管理。数组在很多方面与对象相似，
 * 但有一些特殊的行为需要处理。
 *
 * 数组特性：
 * - 数字索引：主要通过数字索引访问元素
 * - 长度属性：length属性需要特殊维护
 * - 稀疏性：支持稀疏数组的正确处理
 * - 方法调用：数组方法需要特殊处理
 */
export interface ProxyArrayState extends ProxyBaseState {
	/**
	 * type_ - 架构类型标识
	 * 固定为ArchType.Array，用于数组特有的处理逻辑
	 */
	type_: ArchType.Array

	/**
	 * base_ - 原始数组引用
	 * 类型明确为AnyArray，确保类型安全
	 */
	base_: AnyArray

	/**
	 * copy_ - 数组副本
	 * 可能为null，表示尚未创建副本
	 */
	copy_: AnyArray | null

	/**
	 * draft_ - 草稿数组引用
	 * 指向用户操作的草稿数组
	 */
	draft_: Drafted<AnyArray, ProxyArrayState>
}

/**
 * ProxyState - 代理状态联合类型
 *
 * 将对象和数组的代理状态统一为一个类型，
 * 便于编写通用的处理逻辑。
 */
type ProxyState = ProxyObjectState | ProxyArrayState

/**
 * createProxyProxy - 创建Proxy代理草稿
 *
 * 这是创建草稿对象的核心函数，通过ES6 Proxy实现对象的草稿化。
 * 它会根据对象类型选择合适的代理策略，并建立完整的状态管理。
 *
 * 工作流程：
 * 1. 检测对象类型（对象vs数组）
 * 2. 创建状态对象，包含所有必要的元数据
 * 3. 选择合适的代理陷阱处理器
 * 4. 创建可撤销的Proxy对象
 * 5. 建立双向引用关系
 *
 * 设计亮点：
 * - 类型检测：自动识别对象和数组
 * - 状态管理：完整的生命周期管理
 * - 性能优化：延迟创建和智能缓存
 * - 错误处理：撤销机制和异常安全
 *
 * @template T - 原始对象的类型
 * @param base - 要代理的原始对象
 * @param parent - 父级草稿状态（用于嵌套对象）
 * @returns 草稿化的代理对象
 */
export function createProxyProxy<T extends Objectish>(
	base: T,
	parent?: ImmerState
): Drafted<T, ProxyState> {
	// 类型检测：区分数组和普通对象
	const isArray = Array.isArray(base)

	// 创建代理状态对象
	const state: ProxyState = {
		// 类型标识：数组或对象
		type_: isArray ? ArchType.Array : (ArchType.Object as any),

		// 作用域管理：继承父级作用域或使用当前作用域
		scope_: parent ? parent.scope_ : getCurrentScope()!,

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
		draft_: null as any,

		// 修改副本：延迟创建
		copy_: null,

		// 撤销函数：稍后设置
		revoke_: null as any,

		// 手动标记：false表示自动管理
		isManual_: false
	}

	// Proxy需要一个目标对象，但我们也需要能够从目标确定相关的状态
	// （为了避免为每个实例创建陷阱来捕获闭包中的状态，
	// 以及避免创建奇怪的隐藏属性）
	// 所以技巧是使用'state'作为实际的'target'！（并确保我们拦截一切）
	// 注意：对于数组，我们将状态放在数组中以获得更好的默认Reflect行为
	let target: T = state as any
	let traps: ProxyHandler<object | Array<any>> = objectTraps

	if (isArray) {
		// 数组特殊处理：将状态包装在数组中
		target = [state] as any
		traps = arrayTraps
	}

	// 创建可撤销的Proxy
	const {revoke, proxy} = Proxy.revocable(target, traps)

	// 建立双向引用
	state.draft_ = proxy as any
	state.revoke_ = revoke

	return proxy as any
}

/**
 * objectTraps - 对象代理陷阱处理器
 *
 * 这是Proxy的核心，定义了如何拦截和处理对象的各种操作。
 * 每个陷阱函数都实现了特定的代理逻辑，确保草稿化的正确性。
 *
 * 设计原则：
 * - 透明性：对用户完全透明，像操作普通对象
 * - 延迟性：只在需要时执行昂贵操作
 * - 一致性：保持JavaScript语义的一致性
 * - 性能：优化常见操作的执行路径
 */
export const objectTraps: ProxyHandler<ProxyState> = {
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
		// 特殊属性：返回草稿状态
		if (prop === DRAFT_STATE) return state

		// 获取最新状态（可能是base或copy）
		const source = latest(state)

		// 属性不存在：从原型链查找
		if (!has(source, prop)) {
			return readPropFromProto(state, source, prop)
		}

		const value = source[prop]

		// 快速路径：已最终化或不可草稿化的值直接返回
		if (state.finalized_ || !isDraftable(value)) {
			return value
		}

		// 检查是否需要创建嵌套草稿
		// 如果值与base中的相同，说明这是第一次访问，需要创建草稿
		if (value === peek(state.base_, prop)) {
			// 准备副本（如果还没有的话）
			prepareCopy(state)
			// 创建嵌套草稿并缓存
			return (state.copy_![prop as any] = createProxy(value, state))
		}

		// 值已经被修改过，直接返回
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
	set(
		state: ProxyObjectState,
		prop: string /* 严格来说不是，但有助于TS类型推导 */,
		value
	) {
		// 检查属性描述符，特别是setter
		const desc = getDescriptorFromProto(latest(state), prop)
		if (desc?.set) {
			// 特殊情况：如果有setter，需要用正确的上下文调用
			desc.set.call(state.draft_, value)
			return true
		}

		// 性能优化：检查是否真的需要修改
		if (!state.modified_) {
			// 获取当前值进行比较
			const current = peek(latest(state), prop)

			// 特殊情况：如果赋值的是草稿的原始值，可以忽略赋值
			const currentState: ProxyObjectState = current?.[DRAFT_STATE]
			if (currentState && currentState.base_ === value) {
				state.copy_![prop] = value
				state.assigned_[prop] = false
				return true
			}

			// 值相同检查：如果值没有变化，直接返回
			if (is(value, current) && (value !== undefined || has(state.base_, prop)))
				return true

			// 准备修改：创建副本并标记修改
			prepareCopy(state)
			markChanged(state)
		}

		// 重复赋值检查：避免设置相同的值
		if (
			(state.copy_![prop] === value &&
				// 特殊情况：处理值为undefined的新属性
				(value !== undefined || prop in state.copy_)) ||
			// 特殊情况：NaN的处理
			(Number.isNaN(value) && Number.isNaN(state.copy_![prop]))
		)
			return true

		// 执行实际的赋值操作
		// @ts-ignore
		state.copy_![prop] = value
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
	deleteProperty(state, prop: string) {
		// 检查属性是否存在（undefined检查是快速路径）
		if (peek(state.base_, prop) !== undefined || prop in state.base_) {
			// 标记为删除
			state.assigned_[prop] = false
			prepareCopy(state)
			markChanged(state)
		} else {
			// 如果是原本就不存在的属性，删除分配记录
			delete state.assigned_[prop]
		}

		// 从副本中删除
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
			configurable: state.type_ !== ArchType.Array || prop !== "length",
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
		die(11) // 抛出错误：不允许defineProperty
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
		die(12) // 抛出错误：不允许setPrototypeOf
	}
}

/**
 * arrayTraps - 数组代理陷阱处理器
 *
 * 数组的代理处理基本上继承对象的处理逻辑，但需要一些特殊调整。
 * 主要差异在于数组的target是[state]而不是state本身。
 *
 * 实现策略：
 * - 复用逻辑：大部分陷阱直接复用objectTraps
 * - 参数调整：将arguments[0]从[state]调整为state
 * - 特殊处理：delete和set操作有数组特有的逻辑
 */
const arrayTraps: ProxyHandler<[ProxyArrayState]> = {}

// 复制对象陷阱，但调整第一个参数
each(objectTraps, (key, fn) => {
	// @ts-ignore
	arrayTraps[key] = function() {
		// 将[state]调整为state
		arguments[0] = arguments[0][0]
		return fn.apply(this, arguments)
	}
})

/**
 * 数组删除操作的特殊处理
 *
 * 数组只应该删除数字索引，删除其他属性会导致错误。
 * 实际上，数组的删除会转换为设置undefined。
 */
arrayTraps.deleteProperty = function(state, prop) {
	// 开发环境检查：只允许删除数字索引
	if (process.env.NODE_ENV !== "production" && isNaN(parseInt(prop as any)))
		die(13)

	// 将删除转换为设置undefined
	// @ts-ignore
	return arrayTraps.set!.call(this, state, prop, undefined)
}

/**
 * 数组设置操作的特殊处理
 *
 * 数组只应该设置数字索引和length属性，其他操作会导致错误。
 */
arrayTraps.set = function(state, prop, value) {
	// 开发环境检查：只允许设置数字索引和length
	if (
		process.env.NODE_ENV !== "production" &&
		prop !== "length" &&
		isNaN(parseInt(prop as any))
	)
		die(14)

	// 委托给对象的set处理
	return objectTraps.set!.call(this, state[0], prop, value, state[0])
}

/* ==================== 辅助函数 ==================== */

/**
 * peek - 无副作用的属性访问
 *
 * 访问草稿的属性而不创建嵌套草稿。主要用于比较操作。
 *
 * @param draft - 草稿对象
 * @param prop - 属性键
 * @returns 属性值（不会是草稿）
 */
function peek(draft: Drafted, prop: PropertyKey) {
	const state = draft[DRAFT_STATE]
	const source = state ? latest(state) : draft
	return source[prop]
}

/**
 * readPropFromProto - 从原型链读取属性
 *
 * 当属性不存在于对象自身时，从原型链查找。
 * 特别处理getter属性，确保正确的this绑定。
 *
 * @param state - 草稿状态
 * @param source - 源对象
 * @param prop - 属性键
 * @returns 属性值或undefined
 */
function readPropFromProto(state: ImmerState, source: any, prop: PropertyKey) {
	const desc = getDescriptorFromProto(source, prop)
	return desc
		? `value` in desc
			? desc.value
			: // 特殊情况：如果是原型定义的getter，需要用草稿作为上下文调用
			  desc.get?.call(state.draft_)
		: undefined
}

/**
 * getDescriptorFromProto - 从原型链获取属性描述符
 *
 * 沿着原型链查找属性描述符，用于处理继承的属性。
 *
 * @param source - 源对象
 * @param prop - 属性键
 * @returns 属性描述符或undefined
 */
function getDescriptorFromProto(
	source: any,
	prop: PropertyKey
): PropertyDescriptor | undefined {
	// 'in'检查包括原型链
	if (!(prop in source)) return undefined

	let proto = getPrototypeOf(source)
	while (proto) {
		const desc = Object.getOwnPropertyDescriptor(proto, prop)
		if (desc) return desc
		proto = getPrototypeOf(proto)
	}
	return undefined
}

/**
 * markChanged - 标记草稿为已修改
 *
 * 递归地标记草稿及其所有父级为已修改状态。
 * 这确保了变更会正确地冒泡到根级别。
 *
 * @param state - 要标记的草稿状态
 */
export function markChanged(state: ImmerState) {
	if (!state.modified_) {
		state.modified_ = true
		// 递归标记父级
		if (state.parent_) {
			markChanged(state.parent_)
		}
	}
}

/**
 * prepareCopy - 准备对象副本
 *
 * 延迟创建对象的副本，只在真正需要修改时才执行。
 * 这是写时复制策略的核心实现。
 *
 * @param state - 需要副本的状态对象
 */
export function prepareCopy(state: {
	base_: any
	copy_: any
	scope_: ImmerScope
}) {
	if (!state.copy_) {
		state.copy_ = shallowCopy(
			state.base_,
			state.scope_.immer_.useStrictShallowCopy_
		)
	}
}

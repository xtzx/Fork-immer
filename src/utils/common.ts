// 导入 immer 内部使用的核心类型和常量
// 这个文件是 immer 的工具函数集合，提供底层的对象操作和类型判断能力
import {
	DRAFT_STATE,    // 草稿状态的 Symbol 键，用于标识代理对象
	DRAFTABLE,      // 可代理标记 Symbol，用于自定义类的代理支持
	Objectish,      // 类对象类型（对象、数组、Map、Set）
	Drafted,        // 已代理的草稿对象类型
	AnyObject,      // 任意普通对象类型
	AnyMap,         // 任意 Map 类型
	AnySet,         // 任意 Set 类型
	ImmerState,     // 草稿对象的内部状态结构
	ArchType,       // 架构类型枚举（Object/Array/Map/Set）
	die,            // 错误处理函数
	StrictMode      // 严格模式配置类型
} from "../internal"

/**
 * 获取对象原型的快捷方式
 * 频繁使用，提取为常量以提升性能和可读性
 */
export const getPrototypeOf = Object.getPrototypeOf

/**
 * 判断给定值是否为 Immer 草稿对象
 *
 * 原理：草稿对象都有 DRAFT_STATE 属性，这是 immer 的核心标识
 *
 * 性能优化：
 * - 使用 pure 注释标记为纯函数，支持 tree-shaking
 * - 短路求值：先检查 value 真值性，再检查 DRAFT_STATE
 *
 * @param value 要检查的任意值
 * @returns 如果是草稿对象返回 true，否则返回 false
 */
/*#__PURE__*/
export function isDraft(value: any): boolean {
	return !!value && !!value[DRAFT_STATE]
}

/**
 * 判断给定值是否可以被 Immer 代理（核心函数）
 *
 * 这是 immer 最重要的判断函数之一，决定了哪些对象可以享受写时复制的特性
 *
 * 可代理对象类型：
 * 1. 普通对象（字面量对象、Object.create(null) 等）
 * 2. 数组（Array 实例）
 * 3. 显式标记的对象（通过 DRAFTABLE symbol）
 * 4. 显式标记的类（构造函数上的 DRAFTABLE）
 * 5. Map 实例（需要 MapSet 插件）
 * 6. Set 实例（需要 MapSet 插件）
 *
 * 设计考虑：
 * - 安全性：只代理可安全操作的对象类型
 * - 性能：避免代理复杂对象（如 DOM 节点、Promise 等）
 * - 可扩展性：通过 DRAFTABLE 支持自定义类
 *
 * @param value 要检查的任意值
 * @returns 如果可以被代理返回 true，否则返回 false
 */
/*#__PURE__*/
export function isDraftable(value: any): boolean {
	if (!value) return false  // null、undefined、0、""、false 都不可代理
	return (
		isPlainObject(value) ||           // 普通对象
		Array.isArray(value) ||           // 数组
		!!value[DRAFTABLE] ||            // 实例上的可代理标记
		!!value.constructor?.[DRAFTABLE] || // 构造函数上的可代理标记
		isMap(value) ||                  // Map（插件支持）
		isSet(value)                     // Set（插件支持）
	)
}

/**
 * 缓存 Object 构造函数的字符串表示
 * 用于 isPlainObject 中的快速比较，避免重复调用 toString
 */
const objectCtorString = Object.prototype.constructor.toString()

/**
 * 判断是否为普通对象（Plain Object）
 *
 * 普通对象定义：
 * 1. 字面量对象：{}
 * 2. Object.create(null) 创建的对象
 * 3. new Object() 创建的对象
 * 4. 原型链简单的对象
 *
 * 非普通对象（不应代理）：
 * - 类实例（除非显式标记）
 * - DOM 节点
 * - 内置对象（Date、RegExp、Promise 等）
 * - 函数对象
 *
 * 算法步骤：
 * 1. 基础类型检查
 * 2. 获取对象原型
 * 3. 处理 null 原型（Object.create(null)）
 * 4. 检查构造函数是否为 Object
 * 5. 通过字符串比较验证构造函数
 *
 * @param value 要检查的值
 * @returns 如果是普通对象返回 true，否则返回 false
 */
/*#__PURE__*/
export function isPlainObject(value: any): boolean {
	// 基础类型检查：非对象或 null 直接返回 false
	if (!value || typeof value !== "object") return false

	// 获取对象的原型
	const proto = getPrototypeOf(value)

	// 处理 Object.create(null) 创建的对象
	if (proto === null) {
		return true  // 无原型的对象被认为是普通对象
	}

	// 获取原型上的构造函数
	const Ctor =
		Object.hasOwnProperty.call(proto, "constructor") && proto.constructor

	// 快速路径：构造函数就是 Object
	if (Ctor === Object) return true

	// 严格验证：通过字符串比较确认构造函数
	// 这种方式可以跨 realm/iframe 工作，因为比较的是函数的字符串表示
	return (
		typeof Ctor == "function" &&
		Function.toString.call(Ctor) === objectCtorString
	)
}

/**
 * 获取草稿对象对应的原始对象
 *
 * 用途：
 * 1. 调试时查看原始数据
 * 2. 比较草稿与原始对象的差异
 * 3. 在某些算法中需要访问未修改的原始值
 *
 * 安全性：只能在草稿对象上调用，否则抛出错误
 *
 * @param value 草稿对象
 * @returns 对应的原始对象，如果不是草稿则返回 undefined
 */
/*#__PURE__*/
export function original<T>(value: T): T | undefined
export function original(value: Drafted<any>): any {
	if (!isDraft(value)) die(15, value)  // 错误：只能在草稿对象上调用
	return value[DRAFT_STATE].base_      // 返回草稿状态中的原始对象
}

/**
 * 统一的遍历函数 - 处理不同数据结构的迭代
 *
 * 支持的数据类型：
 * 1. 普通对象 - 遍历所有自有属性（包括不可枚举和 Symbol）
 * 2. 数组 - 按索引遍历
 * 3. Map - 遍历键值对
 * 4. Set - 遍历元素（索引为元素值）
 *
 * 设计优势：
 * - 统一接口：不同数据结构使用相同的遍历方式
 * - 完整性：包括不可枚举属性和 Symbol 属性
 * - 性能：针对不同类型优化的遍历策略
 *
 * @param obj 要遍历的对象
 * @param iter 迭代回调函数 (key, value, source) => void
 */
export function each<T extends Objectish>(
	obj: T,
	iter: (key: string | number, value: any, source: T) => void
): void
export function each(obj: any, iter: any) {
	if (getArchtype(obj) === ArchType.Object) {
		// 对象类型：遍历所有自有属性
		// 使用 Reflect.ownKeys 获取所有属性（包括 Symbol 和不可枚举）
		Reflect.ownKeys(obj).forEach((key) => {
			iter(key, obj[key], obj)
		})
	} else {
		// 集合类型：使用原生的 forEach 方法
		// 数组、Map、Set 都有 forEach 方法，参数顺序为 (value, key)
		obj.forEach((entry: any, index: any) => iter(index, entry, obj))
	}
}

/**
 * 获取对象的架构类型
 *
 * 架构类型是 immer 对数据结构的分类：
 * - Object: 普通对象
 * - Array: 数组
 * - Map: Map 实例
 * - Set: Set 实例
 *
 * 判断优先级：
 * 1. 如果是草稿对象，直接从状态中获取类型
 * 2. 否则通过运行时检查确定类型
 *
 * 性能优化：草稿对象的类型已确定，避免重复检查
 *
 * @param thing 要检查的对象
 * @returns 对应的架构类型枚举值
 */
/*#__PURE__*/
export function getArchtype(thing: any): ArchType {
	const state: undefined | ImmerState = thing[DRAFT_STATE]
	return state
		? state.type_                    // 草稿对象：从状态中直接获取
		: Array.isArray(thing)          // 非草稿：运行时检查
		? ArchType.Array
		: isMap(thing)
		? ArchType.Map
		: isSet(thing)
		? ArchType.Set
		: ArchType.Object
}

/**
 * 统一的属性存在性检查
 *
 * 处理不同数据结构的属性检查：
 * - Map: 使用 has() 方法
 * - 其他: 使用 hasOwnProperty 检查
 *
 * 设计考虑：
 * - Map 的 has 检查键的存在性
 * - Object 的 hasOwnProperty 检查自有属性
 * - 统一接口简化上层逻辑
 *
 * @param thing 要检查的对象
 * @param prop 属性键
 * @returns 如果属性存在返回 true，否则返回 false
 */
/*#__PURE__*/
export function has(thing: any, prop: PropertyKey): boolean {
	return getArchtype(thing) === ArchType.Map
		? thing.has(prop)                                    // Map: 使用原生 has 方法
		: Object.prototype.hasOwnProperty.call(thing, prop)  // Object: 检查自有属性
}

/**
 * 统一的属性读取函数
 *
 * 处理不同数据结构的属性访问：
 * - Map: 使用 get() 方法
 * - 其他: 使用方括号语法
 *
 * @param thing 要读取的对象
 * @param prop 属性键
 * @returns 属性值
 */
/*#__PURE__*/
export function get(thing: AnyMap | AnyObject, prop: PropertyKey): any {
	// @ts-ignore - 类型系统限制，运行时是安全的
	return getArchtype(thing) === ArchType.Map ? thing.get(prop) : thing[prop]
}

/**
 * 统一的属性设置函数
 *
 * 处理不同数据结构的属性写入：
 * - Map: 使用 set(key, value) 方法
 * - Set: 使用 add(value) 方法（忽略 key）
 * - 其他: 使用方括号赋值语法
 *
 * 注意：Set 的语义特殊，只关心值不关心键
 *
 * @param thing 要修改的对象
 * @param propOrOldValue 属性键（对 Set 而言是要删除的旧值）
 * @param value 要设置的值
 */
/*#__PURE__*/
export function set(thing: any, propOrOldValue: PropertyKey, value: any) {
	const t = getArchtype(thing)
	if (t === ArchType.Map) thing.set(propOrOldValue, value)      // Map: key-value 设置
	else if (t === ArchType.Set) {
		thing.add(value)                                          // Set: 只添加值
	} else thing[propOrOldValue] = value                          // Object: 属性赋值
}

/**
 * 特殊的相等性判断（Object.is 的兼容实现）
 *
 * 与 === 的区别：
 * 1. NaN === NaN 返回 false，但 is(NaN, NaN) 返回 true
 * 2. +0 === -0 返回 true，但 is(+0, -0) 返回 false
 *
 * 用途：
 * - 准确的值比较，特别是浮点数和 NaN
 * - 检测状态是否真正发生变化
 * - 优化：避免不必要的更新
 *
 * 实现来源：Facebook 的 fbjs 库，经过实战验证
 *
 * @param x 第一个值
 * @param y 第二个值
 * @returns 如果两个值相等返回 true，否则返回 false
 */
/*#__PURE__*/
export function is(x: any, y: any): boolean {
	// From: https://github.com/facebook/fbjs/blob/c69904a511b900266935168223063dd8772dfc40/packages/fbjs/src/core/shallowEqual.js
	if (x === y) {
		// 处理 +0 和 -0 的区别
		// 1/+0 = +Infinity, 1/-0 = -Infinity
		return x !== 0 || 1 / x === 1 / y
	} else {
		// 处理 NaN 的比较
		// NaN !== NaN 为 true，所以当 x !== x && y !== y 时，说明都是 NaN
		return x !== x && y !== y
	}
}

/**
 * Map 类型检查
 *
 * 简单但重要的类型守卫函数
 * 使用 instanceof 进行准确的类型检查
 *
 * @param target 要检查的值
 * @returns 如果是 Map 实例返回 true，否则返回 false
 */
/*#__PURE__*/
export function isMap(target: any): target is AnyMap {
	return target instanceof Map
}

/**
 * Set 类型检查
 *
 * 简单但重要的类型守卫函数
 * 使用 instanceof 进行准确的类型检查
 *
 * @param target 要检查的值
 * @returns 如果是 Set 实例返回 true，否则返回 false
 */
/*#__PURE__*/
export function isSet(target: any): target is AnySet {
	return target instanceof Set
}

/**
 * 获取草稿状态的最新值
 *
 * 逻辑：
 * - 如果已经有拷贝（copy_），返回拷贝（表示已修改）
 * - 否则返回基础值（base_）（表示未修改）
 *
 * 这是写时复制的核心：只有在真正修改时才创建拷贝
 *
 * @param state 草稿对象的内部状态
 * @returns 当前最新的值（拷贝或原始值）
 */
/*#__PURE__*/
export function latest(state: ImmerState): any {
	return state.copy_ || state.base_
}

/**
 * 浅拷贝函数 - immer 写时复制的核心实现
 *
 * 这是 immer 最关键的函数之一，负责在需要修改时创建对象的浅拷贝
 *
 * 支持的数据类型：
 * 1. Map -> 新的 Map 实例
 * 2. Set -> 新的 Set 实例
 * 3. Array -> slice() 拷贝
 * 4. Object -> 根据严格模式决定拷贝策略
 *
 * 严格模式 (strict) 的影响：
 * - true: 完整拷贝所有属性描述符（getter、setter、可枚举性等）
 * - "class_only": 只对非普通对象（类实例）使用严格拷贝
 * - false: 简单拷贝，性能更好但可能丢失属性描述符
 *
 * 性能考虑：
 * - 优先使用原生方法（Map构造函数、Set构造函数、Array.slice）
 * - 对于普通对象，优先使用扩展语法（{...base}）
 * - 严格模式的完整拷贝较慢，仅在必要时使用
 *
 * @param base 要拷贝的原始对象
 * @param strict 严格模式配置
 * @returns 浅拷贝后的新对象
 */
/*#__PURE__*/
export function shallowCopy(base: any, strict: StrictMode) {
	// Map 类型：使用构造函数拷贝
	if (isMap(base)) {
		return new Map(base)
	}

	// Set 类型：使用构造函数拷贝
	if (isSet(base)) {
		return new Set(base)
	}

	// 数组类型：使用 slice 方法拷贝
	if (Array.isArray(base)) return Array.prototype.slice.call(base)

	// 对象类型：根据严格模式选择拷贝策略
	const isPlain = isPlainObject(base)

	if (strict === true || (strict === "class_only" && !isPlain)) {
		// 严格拷贝模式：完整保留属性描述符

		// 1. 获取所有属性描述符（包括 getter、setter、可枚举性等）
		const descriptors = Object.getOwnPropertyDescriptors(base)

		// 2. 移除 DRAFT_STATE 描述符（避免拷贝内部状态）
		delete descriptors[DRAFT_STATE as any]

		// 3. 处理所有属性描述符
		let keys = Reflect.ownKeys(descriptors)
		for (let i = 0; i < keys.length; i++) {
			const key: any = keys[i]
			const desc = descriptors[key]

			// 4. 确保属性可写和可配置（避免拷贝后无法修改）
			if (desc.writable === false) {
				desc.writable = true
				desc.configurable = true
			}

			// 5. 特殊处理 getter/setter：转换为普通属性
			// 这样做是为了兼容某些库（如 MobX、Vue）的 trap 行为
			// 与 Object.assign 类似，读取访问器的当前值并转为数据属性
			if (desc.get || desc.set)
				descriptors[key] = {
					configurable: true,
					writable: true,     // 也可以用 !!desc.set 来决定是否可写
					enumerable: desc.enumerable,
					value: base[key]   // 读取当前值，避免 getter 的副作用
				}
		}

		// 6. 使用描述符创建新对象，保持原型链
		return Object.create(getPrototypeOf(base), descriptors)
	} else {
		// 普通拷贝模式：性能优先的简单拷贝

		const proto = getPrototypeOf(base)
		if (proto !== null && isPlain) {
			// 普通对象优化：使用扩展语法
			// 假设：引擎对扩展语法有更好的内部优化
			return {...base}
		}

		// 其他对象：创建同原型的对象并赋值属性
		const obj = Object.create(proto)
		return Object.assign(obj, base)
	}
}

/**
 * 冻结可草稿化对象
 *
 * 这个函数实现了 immer 的自动冻结功能，确保返回的不可变对象真正不可修改
 *
 * 冻结策略：
 * 1. 跳过已冻结的对象（性能优化）
 * 2. 跳过草稿对象（草稿仍需修改）
 * 3. 跳过不可草稿化对象（如 DOM 节点等）
 * 4. 对 Map/Set 禁用修改方法
 * 5. 使用 Object.freeze 冻结对象
 * 6. 可选的深度冻结
 *
 * 深度冻结的限制：
 * - 只遍历可枚举的字符串属性（性能考虑）
 * - 不冻结 Symbol 属性和不可枚举属性
 * - 参考 issue #590 的讨论
 *
 * @param obj 要冻结的对象
 * @param deep 是否深度冻结（递归冻结嵌套对象）
 * @returns 冻结后的对象（与输入相同）
 */
export function freeze<T>(obj: T, deep?: boolean): T
export function freeze<T>(obj: any, deep: boolean = false): T {
	// 跳过条件：已冻结、是草稿、不可草稿化
	if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj)) return obj

	// 特殊处理：Map 和 Set 的修改方法禁用
	if (getArchtype(obj) > 1 /* Map or Set */) {
		// 将修改方法替换为错误函数，保持接口一致但禁止修改
		obj.set =
			obj.add =
			obj.clear =
			obj.delete =
				dontMutateFrozenCollections as any
	}

	// 冻结对象本身
	Object.freeze(obj)

	if (deep)
		// 深度冻结：递归处理所有值
		// 注意：只处理 Object.values 返回的可枚举属性
		// 不处理 Symbol 属性和不可枚举属性（性能考虑）
		Object.values(obj).forEach((value) => freeze(value, true))

	return obj
}

/**
 * 冻结集合的错误处理函数
 *
 * 当尝试修改已冻结的 Map 或 Set 时，调用此函数抛出错误
 * 提供清晰的错误信息，帮助开发者理解不可变约束
 */
function dontMutateFrozenCollections() {
	die(2)  // 错误代码 2：尝试修改冻结的集合
}

/**
 * 检查对象是否已冻结
 *
 * 简单包装 Object.isFrozen，提供一致的 API 接口
 *
 * @param obj 要检查的对象
 * @returns 如果对象已冻结返回 true，否则返回 false
 */
export function isFrozen(obj: any): boolean {
	return Object.isFrozen(obj)
}

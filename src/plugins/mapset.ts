/**
 * mapset.ts - Map和Set数据结构支持插件
 *
 * 这个插件为ES6的Map和Set提供草稿化支持。由于Map和Set的特殊性质，
 * 它们不能使用标准的Proxy属性劫持，需要专门的实现策略。
 *
 * 核心挑战：
 * - 方法劫持：Map/Set的操作通过方法而不是属性
 * - 迭代顺序：必须保持严格的插入顺序语义
 * - 值唯一性：Set的值唯一性约束需要特殊处理
 * - 嵌套草稿：Map/Set中的值可能也需要草稿化
 *
 * 设计策略：
 * - 类继承：通过继承Map/Set重写关键方法
 * - 延迟拷贝：copy_在首次修改时创建
 * - 状态跟踪：assigned_记录键的修改状态
 * - 双重映射：Set使用drafts_映射原始值到草稿值
 *
 * 性能考虑：
 * - 懒初始化：避免不必要的Map/Set创建
 * - 引用复用：未修改的值保持原始引用
 * - 迭代优化：特殊处理迭代器和forEach
 */

// 仅导入类型！
import {
	ImmerState,
	AnyMap,
	AnySet,
	MapState,
	SetState,
	DRAFT_STATE,
	getCurrentScope,
	latest,
	isDraftable,
	createProxy,
	loadPlugin,
	markChanged,
	die,
	ArchType,
	each
} from "../internal"

/**
 * enableMapSet - 启用Map和Set支持
 *
 * 这是插件的入口函数，定义了DraftMap和DraftSet类，
 * 并将它们注册到插件系统中。只有调用此函数后，
 * immer才能处理Map和Set对象。
 *
 * 插件加载：
 * - 延迟加载：只在调用时才定义类和加载插件
 * - 一次性：重复调用不会产生副作用
 * - 类型安全：完整的TypeScript类型支持
 */
export function enableMapSet() {
	/**
	 * DraftMap - Map的草稿实现类
	 *
	 * 通过继承原生Map类并重写关键方法来实现草稿化。
	 * 每个方法都会检查和更新内部状态，确保正确的
	 * 写时复制行为。
	 *
	 * 核心特性：
	 * - 透明接口：与原生Map完全兼容的API
	 * - 延迟拷贝：只在实际修改时创建副本
	 * - 状态跟踪：精确记录哪些键被修改
	 * - 嵌套支持：自动处理值的草稿化
	 */
	class DraftMap extends Map {
		/**
		 * 草稿状态标识
		 * 使用Symbol键存储Map的草稿状态信息
		 */
		[DRAFT_STATE]: MapState

		/**
		 * 构造函数 - 初始化Map草稿
		 *
		 * @param target - 要草稿化的原始Map
		 * @param parent - 父级草稿状态（用于嵌套）
		 */
		constructor(target: AnyMap, parent?: ImmerState) {
			super() // 调用原生Map构造函数

			// 初始化草稿状态
			this[DRAFT_STATE] = {
				type_: ArchType.Map,                          // 类型标识
				parent_: parent,                              // 父级状态
				scope_: parent ? parent.scope_ : getCurrentScope()!, // 作用域
				modified_: false,                             // 修改标记
				finalized_: false,                            // 最终化标记
				copy_: undefined,                             // 副本（懒创建）
				assigned_: undefined,                         // 分配跟踪（懒创建）
				base_: target,                                // 原始Map
				draft_: this as any,                          // 草稿引用
				isManual_: false,                             // 自动管理
				revoked_: false                               // 撤销标记
			}
		}

		/**
		 * size属性 - 获取Map大小
		 *
		 * 返回当前有效状态的大小。如果已修改，返回copy的大小；
		 * 否则返回base的大小。
		 */
		get size(): number {
			return latest(this[DRAFT_STATE]).size
		}

		/**
		 * has方法 - 检查键是否存在
		 *
		 * @param key - 要检查的键
		 * @returns 键是否存在
		 */
		has(key: any): boolean {
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
		set(key: any, value: any) {
			const state: MapState = this[DRAFT_STATE]
			// 安全检查：确保代理未被撤销
			assertUnrevoked(state)

			// 检查是否为真实的变更
			if (!latest(state).has(key) || latest(state).get(key) !== value) {
				// 准备副本和分配跟踪
				prepareMapCopy(state)
				// 标记为已修改
				markChanged(state)
				// 记录键的分配状态
				state.assigned_!.set(key, true)
				// 设置新值
				state.copy_!.set(key, value)
				// 重复记录（确保状态一致性）
				state.assigned_!.set(key, true)
			}
			return this
		}

		/**
		 * delete方法 - 删除键值对
		 *
		 * @param key - 要删除的键
		 * @returns 是否成功删除
		 */
		delete(key: any): boolean {
			// 快速检查：键不存在直接返回false
			if (!this.has(key)) {
				return false
			}

			const state: MapState = this[DRAFT_STATE]
			assertUnrevoked(state)

			// 准备修改
			prepareMapCopy(state)
			markChanged(state)

			// 更新分配跟踪
			if (state.base_.has(key)) {
				// 原本存在的键标记为删除
				state.assigned_!.set(key, false)
			} else {
				// 新添加后又删除的键直接移除跟踪
				state.assigned_!.delete(key)
			}

			// 从副本中删除
			state.copy_!.delete(key)
			return true
		}

		/**
		 * clear方法 - 清空Map
		 *
		 * 删除所有键值对，等同于删除每个键。
		 */
		clear() {
			const state: MapState = this[DRAFT_STATE]
			assertUnrevoked(state)

			// 只有在非空时才需要处理
			if (latest(state).size) {
				prepareMapCopy(state)
				markChanged(state)

				// 重置分配跟踪
				state.assigned_ = new Map()
				// 将所有原始键标记为删除
				each(state.base_, key => {
					state.assigned_!.set(key, false)
				})
				// 清空副本
				state.copy_!.clear()
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
		forEach(cb: (value: any, key: any, self: any) => void, thisArg?: any) {
			const state: MapState = this[DRAFT_STATE]
			// 遍历最新状态，但通过get方法获取可能的草稿值
			latest(state).forEach((_value: any, key: any, _map: any) => {
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
		get(key: any): any {
			const state: MapState = this[DRAFT_STATE]
			assertUnrevoked(state)

			const value = latest(state).get(key)

			// 快速路径：已最终化或不可草稿化的值
			if (state.finalized_ || !isDraftable(value)) {
				return value
			}

			// 检查是否为新访问的值
			if (value !== state.base_.get(key)) {
				return value // 已经是草稿或被重新赋值
			}

			// 创建嵌套草稿（只创建一次，参见上面的条件）
			const draft = createProxy(value, state)
			prepareMapCopy(state)
			state.copy_!.set(key, draft)
			return draft
		}

		/**
		 * keys方法 - 获取键的迭代器
		 *
		 * @returns 键的迭代器
		 */
		keys(): IterableIterator<any> {
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
		values(): IterableIterator<any> {
			const iterator = this.keys()
			return {
				[Symbol.iterator]: () => this.values(),
				next: () => {
					const r = iterator.next()
					/* istanbul ignore next */
					if (r.done) return r
					// 通过get方法获取可能的草稿值
					const value = this.get(r.value)
					return {
						done: false,
						value
					}
				}
			} as any
		}

		/**
		 * entries方法 - 获取键值对的迭代器
		 *
		 * @returns 键值对的迭代器
		 */
		entries(): IterableIterator<[any, any]> {
			const iterator = this.keys()
			return {
				[Symbol.iterator]: () => this.entries(),
				next: () => {
					const r = iterator.next()
					/* istanbul ignore next */
					if (r.done) return r
					// 通过get方法获取可能的草稿值
					const value = this.get(r.value)
					return {
						done: false,
						value: [r.value, value]
					}
				}
			} as any
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

	/**
	 * proxyMap_ - 创建Map代理
	 *
	 * @param target - 要代理的原始Map
	 * @param parent - 父级草稿状态
	 * @returns Map的草稿代理
	 */
	function proxyMap_<T extends AnyMap>(target: T, parent?: ImmerState): T {
		// @ts-ignore
		return new DraftMap(target, parent)
	}

	/**
	 * prepareMapCopy - 准备Map的副本
	 *
	 * 延迟创建Map的副本和分配跟踪。这是写时复制的核心实现。
	 *
	 * @param state - Map的草稿状态
	 */
	function prepareMapCopy(state: MapState) {
		if (!state.copy_) {
			// 创建分配跟踪表
			state.assigned_ = new Map()
			// 创建原始Map的副本
			state.copy_ = new Map(state.base_)
		}
	}

	/**
	 * DraftSet - Set的草稿实现类
	 *
	 * Set的草稿化比Map更复杂，因为：
	 * 1. Set中的值可能需要草稿化
	 * 2. 需要正确匹配原始值和草稿值
	 * 3. 必须保持值的唯一性约束
	 * 4. 插入顺序必须保持
	 */
	class DraftSet extends Set {
		[DRAFT_STATE]: SetState

		constructor(target: AnySet, parent?: ImmerState) {
			super()
			this[DRAFT_STATE] = {
				type_: ArchType.Set,
				parent_: parent,
				scope_: parent ? parent.scope_ : getCurrentScope()!,
				modified_: false,
				finalized_: false,
				copy_: undefined,                             // Set副本
				base_: target,                                // 原始Set
				draft_: this,                                 // 草稿引用
				drafts_: new Map(),                           // 原始值→草稿值映射
				revoked_: false,
				isManual_: false
			}
		}

		/**
		 * size属性 - 获取Set大小
		 */
		get size(): number {
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
		has(value: any): boolean {
			const state: SetState = this[DRAFT_STATE]
			assertUnrevoked(state)

			// 复杂的检查逻辑：能够识别值和其草稿版本
			if (!state.copy_) {
				return state.base_.has(value)
			}
			if (state.copy_.has(value)) return true
			// 检查是否存在对应的草稿值
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
		add(value: any): any {
			const state: SetState = this[DRAFT_STATE]
			assertUnrevoked(state)

			if (!this.has(value)) {
				prepareSetCopy(state)
				markChanged(state)
				state.copy_!.add(value)
			}
			return this
		}

		/**
		 * delete方法 - 删除值
		 *
		 * @param value - 要删除的值
		 * @returns 是否成功删除
		 */
		delete(value: any): any {
			if (!this.has(value)) {
				return false
			}

			const state: SetState = this[DRAFT_STATE]
			assertUnrevoked(state)
			prepareSetCopy(state)
			markChanged(state)

			// 尝试删除原始值或对应的草稿值
			return (
				state.copy_!.delete(value) ||
				(state.drafts_.has(value)
					? state.copy_!.delete(state.drafts_.get(value))
					: /* istanbul ignore next */ false)
			)
		}

		/**
		 * clear方法 - 清空Set
		 */
		clear() {
			const state: SetState = this[DRAFT_STATE]
			assertUnrevoked(state)

			if (latest(state).size) {
				prepareSetCopy(state)
				markChanged(state)
				state.copy_!.clear()
			}
		}

		/**
		 * values方法 - 获取值的迭代器
		 *
		 * 注意：为了保持插入顺序和正确处理草稿值，
		 * 我们需要准备副本并返回副本的迭代器
		 */
		values(): IterableIterator<any> {
			const state: SetState = this[DRAFT_STATE]
			assertUnrevoked(state)
			prepareSetCopy(state)
			return state.copy_!.values()
		}

		/**
		 * entries方法 - 获取值对的迭代器
		 *
		 * Set的entries返回[value, value]格式
		 */
		entries(): IterableIterator<[any, any]> {
			const state: SetState = this[DRAFT_STATE]
			assertUnrevoked(state)
			prepareSetCopy(state)
			return state.copy_!.entries()
		}

		/**
		 * keys方法 - 获取键的迭代器
		 *
		 * 对于Set，keys等同于values
		 */
		keys(): IterableIterator<any> {
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
		forEach(cb: any, thisArg?: any) {
			const iterator = this.values()
			let result = iterator.next()
			while (!result.done) {
				cb.call(thisArg, result.value, result.value, this)
				result = iterator.next()
			}
		}
	}

	/**
	 * proxySet_ - 创建Set代理
	 *
	 * @param target - 要代理的原始Set
	 * @param parent - 父级草稿状态
	 * @returns Set的草稿代理
	 */
	function proxySet_<T extends AnySet>(target: T, parent?: ImmerState): T {
		// @ts-ignore
		return new DraftSet(target, parent)
	}

	/**
	 * prepareSetCopy - 准备Set的副本
	 *
	 * Set的副本准备是最复杂的，因为需要处理值的草稿化
	 * 并建立原始值到草稿值的映射关系。
	 *
	 * @param state - Set的草稿状态
	 */
	function prepareSetCopy(state: SetState) {
		if (!state.copy_) {
			// 创建新的Set副本
			state.copy_ = new Set()

			// 遍历原始Set，为每个值创建草稿（如果需要）
			state.base_.forEach(value => {
				if (isDraftable(value)) {
					// 可草稿化的值：创建草稿并建立映射
					const draft = createProxy(value, state)
					state.drafts_.set(value, draft)
					state.copy_!.add(draft)
				} else {
					// 不可草稿化的值：直接添加
					state.copy_!.add(value)
				}
			})
		}
	}

	/**
	 * assertUnrevoked - 检查状态是否已撤销
	 *
	 * 确保代理对象仍然可用，如果已撤销则抛出错误
	 *
	 * @param state - 要检查的状态对象
	 */
	function assertUnrevoked(state: any /*ES5State | MapState | SetState*/) {
		if (state.revoked_) die(3, JSON.stringify(latest(state)))
	}

	// 加载插件到系统中
	loadPlugin("MapSet", {proxyMap_, proxySet_})
}

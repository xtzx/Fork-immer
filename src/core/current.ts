/**
 * current.ts - 草稿状态快照功能
 *
 * 这个模块提供了获取草稿对象当前状态快照的功能。由于草稿对象内部使用Proxy实现，
 * 在调试或检查状态时很难直接观察到实际的数据结构。current函数解决了这个问题，
 * 它能够创建一个纯净的、可序列化的状态快照，去除所有的Proxy包装。
 *
 * 主要特性：
 * - 移除Proxy包装，返回纯净的对象
 * - 递归处理嵌套的草稿对象
 * - 性能优化：未修改的草稿直接返回base对象
 * - 调试友好：输出可以安全地泄露到producer外部
 */

import {
	die,
	isDraft,
	shallowCopy,
	each,
	DRAFT_STATE,
	set,
	ImmerState,
	isDraftable,
	isFrozen
} from "../internal"

/**
 * 获取草稿对象的当前状态快照
 *
 * 这是一个重要的调试工具，它会创建草稿对象的深度快照，移除所有Proxy包装，
 * 返回一个纯净的、可以安全检查和序列化的对象。这对于调试非常有用，
 * 因为你可以console.log输出而不会看到复杂的Proxy结构。
 *
 * 使用场景：
 * - 调试时检查草稿的当前状态
 * - 需要将草稿状态传递给外部代码
 * - 测试中验证中间状态
 *
 * @param value - 要获取快照的草稿对象
 * @returns 草稿对象的纯净状态快照（移除了所有Proxy包装）
 *
 * @throws 如果传入的值不是草稿对象，会抛出错误
 *
 * @example
 * const draft = produce(baseState, draft => {
 *   draft.user.name = "Alice";
 *   console.log(current(draft)); // 输出纯净的对象，没有Proxy
 * });
 */
export function current<T>(value: T): T
export function current(value: any): any {
	// 安全检查：确保传入的是草稿对象
	if (!isDraft(value)) die(10, value)
	return currentImpl(value)
}

/**
 * current函数的内部实现
 *
 * 这个函数负责递归地处理草稿对象，创建深度快照。它会：
 * 1. 处理不同类型的值（原始值、冻结对象、草稿对象）
 * 2. 优化性能：未修改的草稿直接返回base对象
 * 3. 递归处理嵌套的草稿对象
 * 4. 临时设置finalized_标志来避免在拷贝过程中创建新的草稿
 *
 * @param value - 要处理的值（可能是草稿对象或普通值）
 * @returns 该值的纯净快照
 */
function currentImpl(value: any): any {
	// 快速路径：如果不是可草稿化的对象或已经冻结，直接返回
	// 这包括：原始类型、函数、已冻结的对象等
	if (!isDraftable(value) || isFrozen(value)) return value

	// 获取草稿状态信息
	const state: ImmerState | undefined = value[DRAFT_STATE]
	let copy: any

	if (state) {
		// 这是一个草稿对象

		// 性能优化：如果草稿未被修改，直接返回base对象
		// 这避免了不必要的拷贝操作
		if (!state.modified_) return state.base_

		// 临时标记为已完成，防止在拷贝过程中创建新的草稿对象
		// 这是一个重要的优化，避免了递归过程中的无限循环
		state.finalized_ = true

		// 创建浅拷贝，使用当前作用域的拷贝策略
		copy = shallowCopy(value, state.scope_.immer_.useStrictShallowCopy_)
	} else {
		// 这不是草稿对象，但可能包含草稿属性，所以也需要处理
		// 使用严格的浅拷贝策略
		copy = shallowCopy(value, true)
	}

	// 递归处理：遍历所有属性，递归调用currentImpl
	// 这确保了嵌套的草稿对象也会被正确处理
	each(copy, (key, childValue) => {
		// 递归处理每个属性值，如果是草稿则获取其快照
		set(copy, key, currentImpl(childValue))
	})

	// 恢复finalized_状态，确保草稿对象的状态不被永久改变
	if (state) {
		state.finalized_ = false
	}

	return copy
}

/**
 * finalize.ts - 草稿最终化处理模块
 *
 * 这个模块是immer工作流程的最后阶段，负责将producer函数执行完成后的草稿对象
 * 转换为最终的不可变结果。最终化过程包括多个关键步骤：
 *
 * 核心功能：
 * - 处理producer函数的返回值（可能是新对象或修改的草稿）
 * - 递归地最终化所有草稿对象和嵌套属性
 * - 生成变更补丁（patches）用于状态跟踪
 * - 根据配置自动冻结对象以确保不可变性
 * - 清理和撤销作用域资源
 *
 * 性能优化：
 * - 跳过未修改的草稿，直接返回base对象
 * - 避免重复最终化已处理的对象
 * - 智能决定是否需要深度冻结
 * - Set对象的特殊处理避免无限循环
 */

import {
	ImmerScope,
	DRAFT_STATE,
	isDraftable,
	NOTHING,
	PatchPath,
	each,
	has,
	freeze,
	ImmerState,
	isDraft,
	SetState,
	set,
	ArchType,
	getPlugin,
	die,
	revokeScope,
	isFrozen
} from "../internal"

/**
 * 处理producer函数的执行结果
 *
 * 这是最终化流程的入口函数，负责处理produce调用的各种情况：
 * 1. producer返回undefined：使用修改后的草稿作为结果
 * 2. producer返回新对象：验证并使用返回值作为结果
 * 3. producer返回NOTHING：表示删除操作，最终返回undefined
 *
 * 关键职责：
 * - 检测是否返回了新对象（替换模式）
 * - 验证替换模式下的合法性（草稿不能既被修改又被替换）
 * - 最终化结果对象及其所有嵌套内容
 * - 生成变更补丁记录
 * - 清理作用域资源
 *
 * @param result - producer函数的返回值
 * @param scope - 当前作用域，包含草稿和配置信息
 * @returns 最终化后的不可变结果
 */
export function processResult(result: any, scope: ImmerScope) {
	// 记录未完成最终化的草稿数量，用于后续优化判断
	scope.unfinalizedDrafts_ = scope.drafts_.length

	// 获取根草稿对象（producer函数的参数）
	const baseDraft = scope.drafts_![0]

	// 检测是否是替换模式：producer返回了新对象而不是修改草稿
	const isReplaced = result !== undefined && result !== baseDraft

	if (isReplaced) {
		// 替换模式：producer返回了新对象

		// 安全检查：在替换模式下，原草稿不应该被修改
		// 这防止了混合使用修改和替换模式导致的不一致状态
		if (baseDraft[DRAFT_STATE].modified_) {
			revokeScope(scope)
			die(4) // 错误：不能既修改草稿又返回新值
		}

		// 如果返回的是可草稿化的对象，需要递归最终化
		// 因为返回值可能包含或就是草稿的子集
		if (isDraftable(result)) {
			result = finalize(scope, result)
			// 只有根作用域才进行冻结，嵌套作用域的冻结由父级处理
			if (!scope.parent_) maybeFreeze(scope, result)
		}

		// 生成替换模式的补丁：记录整个对象被替换
		if (scope.patches_) {
			getPlugin("Patches").generateReplacementPatches_(
				baseDraft[DRAFT_STATE].base_,
				result,
				scope.patches_,
				scope.inversePatches_!
			)
		}
	} else {
		// 标准模式：最终化修改后的草稿对象
		result = finalize(scope, baseDraft, [])
	}

	// 清理作用域：撤销代理、清理资源
	revokeScope(scope)

	// 触发补丁监听器，通知外部变更
	if (scope.patches_) {
		scope.patchListener_!(scope.patches_, scope.inversePatches_!)
	}

	// 处理NOTHING标记：表示删除操作，返回undefined
	return result !== NOTHING ? result : undefined
}

/**
 * 递归最终化草稿对象
 *
 * 这是最终化的核心函数，负责将草稿对象转换为最终的不可变状态。
 * 它会递归处理对象的所有属性，确保嵌套的草稿也被正确最终化。
 *
 * 处理策略：
 * - 已冻结对象：直接返回，避免重复处理
 * - 非草稿对象：递归处理属性，可能包含草稿
 * - 其他作用域的草稿：跳过，避免跨作用域干扰
 * - 未修改的草稿：返回原始base对象
 * - 已修改的草稿：最终化copy对象
 *
 * @param rootScope - 根作用域，用于跟踪整个最终化过程
 * @param value - 要最终化的值（可能是草稿或普通对象）
 * @param path - 用于生成补丁的路径信息（可选）
 * @returns 最终化后的不可变对象
 */
function finalize(rootScope: ImmerScope, value: any, path?: PatchPath) {
	// 性能优化：跳过已冻结的对象，避免重复处理递归数据结构
	if (isFrozen(value)) return value

	const state: ImmerState = value[DRAFT_STATE]

	// 处理普通对象（非草稿），但可能包含草稿属性
	if (!state) {
		// 递归处理所有属性，寻找嵌套的草稿
		each(value, (key, childValue) =>
			finalizeProperty(rootScope, state, value, key, childValue, path)
		)
		return value
	}

	// 跨作用域保护：只处理当前作用域拥有的草稿
	// 这防止了嵌套produce调用时的干扰
	if (state.scope_ !== rootScope) return value

	// 性能优化：未修改的草稿直接返回原始对象
	if (!state.modified_) {
		maybeFreeze(rootScope, state.base_, true)
		return state.base_
	}

	// 最终化已修改的草稿
	if (!state.finalized_) {
		// 标记为已最终化，避免重复处理
		state.finalized_ = true
		state.scope_.unfinalizedDrafts_--

		const result = state.copy_

		// Set对象的特殊处理：避免在迭代时修改导致的无限循环
		// 参见issue #628的详细说明
		let resultEach = result
		let isSet = false
		if (state.type_ === ArchType.Set) {
			// 创建Set的副本用于迭代，清空原Set让finalizeProperty重新添加
			resultEach = new Set(result)
			result.clear()
			isSet = true
		}

		// 递归最终化所有子属性
		each(resultEach, (key, childValue) =>
			finalizeProperty(rootScope, state, result, key, childValue, path, isSet)
		)

		// 所有内容都已最终化，现在可以冻结整个对象
		maybeFreeze(rootScope, result, false)

		// 首次最终化时生成变更补丁
		if (path && rootScope.patches_) {
			getPlugin("Patches").generatePatches_(
				state,
				path,
				rootScope.patches_,
				rootScope.inversePatches_!
			)
		}
	}

	return state.copy_
}

/**
 * 最终化对象的单个属性
 *
 * 这个函数处理对象属性的最终化，是finalize函数的关键辅助函数。
 * 它需要处理各种复杂情况：草稿属性、嵌套对象、Set集合等。
 *
 * 处理逻辑：
 * 1. 草稿属性：递归最终化并更新到目标对象
 * 2. Set集合：特殊的添加方式
 * 3. 可草稿化对象：递归检查嵌套的草稿
 * 4. 性能优化：在特定条件下提前终止递归
 *
 * @param rootScope - 根作用域
 * @param parentState - 父对象的草稿状态（如果是草稿）
 * @param targetObject - 要设置属性的目标对象
 * @param prop - 属性键
 * @param childValue - 属性值
 * @param rootPath - 补丁路径（可选）
 * @param targetIsSet - 目标是否为Set对象
 */
function finalizeProperty(
	rootScope: ImmerScope,
	parentState: undefined | ImmerState,
	targetObject: any,
	prop: string | number,
	childValue: any,
	rootPath?: PatchPath,
	targetIsSet?: boolean
) {
	// 开发环境的循环引用检查
	if (process.env.NODE_ENV !== "production" && childValue === targetObject)
		die(5)

	if (isDraft(childValue)) {
		// 处理草稿属性

		// 构建补丁路径：只有在特定条件下才需要深度补丁
		// Set对象是原子的（没有键），跳过已分配的键的深度补丁
		const path =
			rootPath &&
			parentState &&
			parentState!.type_ !== ArchType.Set && // Set对象是原子性的
			!has((parentState as Exclude<ImmerState, SetState>).assigned_!, prop) // 跳过已分配键的深度补丁
				? rootPath!.concat(prop)
				: undefined

		// 递归最终化草稿属性
		const res = finalize(rootScope, childValue, path)
		set(targetObject, prop, res)

		// 嵌套produce检测：如果最终化后仍是草稿，说明在嵌套的produce中
		// 此时不能自动冻结，因为外层produce可能还需要修改
		if (isDraft(res)) {
			rootScope.canAutoFreeze_ = false
		} else return
	} else if (targetIsSet) {
		// Set对象的特殊处理：重新添加非草稿值
		targetObject.add(childValue)
	}

	// 递归检查新对象中未最终化的草稿
	// 冻结的对象永远不应该包含草稿
	if (isDraftable(childValue) && !isFrozen(childValue)) {
		// 性能优化：在特定条件下提前终止递归
		// 如果没有自动冻结，且确定没有剩余的草稿，可以停止遍历
		// 这特别有利于添加大型数据树而无需进一步处理的场景
		// 参见add-data.js性能测试
		if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) {
			return
		}

		// 递归最终化嵌套的可草稿化对象
		finalize(rootScope, childValue)

		// 深度冻结策略：
		// - 只有在没有父状态或父状态不是嵌套作用域时才冻结
		// - 跳过符号属性以避免与其他框架冲突（参见#590）
		// - 只冻结可枚举属性
		if (
			(!parentState || !parentState.scope_.parent_) &&
			typeof prop !== "symbol" &&
			Object.prototype.propertyIsEnumerable.call(targetObject, prop)
		)
			maybeFreeze(rootScope, childValue)
	}
}

/**
 * 根据配置决定是否冻结对象
 *
 * 冻结是immer确保不可变性的重要机制，但需要谨慎应用以避免性能问题。
 * 只有在根作用域且配置允许的情况下才进行冻结。
 *
 * 冻结策略：
 * - 只有根作用域才能冻结，避免影响嵌套对象的剪枝优化
 * - 必须开启autoFreeze配置
 * - 必须允许自动冻结（canAutoFreeze_为true）
 *
 * @param scope - 当前作用域
 * @param value - 要冻结的值
 * @param deep - 是否进行深度冻结，默认false
 */
function maybeFreeze(scope: ImmerScope, value: any, deep = false) {
	// 冻结条件检查：
	// 1. 必须是根作用域（防止影响包装对象内草稿的剪枝）
	// 2. 必须开启自动冻结配置
	// 3. 必须允许自动冻结（可能被嵌套produce禁用）
	if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) {
		freeze(value, deep)
	}
}

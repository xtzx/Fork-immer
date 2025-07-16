// 导入 immer 作用域管理所需的核心类型和工具
import {
	Patch,         // 补丁对象类型
	PatchListener, // 补丁监听器类型
	Drafted,       // 已代理的草稿对象类型
	Immer,         // Immer 主类
	DRAFT_STATE,   // 草稿状态的 Symbol 键
	ImmerState,    // 草稿对象的内部状态结构
	ArchType,      // 架构类型枚举
	getPlugin      // 获取插件实现的函数
} from "../internal"

/**
 * ImmerScope 接口 - 表示一次 produce 调用的执行上下文
 *
 * 作用域的核心概念：
 * 1. 隔离性：每次 produce 调用都有独立的执行环境
 * 2. 层次性：支持嵌套 produce 调用，形成作用域栈
 * 3. 生命周期：从 enterScope 到 leaveScope 的完整周期
 * 4. 资源管理：跟踪和清理所有相关资源
 *
 * 设计目的：
 * - 管理嵌套 produce 调用的复杂性
 * - 确保补丁生成的正确性
 * - 优化自动冻结的性能
 * - 提供完整的错误恢复机制
 */
export interface ImmerScope {
	/**
	 * 补丁数组 - 记录本次调用产生的所有变更
	 * 只有当启用补丁功能时才会初始化
	 * 用于生成从原始状态到新状态的变更记录
	 */
	patches_?: Patch[]

	/**
	 * 逆向补丁数组 - 记录如何撤销本次变更
	 * 与 patches_ 成对出现，用于实现 undo 功能
	 * 包含从新状态回到原始状态的操作序列
	 */
	inversePatches_?: Patch[]

	/**
	 * 自动冻结控制标志
	 *
	 * 设计原理：
	 * 当修改的草稿包含来自其他作用域的草稿时，需要禁用自动冻结
	 * 这确保未拥有的草稿可以被正确最终化
	 *
	 * 场景示例：
	 * - 嵌套 produce 调用时的跨作用域引用
	 * - 手动创建的草稿对象的处理
	 */
	canAutoFreeze_: boolean

	/**
	 * 草稿对象数组 - 当前作用域创建的所有草稿
	 *
	 * 用途：
	 * 1. 生命周期管理：确保所有草稿都能被正确清理
	 * 2. 最终化处理：在作用域结束时处理所有草稿
	 * 3. 错误恢复：在异常时撤销所有草稿的修改
	 * 4. 内存管理：防止草稿对象泄漏
	 */
	drafts_: any[]

	/**
	 * 父级作用域引用 - 形成作用域栈结构
	 *
	 * 作用域栈的意义：
	 * - 支持嵌套的 produce 调用
	 * - 维护正确的执行上下文
	 * - 实现作用域的层次化管理
	 * - 确保资源的正确释放顺序
	 */
	parent_?: ImmerScope

	/**
	 * 补丁监听器 - 接收补丁变更通知的回调函数
	 *
	 * 监听器的作用：
	 * - 实时获取状态变更信息
	 * - 支持自定义的变更处理逻辑
	 * - 实现状态同步和持久化
	 * - 提供调试和日志记录能力
	 */
	patchListener_?: PatchListener

	/**
	 * Immer 实例引用 - 关联的 Immer 配置
	 *
	 * 重要性：
	 * - 访问实例特定的配置（autoFreeze、useStrictShallowCopy）
	 * - 确保使用正确的处理策略
	 * - 支持多个 Immer 实例的并存
	 */
	immer_: Immer

	/**
	 * 未最终化草稿计数器
	 *
	 * 计数作用：
	 * - 跟踪还有多少草稿需要最终化
	 * - 优化最终化过程的性能
	 * - 确保所有草稿都得到正确处理
	 * - 检测潜在的内存泄漏问题
	 */
	unfinalizedDrafts_: number
}

/**
 * 全局当前作用域指针
 *
 * 设计考虑：
 * - 使用全局变量简化作用域访问
 * - 支持作用域栈的快速切换
 * - 避免在每个函数调用中传递作用域参数
 * - 确保作用域状态的一致性
 *
 * 注意：这种设计要求 immer 的操作是同步的
 */
let currentScope: ImmerScope | undefined

/**
 * 获取当前作用域
 *
 * 返回当前活跃的作用域实例
 * 使用断言操作符(!)确保作用域存在，因为只有在 produce 调用内才会访问
 *
 * @returns 当前作用域实例
 */
export function getCurrentScope() {
	return currentScope!
}

/**
 * 创建新的作用域实例
 *
 * 初始化策略：
 * 1. 创建空的草稿数组，准备收集本次调用的草稿
 * 2. 设置父级作用域引用，构建作用域链
 * 3. 关联 Immer 实例，继承配置信息
 * 4. 默认启用自动冻结，除非后续检测到跨作用域引用
 * 5. 初始化未最终化计数器为 0
 *
 * @param parent_ 父级作用域，用于嵌套调用
 * @param immer_ 关联的 Immer 实例
 * @returns 新创建的作用域实例
 */
function createScope(
	parent_: ImmerScope | undefined,
	immer_: Immer
): ImmerScope {
	return {
		drafts_: [],                    // 空数组，准备收集草稿
		parent_,                        // 父级作用域引用
		immer_,                         // Immer 实例引用
		// 自动冻结控制的重要注释：
		// 当修改的草稿包含来自其他作用域的草稿时，
		// 需要禁用自动冻结，以便未拥有的草稿可以被正确最终化
		canAutoFreeze_: true,           // 默认允许自动冻结
		unfinalizedDrafts_: 0           // 初始无未最终化草稿
	}
}

/**
 * 在作用域中启用补丁功能
 *
 * 补丁系统的初始化：
 * 1. 验证补丁插件是否已加载
 * 2. 初始化补丁收集数组
 * 3. 设置补丁监听器
 *
 * 设计原理：
 * - 补丁功能是可选的，只有在需要时才启用
 * - 通过插件系统实现，保持核心代码的简洁
 * - 支持自定义的补丁处理逻辑
 *
 * @param scope 要启用补丁功能的作用域
 * @param patchListener 可选的补丁监听器
 */
export function usePatchesInScope(
	scope: ImmerScope,
	patchListener?: PatchListener
) {
	if (patchListener) {
		getPlugin("Patches") // 断言补丁插件已加载
		scope.patches_ = []           // 初始化正向补丁数组
		scope.inversePatches_ = []    // 初始化逆向补丁数组
		scope.patchListener_ = patchListener // 设置监听器
	}
}

/**
 * 撤销作用域 - 错误恢复时的清理操作
 *
 * 撤销流程：
 * 1. 正常离开作用域（更新作用域栈）
 * 2. 撤销所有创建的草稿对象
 * 3. 清空草稿数组，释放内存
 *
 * 使用场景：
 * - recipe 函数抛出异常时
 * - produce 调用被中断时
 * - 需要回滚所有修改时
 *
 * 设计目的：
 * - 确保异常安全性
 * - 防止部分修改的状态泄漏
 * - 恢复对象的原始状态
 *
 * @param scope 要撤销的作用域
 */
export function revokeScope(scope: ImmerScope) {
	leaveScope(scope)                    // 先正常离开作用域
	scope.drafts_.forEach(revokeDraft)   // 撤销所有草稿对象
	// @ts-ignore - 故意设置为 null 以帮助垃圾回收
	scope.drafts_ = null
}

/**
 * 离开作用域 - 正常完成时的清理操作
 *
 * 作用域栈管理：
 * - 只有当前作用域才能被离开
 * - 自动恢复到父级作用域
 * - 维护作用域栈的完整性
 *
 * 调用时机：
 * - produce 函数正常完成时
 * - 手动草稿完成时
 * - 作用域撤销时（作为第一步）
 *
 * @param scope 要离开的作用域
 */
export function leaveScope(scope: ImmerScope) {
	if (scope === currentScope) {
		currentScope = scope.parent_     // 恢复到父级作用域
	}
}

/**
 * 进入新作用域 - 开始新的 produce 调用
 *
 * 作用域创建流程：
 * 1. 创建新的作用域实例
 * 2. 设置当前作用域为新创建的作用域
 * 3. 返回作用域实例供后续操作使用
 *
 * 作用域栈的构建：
 * - 新作用域自动链接到当前作用域作为父级
 * - 形成后进先出(LIFO)的栈结构
 * - 支持任意深度的嵌套调用
 *
 * @param immer 关联的 Immer 实例
 * @returns 新创建并激活的作用域
 */
export function enterScope(immer: Immer) {
	return (currentScope = createScope(currentScope, immer))
}

/**
 * 撤销单个草稿对象
 *
 * 撤销策略根据草稿类型分类：
 * 1. 对象和数组：调用代理的 revoke 方法，使代理失效
 * 2. Map 和 Set：设置 revoked 标志，标记为已撤销
 *
 * 撤销的效果：
 * - 对象/数组：代理失效，任何访问都会抛出 TypeError
 * - Map/Set：通过标志位控制，后续操作将被拒绝
 *
 * 设计考虑：
 * - 不同数据类型需要不同的撤销机制
 * - 确保撤销后的对象不能被继续使用
 * - 提供清晰的错误信息帮助调试
 *
 * @param draft 要撤销的草稿对象
 */
function revokeDraft(draft: Drafted) {
	const state: ImmerState = draft[DRAFT_STATE]
	if (state.type_ === ArchType.Object || state.type_ === ArchType.Array)
		state.revoke_()              // 对象/数组：撤销代理
	else state.revoked_ = true       // Map/Set：设置撤销标志
}

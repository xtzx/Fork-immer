/**
 * immer.ts - Immer库主入口文件
 *
 * 这是immer库的公共API入口，负责：
 * 1. 统一导出所有公共接口和类型
 * 2. 创建默认的Immer实例并绑定核心方法
 * 3. 提供便利的类型转换函数
 * 4. 管理插件系统的启用
 *
 * 设计理念：
 * - 简单易用：提供直接可用的函数而不需要实例化
 * - 类型安全：完整的TypeScript类型支持
 * - 按需加载：插件系统支持功能的按需启用
 * - 向后兼容：稳定的公共API设计
 *
 * 主要特性：
 * - produce: 核心的不可变更新函数
 * - createDraft/finishDraft: 手动草稿管理
 * - 补丁系统：跟踪和应用状态变更
 * - 类型转换：Draft和Immutable类型的安全转换
 */

import {
	IProduce,
	IProduceWithPatches,
	Immer,
	Draft,
	Immutable
} from "./internal"

/**
 * 公共API和类型导出
 *
 * 这些是immer对外提供的完整接口，包括：
 * - 类型定义：Draft, Immutable, Patch等核心类型
 * - 工具函数：original, current, isDraft等实用函数
 * - 常量：nothing, immerable等特殊标识符
 * - 配置：freeze, StrictMode等行为控制
 */
export {
	Draft,           // 草稿类型，用户在producer中操作的类型
	WritableDraft,   // 可写草稿类型，更明确的语义表达
	Immutable,       // 不可变类型，确保类型级别的不可变性
	Patch,           // 补丁对象类型，描述状态变更
	PatchListener,   // 补丁监听器类型，处理补丁事件
	Producer,        // 生产者函数类型，用户编写的状态变更逻辑
	original,        // 获取草稿对应的原始对象
	current,         // 获取草稿的当前状态快照
	isDraft,         // 判断对象是否为草稿
	isDraftable,     // 判断对象是否可以被草稿化
	NOTHING as nothing,      // 删除标记，在producer中返回表示删除
	DRAFTABLE as immerable,  // 可草稿化标记，类实例需要添加此属性
	freeze,          // 冻结函数，确保对象不可变
	Objectish,       // 可处理的对象类型联合
	StrictMode       // 严格模式配置类型
} from "./internal"

/**
 * 默认Immer实例
 *
 * 创建一个全局共享的Immer实例，这样用户可以直接使用函数
 * 而不需要手动创建实例。这个实例使用默认配置：
 * - autoFreeze: true (自动冻结结果)
 * - useStrictShallowCopy: false (非严格浅拷贝)
 */
const immer = new Immer()

/**
 * produce - 核心的不可变状态更新函数
 *
 * 这是immer最重要的API，用于安全地"修改"不可变状态。
 * 它接受一个基础状态和一个"配方函数"，配方函数可以自由
 * 修改传入的草稿对象，所有修改都只会应用到基础状态的副本上。
 *
 * 支持多种调用模式：
 *
 * 1. 标准模式：
 * const nextState = produce(baseState, draft => {
 *   draft.user.name = "Alice"
 * })
 *
 * 2. 柯里化模式：
 * const updateUser = produce(draft => {
 *   draft.user.name = "Alice"
 * })
 * const nextState = updateUser(baseState)
 *
 * 3. 带补丁监听：
 * const nextState = produce(baseState, draft => {
 *   draft.user.name = "Alice"
 * }, patches => {
 *   console.log("应用的补丁：", patches)
 * })
 *
 * 重要特性：
 * - 结构共享：未修改的部分会被重用，节省内存
 * - 类型安全：完整的TypeScript类型推导
 * - 性能优化：只有被修改的部分会被复制
 * - 错误安全：自动处理各种边界情况
 *
 * 注意：这个函数被绑定到默认的Immer实例
 *
 * @param base - 初始状态对象
 * @param producer - 接受草稿作为第一参数的函数，可以自由修改
 * @param patchListener - 可选的补丁监听函数，接收生成的补丁
 * @returns 新状态，如果没有修改则返回原始状态
 */
export const produce: IProduce = immer.produce

/**
 * produceWithPatches - 返回状态和补丁的produce版本
 *
 * 与produce类似，但总是返回一个三元组：
 * [nextState, patches, inversePatches]
 *
 * 这对于需要补丁信息的场景非常有用：
 * - 状态同步：将补丁发送到其他客户端
 * - 撤销/重做：使用inversePatches实现状态回滚
 * - 调试：检查具体的状态变更
 * - 持久化：只保存变更而不是完整状态
 *
 * @example
 * const [nextState, patches, inversePatches] = produceWithPatches(
 *   baseState,
 *   draft => {
 *     draft.user.name = "Alice"
 *   }
 * )
 *
 * // patches 描述了如何从baseState得到nextState
 * // inversePatches 描述了如何从nextState回到baseState
 *
 * 注意：需要先启用Patches插件才能使用
 */
export const produceWithPatches: IProduceWithPatches = immer.produceWithPatches.bind(
	immer
)

/**
 * setAutoFreeze - 配置自动冻结行为
 *
 * 控制immer是否自动冻结生成的结果对象。冻结确保了对象的
 * 不可变性，防止意外修改，但在某些场景下可能影响性能。
 *
 * 默认行为：
 * - 开发环境：true (帮助捕获错误)
 * - 生产环境：true (但可以关闭以提高性能)
 *
 * 使用场景：
 * - 性能敏感：关闭自动冻结以提高性能
 * - 调试：开启以捕获意外的状态修改
 * - 兼容性：某些库可能需要修改对象
 *
 * @param autoFreeze - true表示自动冻结，false表示不冻结
 *
 * @example
 * setAutoFreeze(false) // 关闭自动冻结以提高性能
 */
export const setAutoFreeze = immer.setAutoFreeze.bind(immer)

/**
 * setUseStrictShallowCopy - 配置严格浅拷贝模式
 *
 * 控制immer在创建对象副本时是否严格复制所有属性描述符。
 * 默认情况下，immer不会复制getter、setter和不可枚举属性
 * 等描述符信息，这样可以提高性能。
 *
 * 严格模式的影响：
 * - 复制所有属性描述符（getter、setter、configurable等）
 * - 保持属性的完整语义
 * - 性能开销更大
 * - 更好的语义正确性
 *
 * 使用场景：
 * - 需要保持完整属性语义的场景
 * - 对象包含重要的getter/setter逻辑
 * - 兼容依赖属性描述符的代码
 *
 * @param strict - true表示使用严格浅拷贝
 *
 * @example
 * setUseStrictShallowCopy(true) // 启用严格拷贝
 */
export const setUseStrictShallowCopy = immer.setUseStrictShallowCopy.bind(immer)

/**
 * applyPatches - 应用补丁到对象
 *
 * 将一组补丁应用到目标对象上，生成新的状态。这个函数
 * 也是一个producer，意味着它使用写时复制机制。
 *
 * 主要用途：
 * - 状态同步：应用从其他地方接收的补丁
 * - 重放：重现一系列状态变更
 * - 撤销/重做：应用或撤销补丁
 * - 增量更新：只传输变更而不是完整状态
 *
 * @param base - 要应用补丁的基础对象
 * @param patches - 要应用的补丁数组
 * @returns 应用补丁后的新状态
 *
 * @example
 * const patches = [
 *   { op: "replace", path: ["user", "name"], value: "Alice" }
 * ]
 * const newState = applyPatches(baseState, patches)
 *
 * 注意：需要先启用Patches插件才能使用
 */
export const applyPatches = immer.applyPatches.bind(immer)

/**
 * createDraft - 手动创建草稿对象
 *
 * 创建一个可以手动管理的草稿对象。与produce不同，
 * 这个草稿的生命周期由用户控制，需要手动调用
 * finishDraft来完成最终化。
 *
 * 适用场景：
 * - 需要在多个函数间传递草稿
 * - 异步操作中修改状态
 * - 条件性的状态修改
 * - 更细粒度的控制需求
 *
 * 注意事项：
 * - 必须调用finishDraft来完成修改
 * - 草稿对象不能在finishDraft后继续使用
 * - 草稿会占用资源直到被完成
 *
 * @param base - 要创建草稿的基础对象
 * @returns 可修改的草稿对象
 *
 * @example
 * const draft = createDraft(baseState)
 * draft.user.name = "Alice"
 * const newState = finishDraft(draft)
 */
export const createDraft = immer.createDraft.bind(immer)

/**
 * finishDraft - 完成手动草稿的修改
 *
 * 完成通过createDraft创建的草稿的修改过程，返回
 * 最终的不可变状态。如果没有修改，会返回原始的
 * base对象（结构共享）。
 *
 * 完成过程包括：
 * - 最终化所有嵌套的草稿对象
 * - 应用写时复制优化
 * - 根据配置冻结结果
 * - 生成补丁（如果提供了监听器）
 * - 清理草稿资源
 *
 * @param draft - 由createDraft创建的草稿对象
 * @param patchListener - 可选的补丁监听函数
 * @returns 最终的不可变状态
 *
 * @example
 * const draft = createDraft(baseState)
 * draft.user.name = "Alice"
 * const newState = finishDraft(draft, patches => {
 *   console.log("生成的补丁：", patches)
 * })
 */
export const finishDraft = immer.finishDraft.bind(immer)

/**
 * castDraft - 类型转换：不可变到草稿
 *
 * 这是一个纯类型转换函数（运行时no-op），用于告诉
 * TypeScript将不可变类型视为草稿类型。这在某些
 * 类型推导不准确的场景下很有用。
 *
 * 使用场景：
 * - 类型系统推导不准确时的手动修正
 * - 在复杂的泛型场景中辅助类型推导
 * - 与其他库集成时的类型适配
 *
 * 注意：这只是类型级别的转换，不会改变运行时行为
 *
 * @param value - 要转换类型的值
 * @returns 相同的值，但类型被标记为Draft<T>
 *
 * @example
 * function processState<T>(state: Immutable<T>) {
 *   const draft = castDraft(state)
 *   // 现在TypeScript知道draft是可修改的类型
 *   return draft
 * }
 */
export function castDraft<T>(value: T): Draft<T> {
	return value as any
}

/**
 * castImmutable - 类型转换：草稿到不可变
 *
 * 与castDraft相反，将草稿类型转换为不可变类型。
 * 同样是纯类型转换函数，运行时不执行任何操作。
 *
 * 使用场景：
 * - 确保类型系统认为对象是不可变的
 * - 在API边界处确保类型安全
 * - 与外部库的类型适配
 *
 * @param value - 要转换类型的值
 * @returns 相同的值，但类型被标记为Immutable<T>
 *
 * @example
 * function exportState<T>(draft: Draft<T>): Immutable<T> {
 *   // 确保返回的状态被标记为不可变
 *   return castImmutable(draft)
 * }
 */
export function castImmutable<T>(value: T): Immutable<T> {
	return value as any
}

/**
 * 导出Immer类本身
 *
 * 允许用户创建自定义配置的Immer实例，用于：
 * - 不同的配置需求（如不同的冻结策略）
 * - 隔离的状态管理（避免全局配置冲突）
 * - 高级定制需求
 */
export {Immer}

/**
 * 插件导出
 *
 * 按需启用immer的扩展功能：
 * - enablePatches: 启用补丁系统支持
 * - enableMapSet: 启用Map和Set数据结构支持
 *
 * 插件设计的好处：
 * - 减小核心包体积
 * - 按需加载功能
 * - 更好的tree-shaking支持
 */
export {enablePatches} from "./plugins/patches"
export {enableMapSet} from "./plugins/mapset"

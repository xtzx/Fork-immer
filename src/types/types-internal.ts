/**
 * types-internal.ts - Immer内部类型系统定义
 *
 * 这个文件定义了immer内部使用的核心类型系统，是整个immer架构的类型基础。
 * 与types-external.ts面向用户不同，这个文件的类型主要用于immer内部实现，
 * 包括草稿状态管理、数据结构分类、内部对象标识等关键概念。
 *
 * 核心设计理念：
 * - 类型安全：确保所有内部操作都有明确的类型约束
 * - 扩展性：支持多种数据结构（Object、Array、Map、Set）
 * - 性能优化：通过类型区分实现针对性的优化策略
 * - 状态管理：完整的草稿生命周期状态跟踪
 *
 * 主要组成部分：
 * - 数据结构类型分类和别名定义
 * - 架构类型枚举（ArchType）
 * - 草稿状态基础接口和联合类型
 * - 内部草稿对象类型定义
 */

import {
	SetState,
	ImmerScope,
	ProxyObjectState,
	ProxyArrayState,
	MapState,
	DRAFT_STATE
} from "../internal"

/**
 * Objectish - 可被immer处理的所有对象类型的联合
 *
 * 这是immer支持的所有可草稿化数据结构的顶级类型。immer能够处理
 * JavaScript中的四种主要复合数据类型，每种都有其特定的处理策略：
 *
 * - Object: 普通对象，使用Proxy劫持属性访问
 * - Array: 数组，继承Object的处理方式但有数组特定的优化
 * - Map: ES6 Map，需要特殊的键值对处理
 * - Set: ES6 Set，需要特殊的值集合处理
 *
 * 设计考虑：
 * - 完整性：覆盖所有JavaScript复合数据类型
 * - 一致性：为不同数据结构提供统一的草稿化接口
 * - 性能：允许针对不同类型进行特定优化
 */
export type Objectish = AnyObject | AnyArray | AnyMap | AnySet

/**
 * ObjectishNoSet - 除Set外的所有可草稿化类型
 *
 * 在某些场景下，Set需要特殊处理（例如补丁生成、深度冻结等），
 * 这个类型用于排除Set的情况。主要用于：
 *
 * - 补丁系统：Set被视为原子操作，不生成深度补丁
 * - 属性遍历：Set没有传统意义上的"属性"概念
 * - 序列化：Set的序列化需要特殊处理
 *
 * 使用场景：
 * - 属性级别的操作和遍历
 * - 需要区分Set和其他集合类型的算法
 * - 补丁生成和应用逻辑
 */
export type ObjectishNoSet = AnyObject | AnyArray | AnyMap

/**
 * AnyObject - 任意普通对象类型
 *
 * 代表具有字符串键和任意值的普通JavaScript对象。这是最常见的
 * 草稿化目标，immer对其进行了深度优化：
 *
 * - 使用Proxy劫持属性访问和修改
 * - 支持写时复制（Copy-on-Write）
 * - 保持原型链的完整性
 * - 支持不可枚举属性
 *
 * 注意：不包括null、函数、Date等特殊对象类型
 */
export type AnyObject = {[key: string]: any}

/**
 * AnyArray - 任意数组类型
 *
 * JavaScript数组的类型定义。数组在immer中被视为特殊的对象，
 * 继承了对象的所有处理机制，但有额外的数组特定优化：
 *
 * - 长度属性的自动维护
 * - 数组方法的特殊处理（push、pop、splice等）
 * - 索引访问的优化
 * - 稀疏数组的正确处理
 *
 * 实现细节：
 * - 内部仍使用ProxyArrayState进行状态管理
 * - 支持所有标准数组操作
 * - 保持数组特有的行为特征
 */
export type AnyArray = Array<any>

/**
 * AnySet - 任意Set集合类型
 *
 * ES6 Set集合的类型定义。Set在immer中需要特殊处理，因为：
 *
 * - 没有键值对概念，只有值的集合
 * - 迭代顺序有严格的插入顺序要求
 * - 值的唯一性约束需要特殊维护
 * - 不能使用Proxy进行直接劫持
 *
 * 处理策略：
 * - 使用替换整个Set的方式实现"修改"
 * - 在最终化时进行特殊的迭代处理
 * - 补丁系统中被视为原子操作
 */
export type AnySet = Set<any>

/**
 * AnyMap - 任意Map映射类型
 *
 * ES6 Map对象的类型定义。Map也需要特殊处理：
 *
 * - 键可以是任意类型（不仅仅是字符串）
 * - 有严格的插入顺序要求
 * - 键值对的概念与普通对象不同
 * - 不能使用标准的Proxy属性劫持
 *
 * 处理策略：
 * - 劫持Map的原型方法（set、get、delete等）
 * - 维护一个修改记录来跟踪变更
 * - 在最终化时重构新的Map实例
 */
export type AnyMap = Map<any, any>

/**
 * ArchType - 架构类型枚举
 *
 * 定义了immer支持的所有数据结构类型的枚举。这个枚举用于：
 *
 * - 运行时类型识别和分发处理逻辑
 * - 性能优化：为不同类型选择最优的处理策略
 * - 代码组织：将类型相关的逻辑进行分组
 * - 插件系统：允许插件针对特定类型进行扩展
 *
 * 数值设计：
 * - Object = 0: 最常用的类型，使用最小的数值
 * - Array = 1: 第二常用，继承Object的处理逻辑
 * - Map = 2: ES6类型，需要特殊处理
 * - Set = 3: ES6类型，需要最特殊的处理
 *
 * 使用场景：
 * - switch语句中的类型分发
 * - 性能关键路径的类型检查
 * - 状态对象中的类型标记
 */
export const enum ArchType {
	Object,  // 普通对象 - 最常见，使用Proxy属性劫持
	Array,   // 数组对象 - 继承Object处理，有特殊优化
	Map,     // Map映射 - 需要方法劫持和键值对处理
	Set      // Set集合 - 需要最特殊的处理策略
}

/**
 * ImmerBaseState - 所有草稿状态的基础接口
 *
 * 定义了所有草稿状态对象必须具备的核心属性。这个接口是immer状态管理
 * 系统的基石，确保了不同类型的草稿状态具有一致的基础行为。
 *
 * 核心属性说明：
 *
 * @property parent_ - 父级草稿状态的引用（可选）
 *   - 用于建立草稿对象的层次关系
 *   - 支持嵌套对象的正确处理
 *   - 在错误恢复时用于状态回滚
 *   - 根对象的parent_为undefined
 *
 * @property scope_ - 所属的作用域引用
 *   - 每个草稿都必须属于一个特定的作用域
 *   - 用于资源管理和生命周期控制
 *   - 支持嵌套produce调用的隔离
 *   - 包含配置信息和全局状态
 *
 * @property modified_ - 修改标记
 *   - 标识这个草稿是否被修改过
 *   - 用于性能优化：未修改的草稿可以直接返回base
 *   - 影响最终化过程中的处理策略
 *   - 用于补丁生成的判断依据
 *
 * @property finalized_ - 最终化标记
 *   - 标识这个草稿是否已经完成最终化处理
 *   - 防止重复最终化导致的性能问题
 *   - 在current()函数中临时设置来避免循环
 *   - 用于状态一致性检查
 *
 * @property isManual_ - 手动管理标记
 *   - 标识是否是通过createDraft手动创建的草稿
 *   - 影响自动冻结和生命周期管理
 *   - 手动草稿需要显式调用finishDraft
 *   - 用于区分自动和手动的资源管理模式
 *
 * 设计原则：
 * - 最小化：只包含所有状态类型都需要的核心属性
 * - 一致性：确保所有草稿状态的行为一致性
 * - 扩展性：为具体的状态类型留出扩展空间
 * - 性能：属性设计考虑了性能关键路径的需求
 */
export interface ImmerBaseState {
	parent_?: ImmerState      // 父级状态引用，支持嵌套结构
	scope_: ImmerScope        // 所属作用域，必需的生命周期管理
	modified_: boolean        // 修改标记，性能优化的关键
	finalized_: boolean       // 最终化标记，防止重复处理
	isManual_: boolean        // 手动管理标记，影响生命周期
}

/**
 * ImmerState - 所有具体草稿状态类型的联合
 *
 * 这是immer内部使用的核心状态类型，将所有具体的草稿状态类型
 * 联合在一起。每种状态类型都继承了ImmerBaseState的基础属性，
 * 并添加了特定于该数据结构的专有属性和方法。
 *
 * 组成类型：
 *
 * - ProxyObjectState: 普通对象的草稿状态
 *   - 包含base_、copy_、assigned_等对象特有属性
 *   - 支持属性级别的跟踪和修改
 *   - 使用Proxy进行属性访问劫持
 *
 * - ProxyArrayState: 数组的草稿状态
 *   - 继承ProxyObjectState的所有功能
 *   - 添加数组特有的长度管理
 *   - 支持数组方法的特殊处理
 *
 * - MapState: Map对象的草稿状态
 *   - 包含Map特有的键值对跟踪
 *   - 维护插入顺序的完整性
 *   - 支持任意类型的键
 *
 * - SetState: Set对象的草稿状态
 *   - 包含Set特有的值集合管理
 *   - 维护值的唯一性约束
 *   - 支持插入顺序的保持
 *
 * 使用场景：
 * - 类型分发：根据具体类型选择处理逻辑
 * - 状态管理：在不同处理阶段传递状态信息
 * - 错误处理：提供完整的状态信息用于诊断
 * - 性能优化：支持针对性的优化策略
 *
 * 设计优势：
 * - 类型安全：编译时确保类型正确性
 * - 可扩展：容易添加新的数据结构支持
 * - 一致性：所有状态类型遵循相同的接口约定
 * - 性能：支持高效的类型判断和处理分发
 */
export type ImmerState =
	| ProxyObjectState    // 普通对象草稿状态
	| ProxyArrayState     // 数组草稿状态
	| MapState           // Map草稿状态
	| SetState           // Set草稿状态

/**
 * Drafted - 内部草稿对象类型
 *
 * 这是immer内部使用的草稿对象类型定义，与面向用户的Draft类型不同，
 * 这个类型专门用于immer内部实现。它将原始对象类型与草稿状态结合，
 * 形成了完整的内部草稿表示。
 *
 * 类型参数：
 * @template Base - 原始对象的类型，默认为any
 * @template T - 草稿状态的类型，默认为ImmerState，必须继承ImmerState
 *
 * 结构组成：
 * - 原始对象的所有属性和方法（通过 & Base 继承）
 * - 特殊的草稿状态属性 [DRAFT_STATE]: T
 *
 * 草稿状态属性：
 * - 使用Symbol作为键，避免与用户属性冲突
 * - 包含完整的草稿管理信息
 * - 只在immer内部访问，用户不应直接操作
 *
 * 设计考虑：
 *
 * 1. **类型安全**：
 *    - 保持原始对象的类型信息
 *    - 编译时检查草稿状态的正确性
 *    - 避免类型信息丢失
 *
 * 2. **封装性**：
 *    - Symbol键确保用户无法意外访问内部状态
 *    - 清晰区分用户接口和内部实现
 *    - 防止状态污染
 *
 * 3. **性能**：
 *    - 直接附加在对象上，避免额外的查找开销
 *    - 支持快速的类型判断（isDraft检查）
 *    - 最小化内存占用
 *
 * 4. **兼容性**：
 *    - 不影响对象的正常使用
 *    - 与现有JavaScript语义兼容
 *    - 支持各种对象操作（序列化、克隆等）
 *
 * 使用场景：
 * - 内部函数的参数和返回值类型标注
 * - 类型守卫和类型断言
 * - 草稿状态的获取和操作
 * - 调试和开发工具支持
 *
 * 与公共Draft类型的区别：
 * - Draft类型面向用户，隐藏内部实现细节
 * - Drafted类型面向实现，暴露完整的内部结构
 * - Draft类型注重易用性，Drafted类型注重功能完整性
 *
 * @example
 * // 内部使用示例
 * function processState(draft: Drafted<MyObject>): void {
 *   const state = draft[DRAFT_STATE];
 *   if (state.modified_) {
 *     // 处理已修改的草稿
 *   }
 * }
 */
export type Drafted<Base = any, T extends ImmerState = ImmerState> = {
	[DRAFT_STATE]: T    // 草稿状态信息，使用Symbol键避免冲突
} & Base              // 继承原始对象的所有属性和方法

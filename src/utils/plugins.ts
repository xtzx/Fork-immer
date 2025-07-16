/**
 * plugins.ts - Immer插件系统核心
 *
 * 这个文件实现了immer的插件架构，提供了按需加载功能的机制。
 * 插件系统的设计目标是保持核心的精简，同时支持扩展功能。
 *
 * 核心设计理念：
 * - 按需加载：只有使用的功能才会被包含在最终包中
 * - 类型安全：完整的TypeScript类型支持
 * - 懒加载：插件在首次使用时才进行注册
 * - 扩展性：容易添加新的插件类型
 *
 * 架构优势：
 * - Tree-shaking：未使用的插件不会被打包
 * - 模块化：功能模块可以独立开发和测试
 * - 兼容性：渐进式启用，不破坏现有代码
 * - 性能：避免加载不需要的代码
 */

import {
	ImmerState,
	Patch,
	Drafted,
	ImmerBaseState,
	AnyMap,
	AnySet,
	ArchType,
	die
} from "../internal"

/**
 * 插件注册表
 *
 * 这是一个中心化的插件存储对象，所有已加载的插件都会注册在这里。
 * 使用对象而不是Map是为了更好的类型推导和性能。
 *
 * 插件类型：
 * - Patches: 补丁系统，用于跟踪和应用状态变更
 * - MapSet: Map和Set数据结构支持
 *
 * 设计考虑：
 * - 可选性：所有插件都是可选的，使用 ? 标记
 * - 类型完整：每个插件都有完整的接口定义
 * - 命名一致：插件名称与对应的enable函数一致
 * - 扩展性：添加新插件只需要扩展这个类型
 */
const plugins: {
	/**
	 * Patches插件 - 补丁系统
	 *
	 * 提供状态变更的跟踪和应用功能，包括：
	 * - 生成变更补丁
	 * - 生成替换补丁（用于producer返回新值的情况）
	 * - 应用补丁到现有状态
	 *
	 * 用途：
	 * - 状态同步：将补丁发送到其他客户端
	 * - 撤销/重做：使用补丁实现状态历史管理
	 * - 调试：观察具体的状态变更
	 * - 持久化：只保存变更而不是完整状态
	 */
	Patches?: {
		/**
		 * 生成标准补丁
		 * 基于草稿状态的修改记录生成补丁数组
		 */
		generatePatches_(
			state: ImmerState,        // 草稿状态对象
			basePath: PatchPath,      // 当前路径
			patches: Patch[],         // 正向补丁数组
			inversePatches: Patch[]   // 反向补丁数组
		): void

		/**
		 * 生成替换补丁
		 * 当producer返回全新对象时生成的补丁
		 */
		generateReplacementPatches_(
			base: any,                // 原始对象
			replacement: any,         // 替换对象
			patches: Patch[],         // 正向补丁数组
			inversePatches: Patch[]   // 反向补丁数组
		): void

		/**
		 * 应用补丁
		 * 将补丁数组应用到目标对象上
		 */
		applyPatches_<T>(draft: T, patches: readonly Patch[]): T
	}

	/**
	 * MapSet插件 - Map和Set支持
	 *
	 * 为ES6的Map和Set数据结构提供草稿化支持。
	 * 由于Map和Set的特殊性质，需要专门的代理实现。
	 *
	 * 特殊处理：
	 * - Map: 键值对的跟踪和修改
	 * - Set: 值集合的跟踪和修改
	 * - 插入顺序：保持Map和Set的插入顺序语义
	 * - 迭代器：正确处理迭代过程中的修改
	 */
	MapSet?: {
		/**
		 * 创建Map代理
		 * 为Map对象创建可草稿化的代理
		 */
		proxyMap_<T extends AnyMap>(target: T, parent?: ImmerState): T

		/**
		 * 创建Set代理
		 * 为Set对象创建可草稿化的代理
		 */
		proxySet_<T extends AnySet>(target: T, parent?: ImmerState): T
	}
} = {} // 初始为空对象，插件会在加载时注册

/**
 * 插件类型定义
 * 从plugins对象推导出的类型，确保类型安全
 */
type Plugins = typeof plugins

/**
 * getPlugin - 获取已注册的插件
 *
 * 这是插件系统的核心函数，用于获取已加载的插件实现。
 * 如果插件未加载，会抛出有意义的错误提示用户启用插件。
 *
 * 类型安全：
 * - 使用泛型确保返回类型正确
 * - Exclude类型移除undefined可能性
 * - 编译时检查插件名称的有效性
 *
 * 错误处理：
 * - 清晰的错误信息指导用户如何启用插件
 * - 统一的错误处理机制
 * - 开发环境友好的错误提示
 *
 * @template K - 插件键类型，必须是有效的插件名称
 * @param pluginKey - 要获取的插件名称
 * @returns 对应的插件实现，保证非undefined
 * @throws 如果插件未加载则抛出错误
 *
 * 使用示例：
 * const patches = getPlugin("Patches")
 * patches.generatePatches_(...)
 */
export function getPlugin<K extends keyof Plugins>(
	pluginKey: K
): Exclude<Plugins[K], undefined> {
	const plugin = plugins[pluginKey]
	if (!plugin) {
		// 抛出友好的错误信息，指导用户如何启用插件
		die(0, pluginKey)
	}
	// @ts-ignore - 我们已经检查了plugin不为空
	return plugin
}

/**
 * loadPlugin - 加载插件实现
 *
 * 这个函数用于注册插件实现到全局插件注册表中。
 * 通常由插件的enable函数调用，实现懒加载机制。
 *
 * 加载策略：
 * - 幂等性：重复加载同一插件不会产生副作用
 * - 延迟加载：只在首次需要时加载
 * - 类型安全：确保插件实现符合接口要求
 *
 * 设计考虑：
 * - 避免重复：如果插件已加载则跳过
 * - 灵活性：支持插件的热替换（虽然不推荐）
 * - 性能：最小化加载开销
 *
 * @template K - 插件键类型
 * @param pluginKey - 插件名称标识符
 * @param implementation - 插件的具体实现
 *
 * 使用示例：
 * loadPlugin("Patches", {
 *   generatePatches_: ...,
 *   generateReplacementPatches_: ...,
 *   applyPatches_: ...
 * })
 */
export function loadPlugin<K extends keyof Plugins>(
	pluginKey: K,
	implementation: Plugins[K]
): void {
	// 幂等性检查：如果插件已加载则跳过
	if (!plugins[pluginKey]) plugins[pluginKey] = implementation
}

/* ==================== Map/Set插件相关类型 ==================== */

/**
 * MapState - Map对象的草稿状态
 *
 * 继承自ImmerBaseState，添加Map特有的状态管理属性。
 * Map的草稿化需要特殊处理，因为它不能使用标准的属性代理。
 *
 * 状态管理策略：
 * - 延迟拷贝：copy_在首次修改时创建
 * - 修改跟踪：assigned_记录键的修改状态
 * - 撤销支持：revoked_标记代理是否已撤销
 * - 类型标识：type_明确标识为Map类型
 *
 * 特殊属性说明：
 *
 * @property type_ - 架构类型标识，固定为ArchType.Map
 * @property copy_ - Map的修改副本，懒创建以优化性能
 * @property assigned_ - 跟踪键的分配状态，true表示设置，false表示删除
 * @property base_ - 原始Map对象的引用
 * @property revoked_ - 标记代理是否已被撤销
 * @property draft_ - 草稿Map对象本身的引用
 */
export interface MapState extends ImmerBaseState {
	type_: ArchType.Map                           // 类型标识
	copy_: AnyMap | undefined                     // 修改副本（懒创建）
	assigned_: Map<any, boolean> | undefined      // 键分配跟踪
	base_: AnyMap                                 // 原始Map
	revoked_: boolean                             // 撤销状态
	draft_: Drafted<AnyMap, MapState>             // 草稿引用
}

/**
 * SetState - Set对象的草稿状态
 *
 * 继承自ImmerBaseState，添加Set特有的状态管理属性。
 * Set的草稿化是最复杂的，因为Set中的值可能也需要草稿化。
 *
 * 复杂性来源：
 * - 值草稿化：Set中的对象值可能也需要变为草稿
 * - 引用匹配：需要正确匹配原始值和草稿值
 * - 插入顺序：必须保持Set的插入顺序语义
 * - 唯一性：确保Set中值的唯一性约束
 *
 * 特殊属性说明：
 *
 * @property type_ - 架构类型标识，固定为ArchType.Set
 * @property copy_ - Set的修改副本，包含所有最终值
 * @property base_ - 原始Set对象的引用
 * @property drafts_ - 原始值到草稿值的映射表
 * @property revoked_ - 标记代理是否已被撤销
 * @property draft_ - 草稿Set对象本身的引用
 *
 * drafts_映射表的作用：
 * - 建立原始值与草稿值的对应关系
 * - 确保同一个值在Set中只有一个草稿
 * - 支持has()和delete()操作的正确匹配
 * - 在最终化时正确处理草稿值
 */
export interface SetState extends ImmerBaseState {
	type_: ArchType.Set                           // 类型标识
	copy_: AnySet | undefined                     // 修改副本（懒创建）
	base_: AnySet                                 // 原始Set
	drafts_: Map<any, Drafted>                    // 原始值→草稿值映射
	revoked_: boolean                             // 撤销状态
	draft_: Drafted<AnySet, SetState>             // 草稿引用
}

/* ==================== Patches插件相关类型 ==================== */

/**
 * PatchPath - 补丁路径类型
 *
 * 表示补丁操作的目标路径，用于精确定位要修改的属性。
 * 路径是一个数组，每个元素表示一级属性访问。
 *
 * 路径示例：
 * - [] - 根对象
 * - ["user"] - obj.user
 * - ["user", "name"] - obj.user.name
 * - [0] - arr[0]
 * - ["users", 0, "name"] - obj.users[0].name
 *
 * 类型组成：
 * - string: 对象属性名
 * - number: 数组索引
 *
 * 设计考虑：
 * - 类型安全：明确区分字符串键和数字索引
 * - 序列化友好：可以直接JSON序列化
 * - 简洁性：最小化路径表示的复杂度
 * - 通用性：支持嵌套对象和数组的任意组合
 */
export type PatchPath = (string | number)[]

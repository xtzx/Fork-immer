/**
 * env.ts - 环境常量和Symbol定义
 *
 * 这个文件定义了immer内部使用的核心Symbol常量。
 * 使用Symbol确保了这些标识符的唯一性，避免与用户代码冲突。
 *
 * 设计原则：
 * - 全局唯一性：使用Symbol.for创建全局Symbol
 * - 语义明确：Symbol名称清晰表达用途
 * - 最小依赖：此文件不应有任何导入依赖
 * - 向后兼容：Symbol名称保持稳定
 *
 * 注意：此文件不应包含任何import语句，确保它可以
 * 被其他模块安全导入而不产生循环依赖。
 */

// 应当没有任何import语句！
// Should be no imports here!

/**
 * NOTHING - 删除操作的标记值
 *
 * 这是一个特殊的Symbol，用于在producer函数中表示删除操作。
 * 当producer函数返回NOTHING时，表示要删除整个状态。
 *
 * 设计考虑：
 * - 明确的语义：区分"返回undefined"和"删除"
 * - 类型安全：TypeScript可以正确推导这种特殊情况
 * - 全局一致：使用Symbol.for确保多个immer实例间的一致性
 *
 * 使用场景：
 * 1. 删除数组元素：
 *    produce(arr, draft => {
 *      if (shouldDelete) return nothing
 *    })
 *
 * 2. 条件性删除对象：
 *    produce(obj, draft => {
 *      return shouldExist ? draft : nothing
 *    })
 *
 * 3. 清空状态：
 *    produce(state, () => nothing)
 *
 * 实现细节：
 * - 在最终化阶段，NOTHING会被转换为undefined
 * - 补丁系统会为NOTHING生成相应的删除补丁
 * - 与undefined的区别在于语义和处理方式
 *
 * @type {unique symbol} 确保类型唯一性，避免意外赋值
 */
export const NOTHING: unique symbol = Symbol.for("immer-nothing")

/**
 * DRAFTABLE - 可草稿化标记
 *
 * 这个Symbol用于标记类实例可以被immer草稿化。
 * 默认情况下，immer只处理普通对象和数组，类实例
 * 被认为是不可变的。通过添加此标记，可以让immer
 * 将类实例视为可修改的对象。
 *
 * 设计目的：
 * - 扩展支持：让用户自定义类也能享受immer的便利
 * - 明确意图：用户需要明确表示类实例可以被草稿化
 * - 安全性：避免意外修改不应修改的对象
 * - 兼容性：不破坏现有的类实例处理逻辑
 *
 * 使用方法：
 *
 * 1. 静态属性方式：
 *    class MyClass {
 *      static [immerable] = true
 *      constructor(public value: number) {}
 *    }
 *
 * 2. 实例属性方式：
 *    class MyClass {
 *      [immerable] = true
 *      constructor(public value: number) {}
 *    }
 *
 * 3. 原型设置方式：
 *    MyClass.prototype[immerable] = true
 *
 * 处理逻辑：
 * - isDraftable函数会检查此标记来决定是否可草稿化
 * - 标记为draftable的类实例会使用对象的草稿化逻辑
 * - 保持类的原型链和方法可访问性
 *
 * 注意事项：
 * - 类的方法仍然是不可变的，只有属性可以修改
 * - 需要确保类的设计适合不可变更新模式
 * - 某些具有复杂内部状态的类可能不适合草稿化
 *
 * @type {unique symbol} 确保标记的唯一性和类型安全
 */
export const DRAFTABLE: unique symbol = Symbol.for("immer-draftable")

/**
 * DRAFT_STATE - 草稿状态存储键
 *
 * 这个Symbol用作草稿对象内部状态信息的存储键。
 * 每个草稿对象都会有一个以此Symbol为键的属性，
 * 存储着管理该草稿所需的所有元数据。
 *
 * 存储的状态信息包括：
 * - base_: 原始对象的引用
 * - copy_: 修改后的副本（懒创建）
 * - modified_: 是否被修改的标记
 * - finalized_: 是否已完成最终化
 * - scope_: 所属的作用域
 * - parent_: 父级草稿状态
 * - assigned_: 已分配属性的跟踪
 *
 * 设计优势：
 * - 隐藏实现：用户看不到这些内部状态
 * - 避免冲突：Symbol键确保不会与用户属性冲突
 * - 快速访问：直接作为对象属性，访问效率高
 * - 类型安全：TypeScript可以正确处理Symbol属性
 *
 * 访问模式：
 * - 内部访问：value[DRAFT_STATE]
 * - 类型守卫：通过检查此属性判断是否为草稿
 * - 状态管理：所有草稿操作都基于此状态信息
 *
 * 安全考虑：
 * - 用户无法意外访问或修改内部状态
 * - 序列化时会自动忽略Symbol属性
 * - 不会影响对象的正常使用和遍历
 *
 * 性能考虑：
 * - 直接属性访问，无额外查找开销
 * - Symbol作为属性键的性能与字符串相当
 * - 避免了WeakMap等额外数据结构的开销
 *
 * @type {unique symbol} 确保键的唯一性，避免属性冲突
 */
export const DRAFT_STATE: unique symbol = Symbol.for("immer-state")

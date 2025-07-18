# Immer 源码调试指南

## 概述

本指南将教您如何调试immer源码，深入理解immer的执行流程。我们已经为您配置好了完整的调试环境。

## 🛠️ 调试环境配置

### 1. VS Code 调试配置

我们已经在 `.vscode/launch.json` 中配置了两个调试选项：

- **调试 dev-playground**: 普通的Node.js调试
- **调试 immer 源码**: 支持TypeScript源码调试

### 2. 开发脚本

在 `package.json` 中添加了便捷脚本：

```json
{
  "scripts": {
    "dev": "node dev-playground.js",                    // 普通运行
    "dev:debug": "node --inspect-brk dev-playground.js" // 命令行调试
  }
}
```

## 🐛 调试方法

### 方法一：VS Code 图形化调试（推荐）

#### 步骤1：设置断点

在源码文件中设置断点，推荐位置：

```typescript
// 在 src/core/immerClass.ts 中的 produce 方法
produce: IProduce = (base: any, recipe?: any, patchListener?: any) => {
  debugger; // 在这里设置断点

  if (isDraftable(base)) {
    const scope = enterScope(this)  // 作用域创建断点
    const proxy = createProxy(base, undefined)  // 代理创建断点

    let hasError = true
    try {
      result = recipe(proxy)  // recipe执行断点
      hasError = false
    } finally {
      // 清理逻辑断点
      if (hasError) revokeScope(scope)
      else leaveScope(scope)
    }

    return processResult(result, scope)  // 最终化断点
  }
}
```

#### 步骤2：启动调试

1. 打开VS Code调试面板 (`Ctrl+Shift+D` 或 `Cmd+Shift+D`)
2. 选择 **"调试 immer 源码"** 配置
3. 点击绿色的开始调试按钮
4. 程序会在断点处暂停

#### 步骤3：调试操作

- **F10**: 单步跳过 (Step Over)
- **F11**: 单步进入 (Step Into)
- **Shift+F11**: 单步跳出 (Step Out)
- **F5**: 继续执行 (Continue)

### 方法二：命令行调试

```bash
# 启动调试模式
yarn dev:debug

# 在另一个终端连接调试器
node --inspect-brk dev-playground.js
```

然后在Chrome中打开 `chrome://inspect` 连接调试器。

### 方法三：普通运行观察

```bash
# 简单运行，查看输出
yarn dev

# 或直接运行
node dev-playground.js
```

## 🎯 关键调试点

### 1. produce 函数入口

**文件**: `src/core/immerClass.ts`
**位置**: `produce` 方法开始

```typescript
produce: IProduce = (base: any, recipe?: any, patchListener?: any) => {
  // 🔍 在这里设置断点，观察参数
  console.log('📍 produce 被调用', { base, recipe: recipe.toString() })

  if (isDraftable(base)) {
    // 🔍 观察是否进入可草稿化分支
    const scope = enterScope(this)
```

### 2. 作用域管理

**文件**: `src/core/scope.ts`
**关键函数**: `enterScope`, `leaveScope`, `revokeScope`

```typescript
export function enterScope(immer: Immer): ImmerScope {
  // 🔍 观察作用域创建
  console.log('📍 创建新作用域')
  return currentScope = {
    drafts_: [],
    parent_: currentScope,  // 观察父作用域
    canAutoFreeze_: true,
    immer_: immer,
    unfinalizedDrafts_: 0
  }
}
```

### 3. 代理创建

**文件**: `src/core/proxy.ts`
**关键函数**: `createProxyProxy`

```typescript
export function createProxyProxy<T extends Objectish>(
  base: T,
  parent?: ImmerState
): Drafted<T, ProxyObjectState> {
  // 🔍 观察代理对象创建过程
  console.log('📍 创建代理对象', { base, parent })

  const isArray = isArray(base)
  const state: ProxyObjectState = {
    type_: isArray ? ArchType.Array : ArchType.Object,
    // ... 观察状态初始化
  }
}
```

### 4. 属性访问拦截

**文件**: `src/core/proxy.ts`
**位置**: `objectTraps.get` 和 `objectTraps.set`

```typescript
const objectTraps: ProxyHandler<ProxyState> = {
  get(state: ProxyObjectState, prop) {
    // 🔍 观察属性读取
    console.log('📍 读取属性', { prop, current: peek(latest(state), prop) })
  },

  set(state: ProxyObjectState, prop, value) {
    // 🔍 观察属性写入和写时复制触发
    console.log('📍 设置属性', { prop, value, modified: state.modified_ })

    if (!state.modified_) {
      // 🔍 观察首次修改时的拷贝创建
      prepareCopy(state)
      markChanged(state)
    }
  }
}
```

### 5. 最终化处理

**文件**: `src/core/finalize.ts`
**关键函数**: `processResult`, `finalize`

```typescript
export function processResult(result: any, scope: ImmerScope) {
  // 🔍 观察最终化开始
  console.log('📍 开始最终化', { result, draftsCount: scope.drafts_.length })

  const baseDraft = scope.drafts_![0]
  const isReplaced = result !== undefined && result !== baseDraft

  if (isReplaced) {
    // 🔍 观察替换模式
    console.log('📍 替换模式')
  } else {
    // 🔍 观察标准模式
    console.log('📍 标准模式')
    result = finalize(scope, baseDraft, [])
  }
}
```

## 🔬 调试技巧

### 1. 观察关键变量

在调试过程中重点观察：

```typescript
// 在 produce 执行过程中观察这些变量
- base: 原始对象
- draft: 草稿代理对象
- state: 草稿的内部状态 draft[DRAFT_STATE]
- scope: 当前作用域
- scope.drafts_: 作用域内所有草稿
```

### 2. 使用调试断言

在关键位置添加断言：

```typescript
// 在 dev-playground.js 中添加调试代码
const debugResult = produce(debugState, draft => {
  console.log('Draft 类型:', typeof draft)
  console.log('Draft 是否为代理:', draft[DRAFT_STATE] !== undefined)
  console.log('Base 对象:', draft[DRAFT_STATE]?.base_)
  console.log('Copy 对象:', draft[DRAFT_STATE]?.copy_)

  draft.count = 1

  console.log('修改后 Copy 对象:', draft[DRAFT_STATE]?.copy_)
  console.log('修改标记:', draft[DRAFT_STATE]?.modified_)
})
```

### 3. 比较调试

创建对比测试：

```typescript
// 在 dev-playground.js 中
console.log('=== 修改前 ===')
console.log('原始对象:', debugState)

const result = produce(debugState, draft => {
  console.log('=== 修改中 ===')
  console.log('草稿对象:', draft)
  console.log('草稿状态:', draft[DRAFT_STATE])

  draft.count = 999

  console.log('修改后草稿状态:', draft[DRAFT_STATE])
})

console.log('=== 修改后 ===')
console.log('最终结果:', result)
console.log('对象相等性:', debugState === result)
console.log('属性相等性:', debugState.count === result.count)
```

## 📝 调试检查清单

### 基础流程验证

- [ ] `produce` 函数被正确调用
- [ ] `isDraftable` 正确识别可草稿化对象
- [ ] `enterScope` 创建了新的作用域
- [ ] `createProxy` 创建了代理对象
- [ ] 代理对象被传递给 `recipe` 函数

### 代理行为验证

- [ ] 属性读取触发 `get` 陷阱
- [ ] 属性写入触发 `set` 陷阱
- [ ] 首次修改触发 `prepareCopy`
- [ ] `state.modified_` 被正确设置
- [ ] `state.assigned_` 记录了属性变化

### 最终化验证

- [ ] `processResult` 被调用
- [ ] `finalize` 递归处理所有草稿
- [ ] 未修改的部分返回原始对象
- [ ] 已修改的部分返回新对象
- [ ] `revokeScope` 正确清理资源

### 错误处理验证

- [ ] 异常时 `revokeScope` 被调用
- [ ] 代理被正确撤销
- [ ] 作用域栈被正确恢复

## 🚀 实践练习

### 练习1：跟踪简单修改

```typescript
// 在 dev-playground.js 中添加
const state = { count: 0 }
const result = produce(state, draft => {
  draft.count = 1  // 在这里设置断点
})
```

**调试目标**：

1. 观察 `draft.count = 1` 如何触发 `set` 陷阱
2. 查看 `prepareCopy` 如何创建副本
3. 跟踪 `markChanged` 如何传播修改标记

### 练习2：跟踪嵌套对象

```typescript
const state = { user: { name: 'Alice' } }
const result = produce(state, draft => {
  draft.user.name = 'Bob'  // 在这里设置断点
})
```

**调试目标**：

1. 观察嵌套对象如何被自动代理
2. 查看父子草稿的关系
3. 跟踪修改如何向上传播

### 练习3：跟踪错误处理

```typescript
const state = { count: 0 }
try {
  const result = produce(state, draft => {
    draft.count = 1
    throw new Error('测试错误')  // 在这里设置断点
  })
} catch (error) {
  console.log('捕获错误:', error.message)
}
```

**调试目标**：

1. 观察异常时的 `finally` 块执行
2. 查看 `revokeScope` 如何清理资源
3. 验证作用域栈的正确恢复

## 💡 调试输出示例

成功的调试会看到类似输出：

```
🚀 immer 开发环境启动!
📝 修改此文件来测试新功能，使用 nodemon 可实现自动重载
🐛 在 VS Code 中使用调试配置来调试源码

🔍 调试用简单测试:
📍 produce 被调用 { base: { count: 0, user: { name: 'Debug', age: 25 } } }
📍 创建新作用域
📍 创建代理对象 { base: { count: 0, user: {...} }, parent: undefined }
📍 进入 producer 函数
📍 设置属性 { prop: 'count', value: 1, modified: false }
📍 创建副本 (prepareCopy)
📍 标记修改 (markChanged)
📍 读取属性 { prop: 'user', current: { name: 'Debug', age: 25 } }
📍 创建嵌套代理
📍 设置属性 { prop: 'name', value: 'Debugged', modified: false }
📍 修改完成
📍 开始最终化 { result: undefined, draftsCount: 2 }
📍 标准模式
调试结果: { count: 1, user: { name: 'Debugged', age: 25 } }
```

现在您就有了完整的immer源码调试环境！可以深入探索immer的每一个执行细节了。

// immer 源码学习练习
// 练习1：理解代理陷阱的工作原理

function createLoggingProxy(target) {
  return new Proxy(target, {
    get(target, prop, receiver) {
      console.log(`访问属性: ${String(prop)}`)
      const value = Reflect.get(target, prop, receiver)

      // 如果值是对象，递归创建代理（类似 immer 的做法）
      if (typeof value === 'object' && value !== null) {
        return createLoggingProxy(value)
      }

      return value
    },

    set(target, prop, value, receiver) {
      console.log(`设置属性: ${String(prop)} = ${value}`)
      return Reflect.set(target, prop, value, receiver)
    }
  })
}

// 测试
const obj = { user: { name: 'John', profile: { age: 30 } } }
const proxy = createLoggingProxy(obj)

// 观察 immer 如何延迟创建代理
console.log('=== 访问嵌套属性 ===')
proxy.user.profile.age // 观察代理的创建时机

console.log('=== 修改属性 ===')
proxy.user.name = 'Jane'

// 练习2：实现写时复制（Copy-on-Write）
function createCOWProxy(base) {
  let copy = null
  let modified = false

  return new Proxy(base, {
    get(target, prop) {
      // 如果已修改，从副本读取，否则从原对象读取
      const source = modified ? copy : base
      return source[prop]
    },

    set(target, prop, value) {
      if (!modified) {
        // 第一次修改时创建浅拷贝
        copy = Array.isArray(base) ? [...base] : { ...base }
        modified = true
        console.log('创建副本')
      }
      copy[prop] = value
      return true
    }
  })
}

// 测试写时复制
console.log('\n=== 写时复制测试 ===')
const original = { a: 1, b: 2 }
const cowProxy = createCOWProxy(original)

console.log('读取:', cowProxy.a) // 从原对象读取
cowProxy.a = 10 // 触发副本创建
console.log('修改后:', cowProxy.a) // 从副本读取
console.log('原对象未变:', original.a) // 原对象保持不变
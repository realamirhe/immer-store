import { LogType, Options } from './types'

let _options: Options

export function configureUtils(options: Options) {
  _options = options
}

export function createStateProxy(state, path, getValue, isInitial = false) {
  if (typeof state === 'object' && state !== null) {
    return new Proxy(isInitial ? {} : state, {
      get(target, prop, receiver) {
        if (
          prop === 'length' ||
          typeof prop === 'symbol' ||
          prop === 'inspect'
        ) {
          return state[prop]
        }

        const latestState = getValue('get', state, prop, path)

        const desc = Object.getOwnPropertyDescriptor(target, prop)
        const value = Reflect.get(target, prop, receiver)

        if (desc && !desc.writable && !desc.configurable) return value

        if (typeof latestState[prop] === 'function') {
          return (...args) => {
            return latestState[prop].call(
              createStateProxy(latestState, path, getValue),
              ...args
            )
          }
        }

        const newPath = path.concat(prop)

        return createStateProxy(latestState[prop], newPath, getValue)
      },
      deleteProperty(_, prop) {
        const latestState = getValue('delete', state, prop, path)
        return Reflect.deleteProperty(latestState, prop)
      },
      set(_, prop, ...rest) {
        const latestState = getValue('set', state, prop, path)

        return Reflect.set(latestState, prop, ...rest)
      },
    })
  }
  return state
}

export function log(type: LogType, data: string) {
  return _options.debug && console.log(`# ${type}: ${data}`)
}

import { LogType, Options } from './types'

let _options: Options

export function configureUtils(options: Options) {
  _options = options
}

export const IS_PROXY = Symbol('IS_PROXY')

export function createStateProxy(state, path, getValue, attachProxy = false) {
  if (typeof state === 'object' && state !== null) {
    return new Proxy(attachProxy ? state : {}, {
      get(_, prop) {
        if (prop === IS_PROXY) {
          return true
        }
        if (
          prop === 'length' ||
          typeof prop === 'symbol' ||
          prop === 'inspect'
        ) {
          return state[prop]
        }

        const latestState = getValue('get', state, prop, path)

        if (typeof latestState[prop] === 'function') {
          return (...args) => {
            return latestState[prop].call(
              createStateProxy(latestState, path, getValue, true),
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

import { LogType, Options } from './types'

let _options: Options

export function configureUtils(options: Options) {
  _options = options
}

export function createStateProxy(state, path, getValue, attachProxy = false) {
  return new Proxy(attachProxy ? state : {}, {
    get(_, prop) {
      if (prop === 'length' || typeof prop === 'symbol' || prop === 'inspect') {
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

      if (typeof latestState[prop] === 'object' && latestState[prop] !== null) {
        return createStateProxy(latestState[prop], newPath, getValue)
      }

      return latestState[prop]
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

export function log(type: LogType, data: string) {
  return _options.debug && console.log(`# ${type}: ${data}`)
}

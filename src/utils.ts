import { LogType, Options } from './types'

let _options: Options

export function configureUtils(options: Options) {
  _options = options
}

export function createPathTracker(state, path, paths, attachProxy = true) {
  return new Proxy(attachProxy ? state : {}, {
    get(_, prop) {
      if (prop === 'length' || typeof prop === 'symbol' || prop === 'inspect') {
        return state[prop]
      }

      if (typeof state[prop] === 'function') {
        return (...args) => {
          return state[prop].call(
            createPathTracker(state, path, paths),
            ...args
          )
        }
      }

      const newPath = path.concat(prop)
      paths.add(newPath.join('.'))

      if (typeof state[prop] === 'object' && state[prop] !== null) {
        return createPathTracker(state[prop], newPath, paths)
      }

      return state[prop]
    },
  })
}

export function log(type: LogType, data: string) {
  return _options.debug && console.log(`# ${type}: ${data}`)
}

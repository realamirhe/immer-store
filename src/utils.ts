import { LogType, Options } from './types'

let _options: Options

export function configureUtils(options: Options) {
  _options = options
}

export function createPathTracker(state, path, paths) {
  return new Proxy(
    {},
    {
      ownKeys() {
        return Reflect.ownKeys(state)
      },
      getOwnPropertyDescriptor() {
        return {
          enumerable: true,
          configurable: true,
        }
      },
      get(_, prop) {
        if (typeof state[prop] === 'function') {
          return state[prop]
        }

        const newPath = path.concat(prop)
        paths.add(newPath.join('.'))

        if (typeof state[prop] === 'object' && state[prop] !== null) {
          return createPathTracker(state[prop], newPath, paths)
        }

        return state[prop]
      },
    }
  )
}

export function log(type: LogType, data: string) {
  return _options.debug && console.log(`# ${type}: ${data}`)
}

import { LogType, Options } from './types'

let _options: Options

export function configureUtils(options: Options) {
  _options = options
}

export function log(type: LogType, message: string, ...data) {
  return _options.debug && console.log(`# ${type}: ${message}`, ...data)
}

export function getTarget(paths: string[], source: any) {
  return paths.reduce((aggr, key) => aggr[key], source)
}

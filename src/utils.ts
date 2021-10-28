import { LogType, Options, State } from './types'

let _options: Options

export function configureUtils(options: Options) {
  _options = options
}

export function log(type: LogType, message: string, ...data: any[]) {
  return _options.debug && console.log(`# ${type}: ${message}`, ...data)
}

export function getTarget(paths: string[], source: State): State[keyof State] {
  return paths.reduce((aggregator, key) => aggregator[key], source)
}

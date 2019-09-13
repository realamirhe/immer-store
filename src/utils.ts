import { LogType, Options } from './types'

let _options: Options

export function configureUtils(options: Options) {
  _options = options
}

export function log(type: LogType, data: string) {
  return _options.debug && console.log(`# ${type}: ${data}`)
}

import * as React from 'react'
// @ts-ignore
import { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED } from 'react'
import { context } from './provider'
import { LogType, Config, ActionsWithoutContext } from './types'
import { log } from './utils'

function createPathTracker(state, paths: Set<string>, path: string[] = []) {
  const proxy = new Proxy(
    {},
    {
      get(_, prop) {
        const target = path.reduce((aggr, key) => aggr[key], state) as object
        if (typeof prop === 'symbol') {
          return target[prop]
        }

        const newPath = path.concat(prop as string)
        paths.add(newPath.join('.'))

        if (typeof target[prop] === 'function') {
          return target[prop].bind(createPathTracker(state, paths, path))
        }

        if (typeof target[prop] === 'object' && target[prop] !== null) {
          return createPathTracker(state, paths, newPath)
        }

        return target[prop]
      },
      has(_, prop) {
        const target = path.reduce((aggr, key) => aggr[key], state) as object

        return Reflect.has(target, prop)
      },
    }
  )

  return proxy
}

function throwMissingStoreError() {
  throw new Error(
    'You have not added the Provider and exposed the store to your application. Please read the documentation of how to expose the store'
  )
}

// For typing support we allow you to create a state hook
export function createStateHook<C extends Config<any, any, any>>() {
  function useState<T>(cb: (state: C['state']) => T): T
  function useState(): C['state']
  function useState() {
    // So that we can access the name of the component during development
    const {
      ReactCurrentOwner,
    } = __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
    const name =
      ReactCurrentOwner &&
      ReactCurrentOwner.current &&
      ReactCurrentOwner.current.elementType &&
      ReactCurrentOwner.current.elementType.name
    // To force update the componnet
    const instance = React.useContext(context)

    if (instance) {
      const [state, updateState] = React.useState(instance.state)

      // This tracker grabs the initial path, added to any other paths actually accessed
      const targetState = arguments[0]
      const paths = new Set<string>()

      let targetPath: string[] = []
      if (targetState) {
        const targetPaths = new Set<string>()
        targetState(createPathTracker(state, targetPaths))
        const lastTrackedPath = Array.from(targetPaths).pop()
        targetPath = lastTrackedPath ? lastTrackedPath.split('.') : []
      }

      React.useLayoutEffect(() => {
        // We subscribe to the accessed paths which causes a new render,
        // which again creates a new subscription
        return instance.subscribe(
          (update) => {
            log(
              LogType.COMPONENT_RENDER,
              `"${name}", tracking "${Array.from(paths).join(', ')}"`
            )
            updateState(update)
          },
          paths,
          name
        )
      })

      return targetPath.length
        ? createPathTracker(
            targetPath.reduce((aggr, key) => aggr[key], state),
            paths,
            targetPath
          )
        : createPathTracker(state, paths)
    }

    throwMissingStoreError()
  }

  return useState
}

// For typing support we allow you to create an actions hook
export function createActionsHook<C extends Config<any, any, any>>() {
  // @ts-ignore
  return (): ActionsWithoutContext<C['actions']> => {
    const instance = React.useContext(context)

    if (instance) {
      return instance.actions
    }

    throwMissingStoreError()
  }
}

export function createSelectorHook<C extends Config<any, any, any>>() {
  return <T>(selector: (state: C['state']) => T): T => {
    const instance = React.useContext(context)

    if (instance) {
      const [currentValue, updateState] = React.useState(
        selector(instance.state)
      )
      const forceUpdate = React.useCallback(
        () => updateState(selector(instance.state)),
        []
      )
      React.useLayoutEffect(() => {
        // We subscribe to any update
        return instance.subscribe(forceUpdate)
      })

      return currentValue
    }

    throwMissingStoreError()

    // @ts-ignore
    return
  }
}

// Default hook if you are not using Typescript
export const useState = createStateHook()

// Default hook if you are not using Typescript
export const useActions = createActionsHook()

// Default hook if you are not using Typescript
export const useSelector = createSelectorHook()

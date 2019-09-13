import * as React from 'react'
// @ts-ignore
import { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED } from 'react'
import { context } from './provider'
import { Store, LogType, Config, ActionsWithoutContext } from './types'
import { log, createStateProxy } from './utils'
import { createDraft } from 'immer'

// Creates a state access proxy which basically just tracks
// what paths you are accessing in the state
function createTracker(
  getState: () => Array<any> | object,
  targetPath: string[] = []
) {
  const paths = new Set<string>()

  return {
    getState() {
      return createStateProxy(
        getState(),
        targetPath,
        (type, state, prop, path) => {
          if (type === 'get' && typeof state[prop] !== 'function') {
            paths.add(path.concat(prop).join('.'))
          }

          return state
        }
      )
    },
    getPaths() {
      return paths
    },
  }
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
    const [, updateState] = React.useState()
    const forceUpdate = React.useCallback(() => updateState({}), [])
    const instance = React.useContext(context)

    if (instance) {
      // We create a tracker to figure out what state is actually being accessed
      // by this component
      let tracker

      // This tracker grabs the initial path, added to any other paths actually accessed
      const targetState = arguments[0]
      let targetPath: string[] = []
      if (targetState) {
        const targetTracker = createTracker(() => createDraft(instance.state))
        targetState(targetTracker.getState())
        const lastTrackedPath = Array.from(targetTracker.getPaths()).pop()
        targetPath = lastTrackedPath ? lastTrackedPath.split('.') : []

        tracker = React.useRef(
          createTracker(() => createDraft(instance.state), [])
        ).current
      } else {
        tracker = React.useRef(createTracker(() => createDraft(instance.state)))
          .current
      }

      React.useLayoutEffect(() => {
        // We subscribe to the accessed paths which causes a new render,
        // which again creates a new subscription
        return instance.subscribe(
          () => {
            log(
              LogType.COMPONENT_RENDER,
              `"${name}", tracking "${Array.from(tracker.getPaths()).join(
                ', '
              )}"`
            )
            forceUpdate()
          },
          tracker.getPaths(),
          name
        )
      })

      return targetPath.reduce((aggr, key) => aggr[key], tracker.getState())
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

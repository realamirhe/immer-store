import * as React from 'react'
// @ts-ignore
import { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED } from 'react'
import { context } from './provider'
import { Store, LogType, Config, ActionsWithoutContext } from './types'
import { createPathTracker, log } from './utils'

// Creates a state access proxy which basically just tracks
// what paths you are accessing in the state
function createTracker(instance: { state: any }, targetPath: string[] = []) {
  const paths = new Set<string>()

  return {
    getState() {
      return createPathTracker(instance.state, targetPath, paths, false)
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
export function createStateHook<C extends Config<any, any, any, any>>() {
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
      if (targetState) {
        const targetTracker = createTracker(instance)
        targetState(targetTracker.getState())
        const targetPath = (
          Array.from(targetTracker.getPaths()).pop() || ''
        ).split('.')
        tracker = React.useRef(
          createTracker(
            {
              state: targetPath.reduce(
                (aggr, key) => aggr[key],
                instance.state
              ),
            },
            targetPath
          )
        ).current
      } else {
        tracker = React.useRef(createTracker(instance)).current
      }

      React.useLayoutEffect(() => {
        log(
          LogType.COMPONENT_PATHS,
          `"${Array.from(tracker.getPaths()).join(
            ', '
          )}" on component "${name}"`
        )
        // We subscribe to the accessed paths which causes a new render,
        // which again creates a new subscription
        return instance.subscribe(tracker.getPaths(), forceUpdate, name)
      })

      return tracker.getState()
    }

    throwMissingStoreError()
  }

  return useState
}

// For typing support we allow you to create an actions hook
export function createActionsHook<C extends Config<any, any, any, any>>() {
  // @ts-ignore
  return (): ActionsWithoutContext<C['actions']> => {
    const instance = React.useContext(context)

    if (instance) {
      return instance.actions
    }

    throwMissingStoreError()
  }
}

// Default hook if you are not using Typescript
export const useState = createStateHook()

// Default hook if you are not using Typescript
export const useActions = createActionsHook()

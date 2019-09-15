import * as React from 'react'
// @ts-ignore
import { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED } from 'react'
import { context } from './provider'
import { LogType, Config, ActionsWithoutContext } from './types'
import { log, getTarget } from './utils'

// This proxy manages tracking what components are looking at
function createPathTracker(
  state,
  tracker: { paths: Set<string>; cache?: WeakMap<object, object> },
  path: string[] = []
) {
  // We can not proxy the state itself because that is already a proxy that will be
  // revoked, also causing this proxy to be revoked. Also the state protects itself
  // with "configurable: false" which creates an invarient
  const proxyObject = {}
  const proxy = new Proxy(proxyObject, {
    // When a property descriptor is asked for we make our proxy object look
    // like the state target, preventing any invariant issues
    getOwnPropertyDescriptor(_, prop) {
      // We only track the current path in the proxy and we have access to root state,
      // by reducing the path we quickly get to the property asked for. This is used
      // throughout this proxy
      const target = getTarget(path, state)

      Object.defineProperty(
        proxyObject,
        prop,
        // @ts-ignore
        Object.getOwnPropertyDescriptor(target, prop)
      )

      return Reflect.getOwnPropertyDescriptor(target, prop)
    },
    // Just make sure we proxy the keys from the actual state
    ownKeys() {
      const target = getTarget(path, state)

      return Reflect.ownKeys(target)
    },
    get(_, prop) {
      const target = getTarget(path, state)

      // We do not track symbols
      if (typeof prop === 'symbol') {
        return target[prop]
      }

      const newPath = path.concat(prop as string)
      tracker.paths.add(newPath.join('.'))

      // If we are calling a function, for example "map" we bind that to a new
      // pathTracker so that we keep proxying the iteration
      if (typeof target[prop] === 'function') {
        return target[prop].bind(createPathTracker(state, tracker, path))
      }

      // If we have an array, object or function we create a proxy around it
      if (typeof target[prop] === 'object' && target[prop] !== null) {
        // We first check if this object already has a proxy, so that we ensure
        // the equality is kept. If not, we create a new proxy and add it if
        // we have a cache. We do not use a cache on targeted state, as that only
        // triggers when the targeted state actually changes
        const cached = tracker.cache && tracker.cache.get(target[prop])

        if (cached) {
          return cached
        }

        const proxy = createPathTracker(state, tracker, newPath)

        if (tracker.cache) {
          tracker.cache.set(target[prop], proxy)
        }

        return proxy
      }

      // Any plain value we return as normal
      return target[prop]
    },
    // This trap must also be proxied to the target state
    has(_, prop) {
      const target = getTarget(path, state)

      return Reflect.has(target, prop)
    },
  })

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

    // We grab the instance from the context
    const instance = React.useContext(context)

    // It might not be there, where we throw an error at the end
    if (instance) {
      // Since we deal with immutable values we can use a plain "useState" from
      // React to handle updates from the store
      const [state, updateState] = React.useState(instance.state)

      // Since our subscription ends async (useEffect) we have to
      // make sure we do not update the state during an unmount
      const mountedRef = React.useRef(true)

      // We set it to false when the component unmounts
      React.useEffect(
        () => () => {
          mountedRef.current = false
        },
        []
      )

      // We create a track which holds the current paths and also a proxy cache.
      // This cache ensures that same objects has the same proxies, which is
      // important for comparison in React
      const tracker = React.useRef({
        paths: new Set<string>(),
        cache: new WeakMap<object, object>(),
      })

      // We always clear out the paths before rendering, so that
      // we can collect new paths
      tracker.current.paths.clear()

      // If we are targeting state (nested tracking) that would be a callback as first argument
      // to our "useState" hook
      const targetState = arguments[0]

      // By default we expose the whole state, though if a callback is received
      // this targetPath will be replaced with whatever path we tracked to expose
      // a nested state value
      let targetPath: string[] = []

      // If we have a callback to nested state
      if (targetState) {
        // We create a new SET which will be populated with whatever state
        // we point to in the callback
        const targetPaths = new Set<string>()

        // By creating a pathTracker we can populate this SET
        targetState(createPathTracker(state, { paths: targetPaths }))

        // We only want the last path, as the is the complete path to the value we return
        // ex. useState(state => state.items[0]), we track "items", "items.0". We only
        // want "items.0"
        const lastTrackedPath = Array.from(targetPaths).pop()

        // Then we update our targetPath
        targetPath = lastTrackedPath ? lastTrackedPath.split('.') : []
      }

      React.useEffect(() => {
        // We subscribe to the accessed paths which causes a new render,
        // which again creates a new subscription
        return instance.subscribe(
          (update) => {
            log(
              LogType.COMPONENT_RENDER,
              `"${name}", tracking "${Array.from(tracker.current.paths).join(
                ', '
              )}"`
            )

            // We only update the state if it is actually mounted
            if (mountedRef.current) {
              updateState(update)
            }
          },
          tracker.current.paths,
          name
        )
      })

      // Lastly we return a pathTracker around the actual state
      // we expose to the component
      return targetPath.length
        ? createPathTracker(state, tracker.current, targetPath)
        : createPathTracker(state, tracker.current)
    }

    throwMissingStoreError()
  }

  return useState
}

// For typing support we allow you to create an actions hook
// It just exposes the actions from the store
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

// This hook handles computed state, via reselect
// It subscribes globally (no paths) and will be
// notified about any update to state and calls the selector
// with that state. Since "React.useState" only triggers when
// the value actually changes, we do not have to handle that
export function createComputedHook<C extends Config<any, any, any>>() {
  return <T>(selector: (state: C['state']) => T): T => {
    const instance = React.useContext(context)

    if (instance) {
      const [state, updateState] = React.useState(selector(instance.state))

      // Since our subscription ends async (useEffect) we have to
      // make sure we do not update the state during an unmount
      const mountedRef = React.useRef(true)

      // We set it to false when the component unmounts
      React.useEffect(
        () => () => {
          mountedRef.current = false
        },
        []
      )

      React.useEffect(() => {
        // We subscribe to any update
        return instance.subscribe((update) => {
          if (mountedRef.current) {
            // Since React only renders when this state value
            // actually changed, this is enough
            updateState(selector(update))
          }
        })
      })

      return state
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
export const useComputed = createComputedHook()

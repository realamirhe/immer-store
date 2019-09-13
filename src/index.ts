import { createDraft, finishDraft, Immutable, Draft } from 'immer'
import { createSelector } from 'reselect'
import {
  State,
  LogType,
  BaseActions,
  BaseEffects,
  Store,
  Config,
  Options,
} from './types'
import { log, configureUtils } from './utils'
export {
  createStateHook,
  createActionsHook,
  createSelectorHook,
  useState,
  useActions,
  useSelector,
} from './hooks'
export { Provider } from './provider'
export { IAction } from './types'

export const IS_PROXY = Symbol('IS_PROXY')

// Creates the updated state and a list of paths changed after batched mutations
function getUpdate(draft) {
  const paths = new Set<string>()

  const newState = finishDraft(draft, (operations) => {
    operations.forEach((operation) => {
      // When a key/index is added to an object/array the path to the object/array itself also has a change
      if (operation.op === 'add' || operation.op === 'remove') {
        paths.add(operation.path.slice(0, operation.path.length - 1).join('.'))
      }

      paths.add(operation.path.join('.'))
    })
  })

  return { newState, paths }
}

// Creates a nested structure and handling functions with a factory
// Used by actions and computed
function createNestedStructure(
  structure: object,
  factory: (target: object, key: string, path: string, func: Function) => any,
  path: string[] = []
) {
  return Object.keys(structure).reduce((aggr, key) => {
    const funcOrNested = structure[key]
    const newPath = path.concat(key)

    if (typeof funcOrNested === 'function') {
      return factory(aggr, key, newPath.join('.'), funcOrNested)
    }

    return Object.assign(aggr, {
      [key]: createNestedStructure(funcOrNested, factory, newPath),
    })
  }, {})
}

// Creates the store itself by preparing the state, converting actions to callable
// functions and manage their execution to notify state changes
export function createStore<
  S extends State,
  E extends BaseEffects,
  A extends BaseActions<S, E>
>(config: Config<S, E, A>, options: Options = { debug: true }): Store<S, E, A> {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'test'
  ) {
    options.debug = false
  }

  configureUtils(options)

  let currentState = finishDraft(createDraft(config.state))
  const pathListeners = {}
  const globalListeners: Function[] = []

  // Allows components to subscribe by passing in the paths they are tracking
  function subscribe(
    update: (state: Immutable<Draft<S>>) => void,
    paths?: Set<string>,
    name?: string
  ) {
    // When a component listens to specific paths we create a subscription
    if (paths) {
      const currentPaths = Array.from(paths)
      const subscription = {
        update,
        name,
      }
      // The created subscription is added to each path
      // that it is interested
      currentPaths.forEach((path) => {
        if (!pathListeners[path]) {
          pathListeners[path] = []
        }
        pathListeners[path].push(subscription)
      })

      // We return a dispose function to remove the subscription from the paths
      return () => {
        currentPaths.forEach((path) => {
          pathListeners[path].splice(
            pathListeners[path].indexOf(subscription),
            1
          )
        })
      }
      // Selectors just listens to any update as it uses immutability to compare values
    } else {
      globalListeners.push(update)

      return () => {
        globalListeners.splice(globalListeners.indexOf(update), 1)
      }
    }
  }

  // Is used when mutations has been tracked and any subscribers should be notified
  function updateListeners(paths: Set<string>) {
    const listenersNotified = new Set()

    paths.forEach((path) => {
      if (pathListeners[path]) {
        pathListeners[path].forEach((subscription) => {
          if (!listenersNotified.has(subscription)) {
            subscription.update(currentState)
            listenersNotified.add(subscription)
          }
        })
      }
    })
    globalListeners.forEach((update) => update(currentState))
  }

  // Creates a new version of the state and passes any paths
  // affected to notify subscribers
  function flushMutations(draft, actionName) {
    const { paths, newState } = getUpdate(draft)
    currentState = newState
    if (paths.size) {
      log(
        LogType.MUTATIONS,
        `from "${actionName}" - "${Array.from(paths).join(', ')}"`
      )
      updateListeners(paths)
    } else {
      log(LogType.MUTATIONS, `but no paths changed`)
    }
  }

  function createAction(
    target: object,
    key: string,
    name: string,
    func: (...args) => any
  ) {
    target[key] = (payload) => {
      // We keep track of the current draft. It may change during async execution
      let currentDraft = createDraft(currentState)
      let isAsync = false
      let hasExecuted = false

      function next() {
        if (hasExecuted) {
          return
        }

        flushMutations(currentDraft, name)
        currentDraft = createDraft(currentState)
        isAsync = false
      }

      function asyncNext() {
        if (isAsync) {
          return
        }

        isAsync = true
        Promise.resolve().then(next)
      }

      function finish() {
        hasExecuted = true
        flushMutations(currentDraft, name)
      }

      function createStateProxy(path: string[] = []) {
        const proxy = new Proxy(
          {},
          {
            get(_, prop) {
              const target = path.reduce(
                (aggr, key) => aggr[key],
                currentDraft
              ) as object
              if (typeof prop === 'symbol') {
                return target[prop]
              }

              const newPath = path.concat(prop as string)

              if (typeof target[prop] === 'function') {
                return target[prop].bind(createStateProxy(path))
              }

              if (typeof target[prop] === 'object' && target[prop] !== null) {
                return createStateProxy(newPath)
              }

              return target[prop]
            },
            set(_, prop, value) {
              const target = path.reduce(
                (aggr, key) => aggr[key],
                currentDraft
              ) as object
              asyncNext()
              return Reflect.set(target, prop, value)
            },
            deleteProperty(_, prop) {
              const target = path.reduce(
                (aggr, key) => aggr[key],
                currentDraft
              ) as object
              asyncNext()
              return Reflect.deleteProperty(target, prop)
            },
            has(_, prop) {
              const target = path.reduce(
                (aggr, key) => aggr[key],
                currentDraft
              ) as object

              return Reflect.has(target, prop)
            },
          }
        )

        return proxy
      }

      // We call the defined function passing in the "context"
      const actionResult = func(
        {
          // We create a proxy so that we can prepare a new draft for the action no matter what.
          // If we are just pointing into state, deleting a root property or setting a root property
          state: createStateProxy(),
          // We also pass in the effects
          // TODO: Use a proxy tracker here as well to track effects being called
          effects: config.effects,
        },
        payload
      )

      // If the action returns a promise (probalby async) we wait for it to finish.
      // This indicates that it is time to flush out any mutations
      if (actionResult instanceof Promise) {
        actionResult.then(() => {
          finish()
        })
      } else {
        finish()
      }

      return actionResult
    }

    return target
  }

  const actions = config.actions || {}

  return {
    // Exposes the immutable state on the instance
    get state() {
      return currentState
    },
    subscribe,
    actions: createNestedStructure(actions, createAction),
  }
}

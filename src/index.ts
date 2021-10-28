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
import { log, configureUtils, getTarget } from './utils'

export {
  createStateHook,
  createActionsHook,
  createComputedHook,
  useState,
  useActions,
  useComputed,
} from './hooks'
export { Provider } from './provider'
export { IAction } from './types'

export const GET_BASE_STATE = Symbol('GET_BASE_STATE')

// @ts-ignore
export const createComputed: typeof createSelector = (...args: any[]) => {
  // @ts-ignore
  const selector = createSelector(...args)

  return (state: object) => selector(state[GET_BASE_STATE] || state)
}

// Used to give debugging information about what type of mutations
// are being performed
const arrayMutations = new Set([
  'push',
  'shift',
  'pop',
  'unshift',
  'splice',
  'reverse',
  'sort',
  'copyWithin',
])

// Finishes the draft passed in and produces a SET of
// state paths affected by this draft. This will be used
// to match any paths subscribed to by components
function getNewStateAndChangedPaths<S extends State>(draft: Draft<S>) {
  const paths = new Set<string>()

  const newState = finishDraft(draft, (operations) => {
    operations.forEach((operation) => {
      // When a key/index is added to (removed from) an object/array the path to the object/array itself changes
      if (operation.op !== 'replace') {
        paths.add(operation.path.slice(0, operation.path.length - 1).join('.'))
      }
      paths.add(operation.path.join('.'))
    })
  })

  return { newState, paths }
}

// Creates a nested structure and handling functions with a factory
// Used to create actions
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
  // We force disable debugging in production and in test
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'test'
  ) {
    options.debug = false
  }

  configureUtils(options)

  // We create the initial immutable state
  let currentState = finishDraft(createDraft(config.state))

  // These listeners are for components, which subscribes to paths
  const pathListeners = {}

  // These listeners are for computed which subscribes to any update
  const globalListeners: Function[] = []

  // Allows components to subscribe by passing in the paths they are tracking,
  // also computed subscribes here, though without paths
  function subscribe(
    update: (state: Immutable<Draft<S>>) => void,
    paths?: Set<string>,
    name?: string
  ) {
    // When a component listens to specific paths we create a subscription
    if (paths) {
      const currentPaths = Array.from(paths)
      const subscription = { update, name }
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
    } else {
      // Computed just listens to any update as it uses immutability to compare values
      globalListeners.push(update)

      return () => {
        globalListeners.splice(globalListeners.indexOf(update), 1)
      }
    }
  }

  // Is used when mutations has been tracked and any subscribers should be notified
  function updateListeners(paths: Set<string>) {
    const listenersNotified = new Set()

    // We trigger path subscribers, components
    paths.forEach((path) => {
      if (pathListeners[path]) {
        pathListeners[path].forEach((subscription) => {
          if (!listenersNotified.has(subscription)) {
            listenersNotified.add(subscription)
            subscription.update(currentState)
          }
        })
      }
    })

    // We trigger global subscribers, computed
    globalListeners.forEach((update) => update(currentState))
  }

  // Creates a new version of the state and passes any paths
  // affected to notify subscribers
  function flushMutations(draft: Draft<S>) {
    const { newState, paths } = getNewStateAndChangedPaths(draft)
    currentState = newState
    if (paths.size) {
      log(
        LogType.FLUSH,
        `the following paths: "${Array.from(paths).join(', ')}"`
      )
      updateListeners(paths)
    } else {
      log(LogType.FLUSH, `but no paths changed`)
    }
  }

  // We keep track of the current draft globally. This ensures that all actions
  // always points to the latest draft produced, even when running async
  // FIXME: Why it needs extra casting, it may cause problem by being Immutable<Draft<S>> at the time
  let currentDraft = createDraft(currentState as S)

  // This is the factory for creating actions. It wraps the action from the
  // developer and injects state and effects. It also manages draft updates
  function createAction(
    target: object,
    key: string,
    name: string,
    func: (...args) => any
  ) {
    target[key] = (payload) => {
      // We want to schedule an async update of the draft whenever
      // a mutation occurs. This just ensures that a new draft is ready
      // when the action continues running. We do not want to create
      // it multiple times though, so we keep a flag to ensure we only
      // trigger it once per cycle
      let isAsync = false

      // We also want a flag to indicate that the action is done running, this
      // ensure any async draft requests are prevented when there is no need for one
      let hasExecuted = false

      // This function indicates that mutations may have been performed
      // and it is time to flush out mutations and create a new draft
      function next() {
        if (hasExecuted) {
          return
        }

        flushMutations(currentDraft)
        currentDraft = createDraft(currentState as S)
        isAsync = false
      }

      // Whenever a mutation is performed we trigger this function. We use
      // a mutation to indicate this as we might have multiple async steps
      // and only hook to know when a draft is due is to prepare creation of the
      // next draft when working on the current one
      function asyncNext() {
        if (isAsync) {
          return
        }

        isAsync = true
        Promise.resolve().then(next)
      }

      // This function is called when the action is done execution
      // Just flush out all mutations and prepare a new draft for
      // any next action being triggered
      function finish() {
        next()
        hasExecuted = true
      }

      // This is the proxy the manages the drafts
      function createDraftProxy(path: string[] = []) {
        // We proxy an empty object as proxying the draft itself will
        // cause revoke/invariant issues
        const proxy = new Proxy(
          {},
          {
            // Just a proxy trap needed to target draft state
            getOwnPropertyDescriptor(_, prop) {
              // We only keep track of the path in this proxy and then
              // use that path on the current draft to grab the current draft state
              const target = getTarget(path, currentDraft)

              return Reflect.getOwnPropertyDescriptor(target as object, prop)
            },
            // Just a proxy trap needed to target draft state
            ownKeys() {
              const target = getTarget(path, currentDraft)

              return Reflect.ownKeys(target as object)
            },
            get(_, prop) {
              // Related to using computed in an action we rather want to use
              // the base immutable state. We do not want to allow mutations inside
              // a computed and the returned result should not be mutated either
              if (prop === GET_BASE_STATE) {
                return currentState
              }

              const target = getTarget(path, currentDraft) as object

              // We do not need to handle symbols
              if (typeof prop === 'symbol') {
                return target[prop]
              }

              // We produce the new path
              const newPath = path.concat(prop as string)

              // If we point to a function we need to handle that by
              // returning a new function which manages a couple of things
              if (typeof target[prop] === 'function') {
                return (...args) => {
                  // If we are performing a mutation, which happens
                  // to arrays, we want to handle that
                  if (arrayMutations.has(prop.toString())) {
                    // First by preparing for a new async draft, as this is a mutation
                    asyncNext()
                    log(
                      LogType.MUTATION,
                      `${name} did a ${prop
                        .toString()
                        .toUpperCase()} on path "${path.join('.')}"`,
                      ...args
                    )
                  }

                  // Then we bind the call of the function to a new draftProxy so
                  // that we keep proxying
                  return target[prop].call(createDraftProxy(path), ...args)
                }
              }

              // If object, array or function we return it in a wrapped proxy
              if (typeof target[prop] === 'object' && target[prop] !== null) {
                return createDraftProxy(newPath)
              }

              // Or we just return the value
              return target[prop]
            },
            // This is a proxy trap for assigning values, where we want to perform
            // the assignment on the draft target and also prepare async draft
            set(_, prop, value) {
              const target = getTarget(path, currentDraft)

              asyncNext()
              log(
                LogType.MUTATION,
                `${name} did a SET on path "${path.join('.')}"`,
                value
              )
              return Reflect.set(target as object, prop, value)
            },
            // This is a proxy trap for deleting values, same stuff
            deleteProperty(_, prop) {
              const target = getTarget(path, currentDraft)

              asyncNext()
              log(
                LogType.MUTATION,
                `${name} did a DELETE on path "${path.join('.')}"`
              )
              return Reflect.deleteProperty(target as object, prop)
            },
            // Just a trap we need to handle
            has(_, prop) {
              const target = getTarget(path, currentDraft)

              return Reflect.has(target as object, prop)
            },
          }
        )

        return proxy
      }

      // We call the defined function passing in the "context"
      const actionResult = func(
        {
          state: createDraftProxy(),
          // We also pass in the effects. We could also use a proxy here to
          // track execution of effects, useful for debugging
          effects: config.effects,
        },
        // And we pass whatever payload was passed to the original action
        payload
      )

      // If the action returns a promise (probably async) we wait for it to finish.
      // This indicates that it is time to flush out any mutations and indicate a
      // stop of execution
      if (actionResult instanceof Promise) {
        actionResult
          .then(() => {
            finish()
          })
          .catch(() => console.log('error', name))
      } else {
        // If action stops synchronously we immediately finish up
        // as those mutations needs to be notified to components.
        // Basically handles inputs. A change to an input must run
        // completely synchronously. That means you can never change
        // the value of an input in your state store with async/await.
        // Not special for this library, just the way it is
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

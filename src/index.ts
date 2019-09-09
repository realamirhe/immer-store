import { createDraft, finishDraft } from 'immer'
import {
  State,
  LogType,
  BaseActions,
  BaseEffects,
  ActionsWithoutContext,
  Store,
  Config,
  Options,
} from './types'
import { log, configureUtils } from './utils'
export {
  createStateHook,
  createActionsHook,
  useState,
  useActions,
} from './hooks'
export { Provider } from './provider'

// A type which can be extended by
// interface Action<Payload> extends IAction<Payload, typeof state, typeof effects> {}
export interface IAction<Payload, S extends State, E extends BaseEffects> {
  (
    context: {
      state: S
      effects: E
    },
    payload?: Payload
  ): any
}

// Creates the updated state and a list of paths changed after batched mutations
function getUpdate(draft) {
  const paths = new Set<string>()

  const newState = finishDraft(draft, (operations) => {
    operations.forEach((operation) => {
      // When a key is added to an object the path to the object itself also has a change
      if (operation.op === 'add') {
        paths.add(operation.path.slice(0, operation.path.length - 1).join('.'))
      }
      // TODO: Add other operations

      paths.add(operation.path.join('.'))
    })
  })

  return { newState, paths }
}

// You can create the config using a helper function,
// which is basically only for typing
export function createConfig<
  S extends State,
  E extends BaseEffects,
  A extends BaseActions<S, E>
>(config: Config<S, E, A>) {
  return config
}

// Creates the store itself by preparing the state, converting actions to callable
// functions and manage their execution to notify state changes
export function createStore<
  S extends State,
  E extends BaseEffects,
  A extends BaseActions<S, E>
>(config: Config<S, E, A>, options: Options = { debug: true }): Store<S, A> {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'test'
  ) {
    options.debug = false
  }

  configureUtils(options)

  let currentState = finishDraft(createDraft(config.state))
  const listeners = {}

  // Is used when mutations has been tracked and any subscribers should be notified
  function updateListeners(paths: Set<string>) {
    paths.forEach((path) => {
      if (listeners[path]) {
        listeners[path].forEach((subscription) => {
          log(
            LogType.RENDER,
            `component "${subscription.name}" due to change on "${path}"`
          )
          subscription.update()
        })
      }
    })
  }

  // Creates a new version of the state and passes any paths
  // affected to notify subscribers
  function flushMutations(draft, actionName) {
    const { paths, newState } = getUpdate(draft)

    currentState = newState
    log(LogType.MUTATIONS, `from "${actionName}" - ${Array.from(paths)}`)
    updateListeners(paths)
  }

  function createAction(name: string, func: (...args) => any) {
    return (payload) => {
      // We keep track of the current draft. It may change during async execution
      let currentDraft
      // We also keep track of a timeout as there might be multiple async steps where
      // we want to flush out mutations
      let timeout

      // Used when accessing state to ensure we have a draft and prepare
      // any async updates
      function configureUpdate() {
        if (!currentDraft) {
          currentDraft = createDraft(currentState)
        }
        clearTimeout(timeout)
        timeout = setTimeout(() => {
          flushMutations(currentDraft, name)
          currentDraft = null
        })
      }

      // We call the defined function passing in the "context"
      const actionResult = func(
        {
          // We create a proxy so that we can prepare a new draft for the action no matter what.
          // If we are just pointing into state, deleting a root property or setting a root property
          state: new Proxy(
            {},
            {
              get(_, prop) {
                configureUpdate()
                return currentDraft[prop]
              },
              deleteProperty(_, prop) {
                configureUpdate()
                return Reflect.deleteProperty(currentDraft, prop)
              },
              set(_, prop, ...rest) {
                configureUpdate()
                return Reflect.set(currentDraft, prop, ...rest)
              },
            }
          ),
          // We also pass in the effects
          // TODO: Use a proxy tracker here as well to track effects being called
          effects: config.effects,
        },
        payload
      )

      // If the action returns a promise (probalby async) we wait for it to finish.
      // This indicates that it is time to flush out any mutations
      if (actionResult instanceof Promise) {
        actionResult
          .then(() => {
            clearTimeout(timeout)
            if (currentDraft) {
              flushMutations(currentDraft, name)
              currentDraft = null
            }
          })
          .catch((error) => {
            // There is a caveat. If you are to change state asynchronously you have to point to the
            // actual state object object again, this is to activate a new draft. We could wrap this
            // with proxies again, but seems unnecessary
            if (error.message.indexOf('proxy that has been revoked') > 0) {
              const message = `You are asynchronously changing state in the action "${name}". Make sure you point to "state" again as the previous state draft has been disposed`

              throw new Error(message)
            }

            throw error
          })
        // If the action is done we can immediately flush out mutations
      } else if (currentDraft) {
        clearTimeout(timeout)
        flushMutations(currentDraft, name)
        currentDraft = null
      } else {
        clearTimeout(timeout)
      }

      return actionResult
    }
  }

  function createActions(actions: BaseActions<any, any>, path: string[] = []) {
    return Object.keys(actions).reduce(
      (aggr, key) => {
        const actionOrNested = actions[key]
        const newPath = path.concat(key)

        if (typeof actionOrNested === 'function') {
          return Object.assign(aggr, {
            [key]: createAction(newPath.join('.'), actionOrNested),
          })
        }

        return Object.assign(aggr, {
          [key]: createActions(actionOrNested, newPath),
        })
      },
      {} as ActionsWithoutContext<A>
    )
  }

  const actions = config.actions || {}

  return {
    // Exposes the immutable state on the instance
    get state() {
      return currentState
    },
    // Allows components to subscribe by passing in the paths they are tracking
    subscribe(paths: Set<string>, update: () => void, name: string) {
      const currentPaths = Array.from(paths)
      const subscription = {
        update,
        name,
      }
      // The created subscription is added to each path
      // that it is interested
      currentPaths.forEach((path) => {
        if (!listeners[path]) {
          listeners[path] = []
        }
        listeners[path].push(subscription)
      })

      // We return a dispose function to remove the subscription from the paths
      return () => {
        currentPaths.forEach((path) => {
          listeners[path].splice(listeners[path].indexOf(subscription), 1)
        })
      }
    },
    actions: createActions(actions),
  }
}

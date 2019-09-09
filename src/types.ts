import { Immutable, Draft } from 'immer'

export type Options = {
  debug: boolean
}

export interface Store<S extends State, A extends BaseActions<any, any>> {
  state: Immutable<Draft<S>>
  actions: ActionsWithoutContext<A>
  subscribe(paths: Set<string>, update: () => void, name: string)
}

export interface Config<
  S extends State,
  E extends BaseEffects,
  A extends BaseActions<S, E>
> {
  state: S
  effects?: E
  actions?: A
}

export enum LogType {
  RENDER = 'RENDER',
  MUTATIONS = 'MUTATIONS',
  COMPONENT_PATHS = 'COMPONENT PATHS',
}

export interface State {
  [key: string]: State | string | number | boolean | object | null | undefined
}

export interface BaseActions<S extends State, E extends BaseEffects> {
  [key: string]: (
    context: {
      state: S
      effects: E
    },
    payload?: any
  ) => any | BaseActions<S, E>
}

export interface BaseEffects {
  [key: string]: (...args) => any
}

export type ActionsWithoutContext<U extends BaseActions<any, any>> = {
  [N in keyof U]: U[N] extends (context: any) => any
    ? () => ReturnType<U[N]>
    : U[N] extends (context: any, payload: infer P) => any
    ? (payload: P) => ReturnType<U[N]>
    : U[N] extends BaseActions<any, any>
    ? ActionsWithoutContext<U[N]>
    : never
}

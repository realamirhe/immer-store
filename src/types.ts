import { Immutable, Draft } from 'immer'

export type Options = {
  debug: boolean
}

// A type which can be extended by
// interface Action<Payload> extends IAction<Payload, typeof state, typeof effects> {}
export interface IAction<
  Payload,
  S extends State,
  E extends BaseEffects,
  C extends BaseComputed
> {
  (
    context: {
      state: S
      effects: E
      computed: C
    },
    payload?: Payload
  ): any
}

export interface IComputed<S extends State> {
  (state: S): any
}

export interface Store<
  S extends State,
  C extends BaseComputed,
  A extends BaseActions<any, any, any>
> {
  state: Immutable<Draft<S>>
  computed: ComputedValues<C>
  actions: ActionsWithoutContext<A>
  subscribe(paths: Set<string>, update: () => void, name: string)
}

export interface Config<
  S extends State,
  E extends BaseEffects,
  C extends BaseComputed,
  A extends BaseActions<S, E, C>
> {
  state: S
  effects?: E
  computed?: ComputedValues<C>
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

export interface BaseActions<
  S extends State,
  E extends BaseEffects,
  C extends BaseComputed
> {
  [key: string]: IAction<any, S, E, C>
}

type Func = (...args: any[]) => any

export interface BaseEffects {
  [key: string]: BaseEffects | Func
}

export interface BaseComputed {
  [key: string]: BaseComputed | IComputed<any>
}

export type ActionsWithoutContext<U extends BaseActions<any, any, any>> = {
  [N in keyof U]: U[N] extends (context: any) => any
    ? () => ReturnType<U[N]>
    : U[N] extends (context: any, payload: infer P) => any
    ? (payload: P) => ReturnType<U[N]>
    : U[N] extends BaseActions<any, any, any>
    ? ActionsWithoutContext<U[N]>
    : never
}

export type ComputedValues<C extends BaseComputed> = {
  [N in keyof C]: C[N] extends IComputed<any>
    ? ReturnType<C[N]>
    : C[N] extends ComputedValues<any>
    ? ComputedValues<C[N]>
    : never
}

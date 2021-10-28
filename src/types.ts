import { Immutable, Draft } from 'immer'

export enum LogType {
  RENDER = 'RENDER',
  MUTATION = 'MUTATION',
  FLUSH = 'FLUSH',
  COMPONENT_RENDER = 'COMPONENT RENDER',
}

export interface State {
  [key: string]: State | string | number | boolean | object | null | undefined
}

type GeneralFunction = (...args: any[]) => any
export interface BaseEffects {
  [key: string]: BaseEffects | GeneralFunction
}

interface BaseContext<S extends State, E extends BaseEffects> {
  state: S
  effects: E
}
type GenericAction<S extends State, E extends BaseEffects> = (
  context: BaseContext<S, E>,
  payload?: any
) => any
export interface BaseActions<S extends State, E extends BaseEffects> {
  [key: string]: BaseActions<S, E> | GenericAction<S, E>
}

export type ActionsWithoutContext<A extends BaseActions<any, any>> = {
  [K in keyof A]: A[K] extends (context: BaseContext<any, any>) => any
    ? () => ReturnType<A[K]>
    : A[K] extends (context: BaseContext<any, any>, payload: infer P) => any
    ? (payload: P) => ReturnType<A[K]>
    : A[K] extends BaseActions<any, any>
    ? ActionsWithoutContext<A[K]>
    : never
}

export type Options = { debug: boolean }

export interface Config<
  S extends State,
  E extends BaseEffects,
  A extends BaseActions<S, E>
> {
  state: S
  effects?: E
  actions?: A
}

// A type which can be extended by
// interface Action<Payload> extends IAction<Payload, typeof state, typeof effects> {}
export type IAction<Payload, C extends Config<any, any, any>> = (
  context: BaseContext<C['state'], C['effects']>,
  payload: Payload
) => any

export interface Store<
  S extends State,
  E extends BaseEffects,
  A extends BaseActions<S, E>
> {
  state: Immutable<Draft<S>>
  actions: ActionsWithoutContext<A>

  subscribe(
    update: (state: Immutable<Draft<S>>) => void,
    paths?: Set<string>,
    name?: string
  ): void
}

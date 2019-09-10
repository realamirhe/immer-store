import * as React from 'react'
import { Store } from './types'

export const context = React.createContext<Store<any, any> | null>(null)

export const Provider = ({ store, children }) => (
  <context.Provider value={store}>{children}</context.Provider>
)

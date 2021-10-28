import * as React from 'react'
import { Store } from './types'

const context = React.createContext<Store<any, any, any> | null>(null)

export const useStoreContext = () => {
  const instance = React.useContext(context)
  if (!instance)
    throw new Error(
      'You have not added the Provider and exposed the store to your application. ' +
        'Please read the documentation of how to expose the store'
    )
  return instance
}

export const Provider = ({ store, children }) => (
  <context.Provider value={store}>{children}</context.Provider>
)

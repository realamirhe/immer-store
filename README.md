# immer-store

## Motivation

With the success of [Immer]() there is no doubt that developers has no problems writing pure code in an impure API. The mutation API of JavaScript is straight forward and expressive, but the default result is impure, going against the immutable model favoured by [React](). With **immer-store** we allow Immer to take even more control and basically gets rid of reducers, dispatching and action creators.

**Instead of having to write this:**

```ts
// action creator
const receiveProducts = (products) => ({
  type: RECEIVE_PRODUCTS,
  products
})

// thunk
const getProducts = () => async (dispatch) => {
  dispatch(receiveProducts(await api.getProducts()))
}

// reducer
const productsById = produce((draft, action) => {
  switch (action.type) {
    case RECEIVE_PRODUCTS:
      action.products.forEach((product) => {
        draft[product.id] = product
      })
      return
  }
})
```

**You can just write this:**

```ts
const getProducts = ({ state }, payload) => {
  const products = await api.getProducts()

  products.forEach((product) => {
    state.products[product.id] = product
  })
}
```

Everything is still **immutable**.

## How does it work?

**immer-store** takes inspiration from the "api"-less API of [overmindjs](https://overmindjs.org). The codebase is rather small and commented, so you can take a dive into that. A quick summary though:

- With a combination of chosen API and [Proxies]() **immer-store** exposes a state object to your actions that produces Immer drafts under the hood. The concept of a draft is completely hidden from you. You only think actions and state
- It supports changing state asynchronously in your actions
- Because **immer-store** exposes an action API it also has access to the execution of the action and access to state. That means it is able to batch up mutations and notify components at optimal times to render
- Instead of using **selectors** to expose state to components the **useState** hook tracks automatically what state you access and subscribes to it. That means there is no value comparison in every single hook on every mutation, but **immer-store** tells specifically what components needs to update related to matching batched set of mutations
- **immer-store** has a concept of **effects** which is a simple injection mechanism allowing you to separate generic code from your application logic. It also simplifies testing
- The library is written in [Typescript]() and has excellent support for typing with minimal effort

## Get started

```jsx
import React from 'react'
import { render } from 'react-dom'
import { createStore, Provider, useState, useActions } from 'immer-store'

const store = createStore({
  state: {
    title: ''
  },
  actions: {
    changeTitle: ({ state }, title) => {
      state.title = title
    }
  }
})

function App() {
  const state = useState()
  const actions = useActions()

  return (
    <div>
      <h1>{state.title}</h1>
      <button onClick={() => actions.changeTitle('New Title')}>
        Change title
      </button>
    </div>
  )
}

render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.querySelector('#app')
)
```

## Scaling up

As your application grows you want to separate things a bit more.

```js
// store/index.js
import * as home from '../pages/home'
import * as issues from '../pages/issues'

export const config = {
  state: {
    home: home.state,
    issues: issues.state
  },
  actions: {
    home: home.actions,
    issues: issues.actions
  }
}

// index.js
import { createStore } from 'immer-store'
import { config } from './store'

const store = createStore(config)
```

This structure ensures that you can split up your state and actions into different domains. It also separates the definition of your application from the instantiation of it. That means you can easily reuse the definition multiple times for testing purposes or server side rendering.

## Using effects

Instead of importing 3rd party libraries and writing code with browser side effects etc. **immer-store** allows you to separate it from your application logic in the actions. This creates a cleaner codebase and you get several other benefits:

1. All the code in your actions will be domain specific, no low level generic APIs
2. Your actions will have less code and you avoid leaking out things like URLs, types etc.
3. You decouple the underlying tool from its usage, meaning that you can replace it at any time without changing your application logic
4. You can more easily expand the functionality of an effect. For example you want to introduce caching or a base URL to an HTTP effect
5. You can lazy-load the effect, reducing the initial payload of the app

So you decide what you application **needs** and then an effect will **provide** it:

```js
export const config = {
  state: {...},
  actions: {...},
  effects: {
    storage: {
      get: (key) => {
        const value = localStorage.getItem(key)

        return typeof value === 'string' ? JSON.parse(value) : value
      },
      set: (key, value) => {
        localStorage.setItem(key, JSON.stringify(value))
      }
    },
    http: {
      get: async (url) => {
        const response = fetch(url)

        return response.json()
      }
    }
  }
}
```

**Note!** When using Typescript you have to define your effects as functions (as shown above), not methods. This is common convention, though pointing out it being necessary for typing to work.

## Typing

You got typing straight out of the box with **immer-store**.

```ts
const store = createStore({
  state: {
    title: ''
  },
  actions: {
    changeTitle: ({ state }, title: string) => {
      state.title = title
    }
  }
})

store.state.foo // string
store.actions.changeTitle // (title: string) => void
```

As you scale up you want to do this:

```ts
import { createConfig, IAction } from 'immer-store'

import * as home from '../pages/home'
import * as issues from '../pages/issues'

const state = {
  home: home.state,
  issues: issues.state
}

const actions = {
  home: home.actions,
  issues: issues.actions
}

const effects = {}

// "createConfig" ensures you have defined your state and actions correctly
export const config = createConfig({
  state,
  actions,
  effects
})

// This type can be used within the pages to define actions
export interface Action<Payload>
  extends IAction<Payload, typeof state, typeof effects> {}
```

And then in for example **pages/home/**

```tsx
/*
  ./index.ts
*/
export { state } from './state'
export * as actions from './actions'
export const Home: React.FC = () => {}

/*
  ./state.ts
*/
type State {
  title: string
}

export const state: State = {
  title: ''
}

/*
  ./actions.ts
*/
import { Action } from '../store'

export const changeTitle: Action<string> = ({ state }, title) => {
  state.home.title = title
}
```

## Target state

Since **immer-store** is tracking what components actually use it has a pretty nice optimization especially useful in lists. You can target a piece of state and then ensure that the component only renders again if that specific piece of state changes.

```tsx
const Todo: React.FC<{ id: string }> = ({ id }) => {
  const todo = useState((state) => state.posts[id])
  const actions = useActions()

  return (
    <li>
      <h4>{todo.title}</h4>
      <input
        checked={todo.completed}
        onChange={() => actions.toggleTodo(id)}
      /> {todo.description}
    </li>
  )
}
```

Since we target the **todo** itself this component will only reconcile again if any of its accessed properties change, for example the **completed** state. If you were to rather pass the todo as a prop also the component passing the todo would need to reconcile on any change of the todo. This is an optimization that only makes sense in big lists where individual state items in the list change. Normally when you want to target state you can just:

```tsx
const SomeComponent: React.FC_ = () => {
  const { home, issues } = useState()

  return (
    ...
  )
}
```

## Debugging

**immer-store** knows a lot about your application:

- It knows what actions are changing what state
- It knows what state all components are looking at
- It knows which component renders related to what state change

It is possible to increase the insight even more to get a similar development tool experience as [overmindjs](https://overmindjs.org).

## What is missing?

- Immer provides the concept of snapshots and patching. This is available, just not implemented. The question is what kind of API you want. An example would be to expose a default effect which allows you to start tracking changes to a specific state path with a limit of number of changes. Then you could takes these snapshots and patch them back in
- There is no concept of "computed state". The question again is API
- There is no concept of "reaction". The question again is API

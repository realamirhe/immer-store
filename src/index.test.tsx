import {
  createStore,
  createConfig,
  createStateHook,
  createActionsHook,
  Provider,
} from './'
import * as React from 'react'
import * as renderer from 'react-test-renderer'

describe('React', () => {
  test('should allow using hooks', () => {
    let renderCount = 0
    const config = createConfig({
      state: {
        foo: 'bar',
      },
      actions: {
        updateFoo: ({ state }) => {
          state.foo += '!'
        },
      },
    })
    const useState = createStateHook<typeof config>()
    const store = createStore(config)
    const FooComponent: React.FunctionComponent = () => {
      const state = useState()

      renderCount++

      return <h1>{state.foo}</h1>
    }

    const tree = renderer.create(
      <Provider store={store}>
        <FooComponent />
      </Provider>
    )

    expect(renderCount).toBe(1)

    renderer.act(() => {
      store.actions.updateFoo()
    })

    expect(renderCount).toBe(2)
    expect(tree.toJSON()).toMatchSnapshot()
  })
  test('should handle arrays', () => {
    const config = createConfig({
      state: {
        foo: ['foo', 'bar'],
      },
      actions: {
        updateFoo: ({ state }) => {
          state.foo.push('baz')
        },
      },
    })
    const useState = createStateHook<typeof config>()
    const store = createStore(config)
    const FooComponent: React.FunctionComponent = () => {
      const state = useState()

      return (
        <ul>
          {state.foo.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )
    }

    const tree = renderer.create(
      <Provider store={store}>
        <FooComponent />
      </Provider>
    )

    expect(tree).toMatchSnapshot()

    renderer.act(() => {
      store.actions.updateFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()
  })
  test('should render on object add and remove', () => {
    const config = createConfig({
      state: {
        object: {} as { [key: string]: string },
      },
      actions: {
        addFoo: ({ state }) => {
          state.object.foo = 'bar'
        },
        removeFoo: ({ state, effects }) => {
          delete state.object.foo
        },
      },
    })
    const useState = createStateHook<typeof config>()
    const store = createStore(config)
    const FooComponent: React.FunctionComponent = () => {
      const state = useState()

      return <h1>{state.object.foo ? state.object.foo : 'does not exist'}</h1>
    }

    const tree = renderer.create(
      <Provider store={store}>
        <FooComponent />
      </Provider>
    )

    expect(tree).toMatchSnapshot()

    renderer.act(() => {
      store.actions.addFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()

    renderer.act(() => {
      store.actions.removeFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()
  })
})

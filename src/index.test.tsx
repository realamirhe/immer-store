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
        updateFoo({ state }) {
          state.foo += '!'
        },
      },
    })
    const useState = createStateHook<typeof config>()
    const store = createStore(config)
    const FooComponent: React.FunctionComponent = () => {
      const state = useState()
      console.log(state.foo)
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
        updateFoo({ state }) {
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
})

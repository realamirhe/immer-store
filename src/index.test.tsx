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
      renderCount++

      return <h1>{state.foo}</h1>
    }

    const tree = renderer
      .create(
        <Provider store={store}>
          <FooComponent />
        </Provider>
      )
      .toJSON()

    expect(renderCount).toBe(1)

    renderer.act(() => {
      store.actions.updateFoo()
    })

    expect(renderCount).toBe(2)
    expect(tree).toMatchSnapshot()
  })
})

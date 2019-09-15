import {
  createStore,
  createStateHook,
  Provider,
  createComputedHook,
  IAction,
  createComputed,
} from './'
import * as React from 'react'
import * as renderer from 'react-test-renderer'

const waitForUseEffect = () => new Promise((resolve) => setTimeout(resolve))

describe('React', () => {
  test('should allow using hooks', async () => {
    let renderCount = 0
    const config = {
      state: {
        foo: 'bar',
      },
      actions: {
        updateFoo: ({ state }) => {
          state.foo += '!'
        },
      },
    }
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

    await renderer.act(async () => {
      await waitForUseEffect()
      store.actions.updateFoo()
    })

    expect(renderCount).toBe(2)
    expect(tree.toJSON()).toMatchSnapshot()
  })
  test('should handle arrays', async () => {
    const config = {
      state: {
        foo: ['foo', 'bar'],
      },
      actions: {
        updateFoo: ({ state }) => {
          state.foo.push('baz')
        },
      },
    }
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

    await renderer.act(async () => {
      await waitForUseEffect()
      store.actions.updateFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()
  })
  test('should handle objects', async () => {
    const config = {
      state: {
        foo: {
          foo: 'bar',
          bar: 'baz',
          baz: 'boing',
        },
      },
      actions: {
        updateFoo: ({ state }) => {
          Object.keys(state.foo).forEach((key) => {
            state.foo[key] = state.foo[key].toUpperCase()
          })
        },
      },
    }
    const useState = createStateHook<typeof config>()
    const store = createStore(config)
    const FooComponent: React.FunctionComponent = () => {
      const state = useState()

      return (
        <ul>
          {Object.values(state.foo).map((text) => (
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

    await renderer.act(async () => {
      await waitForUseEffect()
      store.actions.updateFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()
  })
  test('should render on object add and remove', async () => {
    const addFoo: Action = ({ state }) => {
      state.object.foo = 'bar'
    }

    const removeFoo: Action = ({ state }) => {
      delete state.object.foo
    }

    const config = {
      state: {
        object: {} as { [key: string]: string },
      },
      actions: {
        addFoo,
        removeFoo,
      },
    }

    interface Action<Payload = void> extends IAction<Payload, typeof config> {}

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

    await renderer.act(async () => {
      await waitForUseEffect()
      store.actions.addFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()

    await renderer.act(async () => {
      await waitForUseEffect()
      store.actions.removeFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()
  })

  test('should target state', async () => {
    const config = {
      state: {
        foo: [
          {
            title: 'foo',
          },
        ],
      },
      actions: {
        updateFoo: async ({ state }) => {
          const item = state.foo[0]
          item.title = 'foo2'
          await Promise.resolve()
          item.title = 'foo3'
        },
      },
    }
    const useState = createStateHook<typeof config>()
    const store = createStore(config)
    const Item: React.FunctionComponent<{ index: number }> = ({ index }) => {
      const item = useState((state) => state.foo[index])

      return <li>{item.title}</li>
    }
    const FooComponent: React.FunctionComponent = () => {
      const state = useState()

      return (
        <ul>
          {state.foo.map((item, index) => (
            <Item key={item.title} index={index} />
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

    let promise
    await renderer.act(async () => {
      await waitForUseEffect()
      promise = store.actions.updateFoo()
      await Promise.resolve()
      expect(tree.toJSON()).toMatchSnapshot()
    })
    await renderer.act(async () => {
      await promise
      expect(tree.toJSON()).toMatchSnapshot()
    })

    expect(false)
  })

  test('should allow async changes', async () => {
    const config = {
      state: {
        foo: ['foo', 'bar'],
      },
      actions: {
        updateFoo: async ({ state }) => {
          state.foo[0] += '2'
          await Promise.resolve()
          state.foo[0] += '3'
        },
      },
    }

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

    let promise
    await renderer.act(async () => {
      await waitForUseEffect()
      promise = store.actions.updateFoo()
      await Promise.resolve()
      expect(tree.toJSON()).toMatchSnapshot()
    })
    await renderer.act(async () => {
      await promise
      expect(tree.toJSON()).toMatchSnapshot()
    })

    expect(tree.toJSON()).toMatchSnapshot()
  })
  test('should handle cross async action changes', async () => {
    const config = {
      state: {
        foo: 'bar',
      },
      actions: {
        updateFoo: async ({ state }) => {
          state.foo += '1'
          await new Promise((resolve) => setTimeout(resolve))
          state.foo += '1'
        },
        updateFoo2: async ({ state }) => {
          await Promise.resolve()
          state.foo += '2'
        },
      },
    }

    const useState = createStateHook<typeof config>()
    const store = createStore(config)
    const FooComponent: React.FunctionComponent = () => {
      const state = useState()

      return <h1>{state.foo}</h1>
    }

    const tree = renderer.create(
      <Provider store={store}>
        <FooComponent />
      </Provider>
    )

    await renderer.act(async () => {
      await waitForUseEffect()
      return Promise.all([
        store.actions.updateFoo(),
        store.actions.updateFoo2(),
      ])
    })

    expect(tree.toJSON()).toMatchSnapshot()
  })
  test('should allow usage of computed', async () => {
    const config = {
      state: {
        foo: ['foo', 'bar'],
      },
      actions: {
        updateFoo: ({ state }) => {
          state.foo.push('baz')
        },
      },
    }

    const useComputed = createComputedHook<typeof config>()
    const store = createStore(config)

    const getFoo = (state: typeof config['state']) => state.foo
    const upperFooSelector = createComputed([getFoo], (foo) =>
      foo.map((text) => text.toUpperCase())
    )

    const FooComponent: React.FunctionComponent = () => {
      const upperFoo = useComputed(upperFooSelector)

      return (
        <ul>
          {upperFoo.map((text) => (
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

    await renderer.act(async () => {
      await waitForUseEffect()
      store.actions.updateFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()
  })
  test('should keep reference on proxies when same object to manage comparison', async () => {
    let objectRenderCount = 0
    const config = {
      state: {
        foo: 'bar',
        objects: [{}],
      },
      actions: {
        updateFoo: ({ state }) => {
          state.foo = 'bar2'
        },
      },
    }

    const useState = createStateHook<typeof config>()
    const store = createStore(config)
    const ObjectComponent = React.memo<{ object: object }>(({ object }) => {
      objectRenderCount++

      return <div></div>
    })
    const FooComponent: React.FunctionComponent = () => {
      const state = useState()

      return (
        <div>
          <h1>{state.foo}</h1>
          {state.objects.map((object, index) => (
            <ObjectComponent key={index} object={object} />
          ))}
        </div>
      )
    }

    renderer.create(
      <Provider store={store}>
        <FooComponent />
      </Provider>
    )

    await renderer.act(async () => {
      await waitForUseEffect()
      store.actions.updateFoo()
    })

    expect(objectRenderCount).toBe(1)
  })
})

[**realtime-voice-component**](../README.md)

***

# Type Alias: UseGhostCursorReturn

```ts
type UseGhostCursorReturn = object;
```

## Properties

### cursorState

```ts
cursorState: GhostCursorState;
```

***

### hide()

```ts
hide: () => void;
```

#### Returns

`void`

***

### run()

```ts
run: <TResult>(target, operation, options?) => Promise<TResult>;
```

#### Type Parameters

##### TResult

`TResult`

#### Parameters

##### target

[`GhostCursorTarget`](GhostCursorTarget.md)

##### operation

() => `Promise`\<`TResult`\> \| `TResult`

##### options?

[`GhostCursorMotionOptions`](GhostCursorMotionOptions.md)

#### Returns

`Promise`\<`TResult`\>

***

### runEach()

```ts
runEach: <TItem, TResult>(items, resolveTarget, operation, options?) => Promise<TResult[]>;
```

#### Type Parameters

##### TItem

`TItem`

##### TResult

`TResult`

#### Parameters

##### items

`TItem`[]

##### resolveTarget

(`item`, `index`) => [`GhostCursorTarget`](GhostCursorTarget.md) \| `null` \| `undefined`

##### operation

(`item`, `index`) => `Promise`\<`TResult`\> \| `TResult`

##### options?

[`GhostCursorMotionOptions`](GhostCursorMotionOptions.md)

#### Returns

`Promise`\<`TResult`[]\>

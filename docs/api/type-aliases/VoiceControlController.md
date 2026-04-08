[**realtime-voice-component**](../README.md)

***

# Type Alias: VoiceControlController

```ts
type VoiceControlController = UseVoiceControlReturn & object;
```

## Type Declaration

### configure()

```ts
configure: (options) => void;
```

#### Parameters

##### options

[`UseVoiceControlOptions`](UseVoiceControlOptions.md)

#### Returns

`void`

### destroy()

```ts
destroy: () => void;
```

#### Returns

`void`

### getSnapshot()

```ts
getSnapshot: () => VoiceControlSnapshot;
```

#### Returns

[`VoiceControlSnapshot`](VoiceControlSnapshot.md)

### subscribe()

```ts
subscribe: (listener) => () => void;
```

#### Parameters

##### listener

() => `void`

#### Returns

```ts
(): void;
```

##### Returns

`void`

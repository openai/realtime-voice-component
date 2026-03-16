[**realtime-voice-component**](../README.md)

***

# Type Alias: UseVoiceControlReturn

```ts
type UseVoiceControlReturn = VoiceControlSnapshot & object;
```

## Type Declaration

### clearToolCalls()

```ts
clearToolCalls: () => void;
```

#### Returns

`void`

### connect()

```ts
connect: () => Promise<void>;
```

#### Returns

`Promise`\<`void`\>

### disconnect()

```ts
disconnect: () => void;
```

#### Returns

`void`

### requestResponse()

```ts
requestResponse: () => void;
```

#### Returns

`void`

### sendClientEvent()

```ts
sendClientEvent: (event) => void;
```

#### Parameters

##### event

[`RealtimeClientEvent`](RealtimeClientEvent.md)

#### Returns

`void`

### startCapture()

```ts
startCapture: () => void;
```

#### Returns

`void`

### stopCapture()

```ts
stopCapture: () => void;
```

#### Returns

`void`

### updateInstructions()

```ts
updateInstructions: (instructions) => void;
```

#### Parameters

##### instructions

`string`

#### Returns

`void`

### updateSession()

```ts
updateSession: (patch) => void;
```

#### Parameters

##### patch

[`VoiceControlRealtimeSessionPatch`](VoiceControlRealtimeSessionPatch.md)

#### Returns

`void`

### updateTools()

```ts
updateTools: (tools) => void;
```

#### Parameters

##### tools

[`VoiceTool`](VoiceTool.md)\<`any`\>[]

#### Returns

`void`

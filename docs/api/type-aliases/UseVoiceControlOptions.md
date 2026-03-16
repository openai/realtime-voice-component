[**realtime-voice-component**](../README.md)

***

# Type Alias: UseVoiceControlOptions

```ts
type UseVoiceControlOptions = object;
```

## Properties

### activationMode?

```ts
optional activationMode: ActivationMode;
```

***

### audio?

```ts
optional audio: RealtimeAudioConfig;
```

***

### auth

```ts
auth: 
  | {
  getClientSecret: () => Promise<string>;
}
  | {
  tokenEndpoint: string;
  tokenRequestInit?: RequestInit;
};
```

***

### autoConnect?

```ts
optional autoConnect: boolean;
```

***

### debug?

```ts
optional debug: boolean;
```

***

### include?

```ts
optional include: RealtimeSessionInclude[];
```

***

### instructions?

```ts
optional instructions: string;
```

***

### maxOutputTokens?

```ts
optional maxOutputTokens: number | "inf";
```

***

### maxToolCallHistory?

```ts
optional maxToolCallHistory: number | null;
```

***

### model?

```ts
optional model: RealtimeModel;
```

***

### onError()?

```ts
optional onError: (error) => void;
```

#### Parameters

##### error

[`VoiceControlError`](VoiceControlError.md)

#### Returns

`void`

***

### onEvent()?

```ts
optional onEvent: (event) => void;
```

#### Parameters

##### event

[`VoiceControlEvent`](VoiceControlEvent.md)

#### Returns

`void`

***

### onToolError()?

```ts
optional onToolError: (call) => void;
```

#### Parameters

##### call

[`ToolCallErrorEvent`](ToolCallErrorEvent.md)

#### Returns

`void`

***

### onToolStart()?

```ts
optional onToolStart: (call) => void;
```

#### Parameters

##### call

[`ToolCallEvent`](ToolCallEvent.md)

#### Returns

`void`

***

### onToolSuccess()?

```ts
optional onToolSuccess: (call) => void;
```

#### Parameters

##### call

[`ToolCallResultEvent`](ToolCallResultEvent.md)

#### Returns

`void`

***

### outputMode?

```ts
optional outputMode: OutputMode;
```

***

### postToolResponse?

```ts
optional postToolResponse: boolean;
```

***

### prompt?

```ts
optional prompt: RealtimePrompt;
```

***

### session?

```ts
optional session: VoiceControlRealtimeSessionOptions;
```

***

### toolChoice?

```ts
optional toolChoice: RealtimeToolChoice;
```

***

### tools

```ts
tools: VoiceTool<any>[];
```

***

### tracing?

```ts
optional tracing: RealtimeTracing | null;
```

***

### transportFactory()?

```ts
optional transportFactory: () => RealtimeTransport;
```

#### Returns

`RealtimeTransport`

***

### truncation?

```ts
optional truncation: RealtimeTruncation;
```

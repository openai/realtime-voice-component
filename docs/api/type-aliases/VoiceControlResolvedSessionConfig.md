[**realtime-voice-component**](../README.md)

***

# Type Alias: VoiceControlResolvedSessionConfig

```ts
type VoiceControlResolvedSessionConfig = object;
```

## Properties

### activationMode

```ts
activationMode: ActivationMode;
```

***

### audio?

```ts
optional audio: RealtimeAudioConfig;
```

***

### include?

```ts
optional include: RealtimeSessionInclude[];
```

***

### instructions

```ts
instructions: string;
```

***

### maxOutputTokens?

```ts
optional maxOutputTokens: number | "inf";
```

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

***

### model

```ts
model: RealtimeModel;
```

***

### outputMode

```ts
outputMode: OutputMode;
```

***

### prompt?

```ts
optional prompt: RealtimePrompt;
```

***

### raw?

```ts
optional raw: Record<string, unknown>;
```

***

### toolChoice?

```ts
optional toolChoice: RealtimeToolChoice;
```

***

### tools

```ts
tools: RealtimeFunctionTool[];
```

***

### tracing?

```ts
optional tracing: RealtimeTracing | null;
```

***

### truncation?

```ts
optional truncation: RealtimeTruncation;
```

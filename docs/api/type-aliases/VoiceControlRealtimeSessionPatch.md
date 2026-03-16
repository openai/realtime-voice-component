[**realtime-voice-component**](../README.md)

***

# Type Alias: VoiceControlRealtimeSessionPatch

```ts
type VoiceControlRealtimeSessionPatch = object;
```

## Properties

### audio?

```ts
optional audio: RealtimeAudioConfig | null;
```

***

### include?

```ts
optional include: RealtimeSessionInclude[] | null;
```

***

### maxOutputTokens?

```ts
optional maxOutputTokens: number | "inf" | null;
```

***

### metadata?

```ts
optional metadata: Record<string, unknown> | null;
```

***

### prompt?

```ts
optional prompt: RealtimePrompt | null;
```

***

### raw?

```ts
optional raw: Record<string, unknown> | null;
```

***

### toolChoice?

```ts
optional toolChoice: RealtimeToolChoice | null;
```

***

### tracing?

```ts
optional tracing: RealtimeTracing | null;
```

***

### truncation?

```ts
optional truncation: RealtimeTruncation | null;
```

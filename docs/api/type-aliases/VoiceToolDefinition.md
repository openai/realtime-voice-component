[**realtime-voice-component**](../README.md)

***

# Type Alias: VoiceToolDefinition\<TArgs\>

```ts
type VoiceToolDefinition<TArgs> = object;
```

## Type Parameters

### TArgs

`TArgs` = `unknown`

## Properties

### description

```ts
description: string;
```

***

### execute()

```ts
execute: (args) => Promise<unknown> | unknown;
```

#### Parameters

##### args

`TArgs`

#### Returns

`Promise`\<`unknown`\> \| `unknown`

***

### name

```ts
name: string;
```

***

### parameters

```ts
parameters: ZodLikeSchema<TArgs>;
```

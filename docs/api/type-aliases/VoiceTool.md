[**realtime-voice-component**](../README.md)

***

# Type Alias: VoiceTool\<TArgs\>

```ts
type VoiceTool<TArgs> = VoiceToolDefinition<TArgs> & object;
```

## Type Declaration

### jsonSchema

```ts
jsonSchema: JsonSchema;
```

### parseArguments()

```ts
parseArguments: (rawArgs) => TArgs;
```

#### Parameters

##### rawArgs

`string`

#### Returns

`TArgs`

### realtimeTool

```ts
realtimeTool: RealtimeFunctionTool;
```

## Type Parameters

### TArgs

`TArgs` = `unknown`

[**realtime-voice-component**](../README.md)

***

# Type Alias: JsonSchema

```ts
type JsonSchema = object;
```

## Indexable

```ts
[key: string]: unknown
```

## Properties

### additionalProperties?

```ts
optional additionalProperties: boolean | JsonSchema;
```

***

### allOf?

```ts
optional allOf: JsonSchema[];
```

***

### anyOf?

```ts
optional anyOf: JsonSchema[];
```

***

### description?

```ts
optional description: string;
```

***

### enum?

```ts
optional enum: readonly unknown[];
```

***

### items?

```ts
optional items: JsonSchema | JsonSchema[];
```

***

### oneOf?

```ts
optional oneOf: JsonSchema[];
```

***

### properties?

```ts
optional properties: Record<string, JsonSchema>;
```

***

### required?

```ts
optional required: readonly string[];
```

***

### type?

```ts
optional type: string;
```

[**realtime-voice-component**](../README.md)

***

# Type Alias: RealtimeToolChoice

```ts
type RealtimeToolChoice = 
  | "none"
  | "auto"
  | "required"
  | {
  name: string;
  type: "function";
}
  | {
  name?: string;
  serverLabel: string;
  type: "mcp";
};
```

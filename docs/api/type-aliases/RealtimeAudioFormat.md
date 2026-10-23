[**realtime-voice-component**](../README.md)

---

# Type Alias: RealtimeAudioFormat

```ts
type RealtimeAudioFormat = "pcm16" | "g711_ulaw" | "g711_alaw";
```

Use these string values for `audio.input.format` and `audio.output.format`. The
transport converts them to Realtime API format objects when creating or updating
a session: `pcm16` becomes `{ type: "audio/pcm", rate: 24000 }`, `g711_ulaw` becomes
`{ type: "audio/pcmu" }`, and `g711_alaw` becomes `{ type: "audio/pcma" }`.
Omitting a format leaves it out of the request. This conversion only serializes
the configuration; it does not resample or transcode audio.

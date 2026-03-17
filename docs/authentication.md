# Authentication

Use a server endpoint to proxy the browser WebRTC offer to OpenAI.

Do not use a standard OpenAI API key in the browser.

## `sessionEndpoint`

Pass:

```tsx
auth={{ sessionEndpoint: "/session" }}
```

The client will:

- create the local SDP offer in the browser
- send a `POST /session` multipart request with `sdp` and serialized session config
- expect your server to return the answer SDP from OpenAI

If you need custom headers or credentials, use `sessionRequestInit`:

```tsx
auth={{
  sessionEndpoint: "/session",
  sessionRequestInit: {
    credentials: "include"
  }
}}
```

## Example Express handler

```ts
app.post("/session", async (request, response) => {
  const contentType = request.header("content-type");

  const realtimeResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      ...(contentType ? { "Content-Type": contentType } : {})
    },
    body: request,
    duplex: "half"
  });

  response
    .status(realtimeResponse.status)
    .type(realtimeResponse.headers.get("content-type") ?? "application/sdp")
    .send(await realtimeResponse.text());
});
```

Leave the incoming multipart body untouched unless you intentionally want to
merge or override the session on your server before forwarding it to OpenAI.

## Legacy Compatibility

The library still supports the older client-secret bootstrap paths:

- `auth={{ tokenEndpoint: "/token" }}`
- `auth={{ getClientSecret: async () => "..." }}`

Use these only if you specifically want the browser to POST SDP directly to
OpenAI with a short-lived client secret.

## `getClientSecret`

If you already have your own fetch path, pass an async loader instead:

```tsx
auth={{
  getClientSecret: async () => {
    const response = await fetch("/token");
    const payload = await response.json();
    return payload.value ?? payload.client_secret?.value;
  }
}}
```

Use this only for the legacy client-secret flow when you want full control over
retries, auth headers, or request flow.

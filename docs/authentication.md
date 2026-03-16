# Authentication

Use a server endpoint to mint short-lived Realtime client secrets.

Do not mint Realtime client secrets in the browser.

## `tokenEndpoint`

Pass:

```tsx
auth={{ tokenEndpoint: "/token" }}
```

The client will:

- send `GET /token`
- append the selected model as `?model=...`
- expect your server to return a short-lived client secret

Accepted response shapes:

```json
{ "value": "rtm_..." }
```

```json
{ "client_secret": "rtm_..." }
```

```json
{
  "client_secret": {
    "value": "rtm_..."
  }
}
```

The simplest response is a flattened `value`.

If you need custom headers or credentials, use `tokenRequestInit`:

```tsx
auth={{
  tokenEndpoint: "/token",
  tokenRequestInit: {
    credentials: "include"
  }
}}
```

## Example Express handler

```ts
app.get("/token", async (request, response) => {
  const realtimeResponse = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model:
          typeof request.query.model === "string"
            ? request.query.model
            : "gpt-realtime-1.5",
        output_modalities: ["text"]
      }
    })
  });

  if (!realtimeResponse.ok) {
    response.status(realtimeResponse.status).send(await realtimeResponse.text());
    return;
  }

  const payload = await realtimeResponse.json();
  const value =
    payload.value ??
    (typeof payload.client_secret === "object" && payload.client_secret !== null
      ? payload.client_secret.value
      : payload.client_secret);

  response.json({ ...payload, value });
});
```

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

Use this when you want full control over retries, auth headers, or request flow.

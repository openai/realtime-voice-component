import { createServer } from "node:http";

const port = Number(process.env.DEMO_TOKEN_PORT ?? 3211);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method !== "GET" || requestUrl.pathname !== "/token") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(response, 500, {
      error: "Missing OPENAI_API_KEY in the environment."
    });
    return;
  }

  try {
    const model = requestUrl.searchParams.get("model") || "gpt-realtime-1.5";
    const realtimeResponse = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          output_modalities: ["text"]
        }
      })
    });

    if (!realtimeResponse.ok) {
      sendJson(response, realtimeResponse.status, {
        error: "Failed to mint a Realtime client secret.",
        details: await realtimeResponse.text()
      });
      return;
    }

    const payload = await realtimeResponse.json();
    const fromNested =
      typeof payload.client_secret === "object" && payload.client_secret !== null
        ? payload.client_secret.value
        : undefined;

    sendJson(response, 200, {
      ...payload,
      value: payload.value ?? fromNested ?? payload.client_secret
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected token server failure."
    });
  }
});

server.listen(port, () => {
  console.log(`Demo token server listening on http://localhost:${port}`);
});

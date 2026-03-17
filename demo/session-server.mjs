import { createServer } from "node:http";

const port = Number(process.env.DEMO_SESSION_PORT ?? process.env.DEMO_TOKEN_PORT ?? 3211);

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

  if (request.method !== "POST" || requestUrl.pathname !== "/session") {
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
    const contentType = request.headers["content-type"];
    const realtimeResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {})
      },
      body: request,
      duplex: "half"
    });

    if (!realtimeResponse.ok) {
      response.writeHead(realtimeResponse.status, {
        "Content-Type": realtimeResponse.headers.get("content-type") ?? "text/plain; charset=utf-8"
      });
      response.end(await realtimeResponse.text());
      return;
    }

    response.writeHead(200, {
      "Content-Type": realtimeResponse.headers.get("content-type") ?? "application/sdp; charset=utf-8"
    });
    response.end(await realtimeResponse.text());
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected session server failure."
    });
  }
});

server.listen(port, () => {
  console.log(`Demo session server listening on http://localhost:${port}`);
});

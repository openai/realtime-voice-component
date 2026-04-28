/**
 * server-session-proxy.ts — Express endpoint for OpenAI Realtime SDP proxy
 *
 * Why a server proxy?
 *
 * The OpenAI Realtime API requires your API key. Exposing it in browser code
 * would allow any visitor to run up your OpenAI bill. This proxy route sits
 * between the browser (which sends an SDP offer) and OpenAI (which returns
 * an SDP answer). The key never leaves the server.
 *
 * The realtime-voice-component sends a POST to your sessionEndpoint with:
 *   - sdp: the WebRTC SDP offer (string)
 *   - session: optional JSON blob with { model: "gpt-4o-realtime-preview" }
 *
 * This route validates, rate-limits, and proxies the SDP to OpenAI's
 * /v1/realtime/calls endpoint, then returns the SDP answer to the browser.
 *
 * Rate limiting: 10 sessions per IP per hour (in-memory, resets on restart).
 * For production, replace with Redis-backed rate limiting.
 *
 * Usage (Express):
 *   import { registerVoiceRoutes } from "./server-session-proxy";
 *   registerVoiceRoutes(app);
 *
 * Required env var:
 *   OPENAI_API_KEY — your OpenAI API key with Realtime access
 */

import type { Express, Request } from "express";
import multer from "multer";

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "[voice] WARNING: OPENAI_API_KEY is not set. " +
    "The /api/voice-session route will return 503 until this is configured.",
  );
}

const upload = multer({ storage: multer.memoryStorage() });

// ── In-memory rate limiter ────────────────────────────────────────────────

const voiceRateLimitMap = new Map<string, number[]>();
const VOICE_RATE_LIMIT_MAX = 10;           // sessions per window
const VOICE_RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms

// Prune stale entries every 10 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of voiceRateLimitMap) {
    const valid = timestamps.filter((t) => now - t < VOICE_RATE_LIMIT_WINDOW);
    if (valid.length === 0) {
      voiceRateLimitMap.delete(ip);
    } else {
      voiceRateLimitMap.set(ip, valid);
    }
  }
}, 10 * 60 * 1000);

function isVoiceRateLimited(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const timestamps = (voiceRateLimitMap.get(ip) || []).filter(
    (t) => now - t < VOICE_RATE_LIMIT_WINDOW,
  );
  if (timestamps.length >= VOICE_RATE_LIMIT_MAX) {
    return true;
  }
  timestamps.push(now);
  voiceRateLimitMap.set(ip, timestamps);
  return false;
}

// ── Route registration ────────────────────────────────────────────────────

export function registerVoiceRoutes(app: Express): void {
  app.post(
    "/api/voice-session",
    upload.none(), // parse multipart/form-data (realtime-voice-component sends form data)
    async (req, res) => {
      // 1. Rate limit
      if (isVoiceRateLimited(req)) {
        res.status(429).json({
          error: "Too many voice session requests. Please try again later.",
        });
        return;
      }

      // 2. Check API key
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.status(503).json({
          error: "Voice feature is not configured on this server.",
        });
        return;
      }

      // 3. Validate SDP offer
      const sdp = req.body?.sdp as string | undefined;
      if (!sdp) {
        res.status(400).json({ error: "Missing SDP offer." });
        return;
      }

      // 4. Extract model (optional — defaults to gpt-4o-realtime-preview)
      let model = "gpt-4o-realtime-preview";
      try {
        const sessionJson = req.body?.session as string | undefined;
        if (sessionJson) {
          const sessionData = JSON.parse(sessionJson) as { model?: string };
          if (sessionData.model) {
            model = sessionData.model;
          }
        }
      } catch {
        // Keep default model if JSON parse fails
      }

      // 5. Proxy to OpenAI Realtime
      try {
        const openaiRes = await fetch(
          `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/sdp",
            },
            body: sdp,
          },
        );

        if (!openaiRes.ok) {
          const details = await openaiRes.text();
          console.error("[voice-session] OpenAI error:", openaiRes.status, details);
          res.status(openaiRes.status).send(details);
          return;
        }

        // Return the SDP answer to the browser
        const answerSdp = await openaiRes.text();
        res.setHeader("Content-Type", "application/sdp");
        res.status(200).send(answerSdp);
      } catch (err) {
        console.error("[voice-session] Proxy error:", err);
        res.status(502).json({ error: "Failed to connect to voice service." });
      }
    },
  );
}

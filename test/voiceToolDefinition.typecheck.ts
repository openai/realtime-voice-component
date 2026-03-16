import { z } from "zod";

import type { VoiceToolDefinition } from "../src/types";

const zodParameters: VoiceToolDefinition<{ value: string }>["parameters"] = z.object({
  value: z.string()
});

void zodParameters;

const jsonSchema = {
  type: "object",
  properties: {
    value: {
      type: "string"
    }
  },
  required: ["value"]
} as const;
// @ts-expect-error defineVoiceTool() now requires a Zod schema instead of plain JSON Schema.
const invalidParameters: VoiceToolDefinition<{ value: string }>["parameters"] = jsonSchema;

void invalidParameters;

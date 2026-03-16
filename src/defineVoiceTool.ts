import { isZodSchema, normalizeToolSchema, parseToolArguments } from "./schema";
import type { VoiceTool, VoiceToolDefinition } from "./types";

export function defineVoiceTool<TArgs>(definition: VoiceToolDefinition<TArgs>): VoiceTool<TArgs> {
  if (!isZodSchema(definition.parameters)) {
    throw new Error(
      "Plain JSON Schema tool definitions are no longer supported. Pass a Zod schema to defineVoiceTool()."
    );
  }

  const jsonSchema = normalizeToolSchema(definition.parameters);

  return {
    ...definition,
    jsonSchema,
    realtimeTool: {
      type: "function",
      name: definition.name,
      description: definition.description,
      parameters: jsonSchema
    },
    parseArguments(rawArgs: string) {
      return parseToolArguments<TArgs>(definition.parameters, rawArgs);
    }
  };
}

import { toJSONSchema } from "zod";

import type { JsonSchema, ZodLikeSchema } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isZodSchema(schema: unknown): schema is ZodLikeSchema {
  return isPlainObject(schema) && "safeParse" in schema && typeof schema.safeParse === "function";
}

function stripSchemaMetadata(schema: JsonSchema): JsonSchema {
  const { $schema, definitions, $ref, ...rest } = schema;

  if (typeof $ref === "string" && definitions && typeof definitions === "object") {
    const key = $ref.split("/").at(-1);
    const definitionMap = definitions as Record<string, unknown>;
    if (key && key in definitionMap) {
      return stripSchemaMetadata(definitionMap[key] as JsonSchema);
    }
  }

  return rest;
}

export function normalizeToolSchema(schema: ZodLikeSchema): JsonSchema {
  return stripSchemaMetadata(toJSONSchema(schema as never) as JsonSchema);
}

export function parseToolArguments<TArgs>(schema: ZodLikeSchema<TArgs>, rawArgs: string): TArgs {
  const parsed = rawArgs.trim().length === 0 ? {} : JSON.parse(rawArgs);
  return schema.parse(parsed) as TArgs;
}

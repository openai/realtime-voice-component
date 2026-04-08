import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineVoiceTool } from "../src/defineVoiceTool";

describe("defineVoiceTool", () => {
  it("normalizes Zod schemas into realtime tool definitions", () => {
    const tool = defineVoiceTool({
      name: "set_first_name",
      description: "Set the first name.",
      parameters: z.object({
        value: z.string().min(1)
      }),
      execute: ({ value }: { value: string }) => ({ ok: true, value })
    });

    expect(tool.realtimeTool).toMatchObject({
      type: "function",
      name: "set_first_name",
      description: "Set the first name."
    });
    expect(tool.jsonSchema.type).toBe("object");
    expect(tool.jsonSchema.properties?.value?.type).toBe("string");
    expect(tool.jsonSchema.required).toContain("value");
    expect(tool.parseArguments("{\"value\":\"Ada\"}")).toEqual({ value: "Ada" });
  });

  it("rejects plain JSON Schema tool definitions at runtime", () => {
    const schema = {
      type: "object",
      properties: {
        theme: {
          type: "string",
          enum: ["light", "dark"]
        }
      },
      required: ["theme"],
      additionalProperties: false
    } as const;

    expect(() =>
      defineVoiceTool({
        name: "set_theme",
        description: "Set the app theme.",
        parameters: schema as never,
        execute: ({ theme }: { theme: "light" | "dark" }) => ({ ok: true, theme })
      })
    ).toThrowError(
      "Plain JSON Schema tool definitions are no longer supported. Pass a Zod schema to defineVoiceTool()."
    );
  });
});

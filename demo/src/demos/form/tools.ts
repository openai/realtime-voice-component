import { defineVoiceTool, type UseGhostCursorReturn } from "realtime-voice-component";
import { z } from "zod";

import {
  buildUnfilledFieldsSnapshot,
  getSimpleFormFieldLabel,
  SIMPLE_FORM_FIELD_KEYS,
  type SimpleFormFieldKey,
  type SimpleFormValues
} from "./config";

type SimpleFormPreparedUpdate = {
  key: SimpleFormFieldKey;
  applyValue: boolean | string;
  value: string;
};

type CreateSetFieldToolOptions = {
  applyFieldUpdate: (
    update: SimpleFormPreparedUpdate
  ) => {
    changed: boolean;
    alreadyActive: boolean;
  };
  getFieldElement: (key: SimpleFormFieldKey) => HTMLElement | null;
  runCursor: UseGhostCursorReturn["run"];
};

type CreateGetUnfilledFieldsToolOptions = {
  getValues: () => SimpleFormValues;
};

type CreateSubmitFormToolOptions = {
  getSubmitButton: () => HTMLButtonElement | null;
  runCursor: UseGhostCursorReturn["run"];
  submitForm: () => Promise<
    { ok: true; submitted: SimpleFormValues } | { ok: false; invalidFields: SimpleFormFieldKey[] }
  >;
};

const BIRTHDAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateBirthday(value: string) {
  if (!BIRTHDAY_PATTERN.test(value)) {
    throw new Error("birthday must use YYYY-MM-DD format.");
  }

  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3) {
    throw new Error("birthday must be a real calendar date.");
  }

  const [year, month, day] = parts as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isValid) {
    throw new Error("birthday must be a real calendar date.");
  }

  return value;
}

function normalizeCheckboxValue(rawValue: string, key: SimpleFormFieldKey) {
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "yes") {
    return {
      applyValue: true,
      value: "yes"
    };
  }

  if (normalized === "no") {
    return {
      applyValue: false,
      value: "no"
    };
  }

  throw new Error(`${key} must be yes or no.`);
}

function prepareFieldUpdate(key: SimpleFormFieldKey, rawValue: string): SimpleFormPreparedUpdate {
  if (key === "name") {
    const normalized = rawValue.trim();
    if (normalized.length === 0) {
      throw new Error("name cannot be empty.");
    }

    if (normalized.length > 80) {
      throw new Error("name must be at most 80 characters.");
    }

    return {
      key,
      applyValue: normalized,
      value: normalized
    };
  }

  if (key === "birthday") {
    const normalized = validateBirthday(rawValue.trim());
    return {
      key,
      applyValue: normalized,
      value: normalized
    };
  }

  if (key === "newsletter_opt_in" || key === "accept_terms") {
    return {
      key,
      ...normalizeCheckboxValue(rawValue, key)
    };
  }

  const normalized = rawValue.trim();

  if (normalized.length > 280) {
    throw new Error("notes must be at most 280 characters.");
  }

  return {
    key,
    applyValue: normalized,
    value: normalized
  };
}

export function createSetFieldTool({
  applyFieldUpdate,
  getFieldElement,
  runCursor
}: CreateSetFieldToolOptions) {
  return defineVoiceTool({
    name: "set_field",
    description: "Set one supported form field. Use exactly one field per call.",
    parameters: z.object({
      key: z.enum(SIMPLE_FORM_FIELD_KEYS),
      value: z.string()
    }),
    async execute({ key, value }) {
      const preparedUpdate = prepareFieldUpdate(key, value);
      const element = getFieldElement(key);

      const result = await runCursor(
        {
          element,
          pulseElement: element
        },
        async () => applyFieldUpdate(preparedUpdate),
        {
          easing: "smooth",
          from: "previous"
        }
      );

      return {
        ok: true,
        key,
        label: getSimpleFormFieldLabel(key),
        value: preparedUpdate.value,
        changed: result.changed,
        alreadyActive: result.alreadyActive
      };
    }
  });
}

export function createGetUnfilledFieldsTool({
  getValues
}: CreateGetUnfilledFieldsToolOptions) {
  return defineVoiceTool({
    name: "get_unfilled_fields",
    description: "Return which simple form fields are still missing or unset.",
    parameters: z.object({}),
    async execute() {
      return buildUnfilledFieldsSnapshot(getValues());
    }
  });
}

export function createSubmitFormTool({
  getSubmitButton,
  runCursor,
  submitForm
}: CreateSubmitFormToolOptions) {
  return defineVoiceTool({
    name: "submit_form",
    description: "Submit the current form after requested edits are complete.",
    parameters: z.object({}),
    async execute() {
      const button = getSubmitButton();

      return runCursor(
        {
          element: button,
          pulseElement: button
        },
        async () => submitForm(),
        {
          easing: "smooth",
          from: "previous"
        }
      );
    }
  });
}

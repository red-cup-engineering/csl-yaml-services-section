#!/usr/bin/env node
import { decodeCslYamlText } from "./csl-yaml.mjs";
import { runCommand } from "./csl-yaml-face.mjs";

export const operationDefinition = {
  name: "decodeCslYaml",
  description: "Decodes CSL-YAML (a references: sequence of CSL items, or a citekey-keyed map) into validated, normalized CSL-JSON items, reporting every normalization as a warning.",
  inputSchema: {
    type: "object",
    required: ["text"],
    additionalProperties: false,
    properties: {
      text: { type: "string", description: "YAML text: bare, ---/... fenced, or Markdown-frontmatter fenced." },
      strict: { type: "boolean", description: "Also require the house item subset (id, title, issued year, an author or editor). Default false." },
    },
  },
  outputSchema: {
    type: "object",
    required: ["items", "count", "dialect", "warnings"],
    additionalProperties: false,
    properties: {
      items: { type: "array" },
      count: { type: "integer", minimum: 0 },
      dialect: { enum: ["csl", "citekey-map", "empty", "none"] },
      warnings: { type: "array" },
    },
  },
};

/**
 * Decodes CSL-YAML text to validated CSL-JSON items, in source order.
 * @param {{text: string, strict?: boolean}} request
 * @returns {{items: object[], count: number, dialect: string, warnings: object[]}}
 * @throws {TypeError} When the YAML is invalid, has no references: key, holds a non-mapping entry, or any item fails validation (all findings listed); duplicate ids are refused.
 * @throws {RangeError} When the text exceeds 4 MiB or holds more than 5000 items.
 */
export function decodeCslYaml(request) {
  if (request === null || typeof request !== "object" || Array.isArray(request)) throw new TypeError("request must be an object with text");
  for (const key of Object.keys(request)) if (!["text", "strict"].includes(key)) throw new TypeError(`request does not admit ${key}`);
  if (request.strict !== undefined && typeof request.strict !== "boolean") throw new TypeError("strict must be a boolean");
  return decodeCslYamlText(request.text, { strict: request.strict === true });
}

if (import.meta.main) await runCommand(operationDefinition, decodeCslYaml);

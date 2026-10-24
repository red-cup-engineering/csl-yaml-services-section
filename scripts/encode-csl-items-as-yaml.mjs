#!/usr/bin/env node
import { canonicalCslItems, emitCslYaml } from "./csl-yaml.mjs";
import { runCommand, yamlOutputSchema } from "./csl-yaml-face.mjs";

export const operationDefinition = {
  name: "encodeCslItemsAsYaml",
  description: "Encodes CSL-JSON items as Pandoc-compatible references: YAML: items validated, sorted by id, keys in one fixed order, so the same items always give the same bytes.",
  inputSchema: {
    type: "object",
    required: ["items"],
    additionalProperties: false,
    properties: {
      items: { type: "array", description: "CSL-JSON items (csl-data.json, CSL 1.0.2)." },
      fence: { type: "boolean", description: "Wrap the YAML in --- and ... markers. Default false." },
    },
  },
  outputSchema: yamlOutputSchema,
};

/**
 * Encodes CSL-JSON items as a Pandoc `references:` YAML document.
 * @param {{items: object[], fence?: boolean}} request
 * @returns {{text: string, count: number}} the YAML bytes and the item count.
 * @throws {TypeError} When the request is malformed, an item is not valid CSL-JSON (unknown type, bad name or date, no id), or two items share an id.
 * @throws {RangeError} When there are more than 5000 items, the output exceeds 4 MiB, or an item does not round-trip through YAML losslessly.
 */
export function encodeCslItemsAsYaml(request) {
  if (request === null || typeof request !== "object" || Array.isArray(request)) throw new TypeError("request must be an object with items");
  for (const key of Object.keys(request)) if (!["items", "fence"].includes(key)) throw new TypeError(`request does not admit ${key}`);
  if (request.fence !== undefined && typeof request.fence !== "boolean") throw new TypeError("fence must be a boolean");
  const items = canonicalCslItems(request.items);
  return { text: emitCslYaml(items, { fence: request.fence === true }), count: items.length };
}

if (import.meta.main) await runCommand(operationDefinition, encodeCslItemsAsYaml);

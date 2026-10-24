#!/usr/bin/env node
import { projectBibliographyRecordsCsl } from "@red-cup-engineering/bibliography-engineering-services-section/csl";
import { canonicalCslItems, emitCslYaml } from "./csl-yaml.mjs";
import { runCommand, yamlOutputSchema } from "./csl-yaml-face.mjs";

export const operationDefinition = {
  name: "projectBibliographyRecordsAsCslYaml",
  description: "Projects bibliography-engine records (type: bibliography carrier frontmatter) as Pandoc-compatible CSL YAML, through the bibliography engine's own CSL projection; sorted by citekey, byte-reproducible.",
  inputSchema: {
    type: "object",
    required: ["records"],
    additionalProperties: false,
    properties: {
      records: { type: "array", description: "Bibliography records: type, key, reference-type, authors, year, title, optional publication/publisher/translator/url/doi/note/eprint; body is not needed." },
      fence: { type: "boolean", description: "Wrap the YAML in --- and ... markers. Default false." },
    },
  },
  outputSchema: yamlOutputSchema,
};

/**
 * Projects bibliography records as CSL YAML. The CSL projection is the bibliography
 * engine's (`projectBibliographyRecordsCsl`); this operation only encodes its items.
 * @param {{records: object[], fence?: boolean}} request
 * @returns {{text: string, count: number}}
 * @throws {TypeError} When the request is malformed, a record is not an admissible bibliography record (`records[i]: ...`), or two records share a key.
 * @throws {RangeError} When there are more than 5000 records or the output exceeds 4 MiB.
 */
export function projectBibliographyRecordsAsCslYaml(request) {
  if (request === null || typeof request !== "object" || Array.isArray(request)) throw new TypeError("request must be an object with records");
  for (const key of Object.keys(request)) if (!["records", "fence"].includes(key)) throw new TypeError(`request does not admit ${key}`);
  if (request.fence !== undefined && typeof request.fence !== "boolean") throw new TypeError("fence must be a boolean");
  if (!Array.isArray(request.records)) throw new TypeError("records must be an array of bibliography records");
  if (request.records.length > 5000) throw new RangeError(`at most 5000 records per request; received ${request.records.length}`);
  const items = canonicalCslItems(JSON.parse(JSON.stringify(projectBibliographyRecordsCsl(request.records))));
  return { text: emitCslYaml(items, { fence: request.fence === true }), count: items.length };
}

if (import.meta.main) await runCommand(operationDefinition, projectBibliographyRecordsAsCslYaml);

// The CSL-YAML algebra shared by the three operations: canonical item form, the YAML
// emission, and the lossless-round-trip witness. Pure: no filesystem, clock or network.
import { decodeYaml, encodeYaml } from "@red-cup-engineering/yaml-frontmatter-codec-service";
import { isCslType, isValidCslName, recognizeCslItem } from "@red-cup-engineering/csl-json-services-section";
import { decodeReferencesValue, referencesFrontmatterValue } from "@red-cup-engineering/csl-json-services-section/csl-references";

export const MAX_ITEMS = 5000;
export const MAX_YAML_CHARACTERS = 4 * 1024 * 1024;

/** CSL variables that lead an item, in this order; every other variable follows in code-point order. */
export const LEADING_VARIABLES = Object.freeze([
  "id", "type", "title", "title-short", "author", "editor", "translator", "container-author", "container-title", "container-title-short",
  "collection-title", "collection-editor", "publisher", "publisher-place", "edition", "volume", "issue", "number", "page",
  "issued", "accessed", "original-date", "DOI", "ISBN", "ISSN", "PMID", "PMCID", "URL", "language", "abstract", "keyword", "note",
]);
export const NAME_VARIABLES = Object.freeze([
  "author", "chair", "collection-editor", "compiler", "composer", "container-author", "contributor", "curator", "director", "editor",
  "editorial-director", "executive-producer", "guest", "host", "illustrator", "interviewer", "narrator", "organizer", "original-author",
  "performer", "producer", "recipient", "reviewed-author", "script-writer", "series-creator", "translator",
]);
const NAME_KEYS = Object.freeze(["family", "given", "non-dropping-particle", "dropping-particle", "suffix", "literal", "comma-suffix", "static-ordering", "parse-names"]);
const DATE_KEYS = Object.freeze(["date-parts", "season", "circa", "literal", "raw"]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const codePointCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function orderedKeys(object, leading) {
  const present = Object.keys(object).filter((key) => object[key] !== undefined && object[key] !== null);
  return [...leading.filter((key) => present.includes(key)), ...present.filter((key) => !leading.includes(key)).sort(codePointCompare)];
}

function canonical(value, leading = []) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== undefined && entry !== null).map((entry) => canonical(entry));
  if (!isRecord(value)) return value;
  const leadingKeys = leading.length > 0 ? leading : "family" in value || "literal" in value ? NAME_KEYS : "date-parts" in value ? DATE_KEYS : [];
  return Object.fromEntries(orderedKeys(value, leadingKeys).map((key) => [key, canonical(value[key])]));
}

/** One item in the deterministic CSL-YAML key order, `null`/`undefined` values dropped. */
export function canonicalCslItem(item) {
  return canonical(item, LEADING_VARIABLES);
}

function checkJson(value, path, findings) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number") { if (!Number.isFinite(value)) findings.push(`${path}: non-finite number`); return; }
  if (Array.isArray(value)) { value.forEach((entry, index) => checkJson(entry, `${path}[${index}]`, findings)); return; }
  if (isRecord(value)) { for (const [key, entry] of Object.entries(value)) if (entry !== undefined) checkJson(entry, `${path}.${key}`, findings); return; }
  findings.push(`${path}: not a JSON value`);
}

function validDate(date) {
  if (!isRecord(date)) return false;
  if (Array.isArray(date["date-parts"])) return date["date-parts"].every((tuple) => Array.isArray(tuple) && tuple.length > 0 && tuple.every((part) => Number.isInteger(part) || (typeof part === "string" && /^\d+$/u.test(part))));
  return typeof date.literal === "string" || typeof date.raw === "string";
}

/** Structural findings for one CSL-JSON item (the subset every consumer needs; not the house admission). */
export function structuralFindings(item, path) {
  const findings = [];
  if (!isRecord(item)) return [`${path}: item must be an object`];
  if (typeof item.id !== "string" || item.id.trim() === "") findings.push(`${path}.id: must be a non-empty string`);
  if (!isCslType(item.type)) findings.push(`${path}.type: ${JSON.stringify(item.type ?? null)} is not a CSL 1.0.2 type`);
  if (item.title !== undefined && item.title !== null && typeof item.title !== "string") findings.push(`${path}.title: must be a string`);
  for (const variable of NAME_VARIABLES) {
    const names = item[variable];
    if (names === undefined || names === null) continue;
    if (!Array.isArray(names) || names.length === 0 || !names.every(isValidCslName)) findings.push(`${path}.${variable}: must be a non-empty array of CSL names ({family[,given]} | {literal})`);
  }
  for (const variable of ["issued", "accessed", "original-date", "submitted", "event-date"]) {
    if (item[variable] !== undefined && item[variable] !== null && !validDate(item[variable])) findings.push(`${path}.${variable}: not a CSL date object`);
  }
  checkJson(item, path, findings);
  return findings;
}

function refuse(prefix, findings) {
  return new TypeError(`${prefix}: ${findings.slice(0, 20).join("; ")}${findings.length > 20 ? `; ... ${findings.length - 20} more` : ""}`);
}

/** The deterministic item list for `items`: validated, ids unique, sorted by id (code points), keys canonical. */
export function canonicalCslItems(items) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array of CSL-JSON items");
  if (items.length > MAX_ITEMS) throw new RangeError(`at most ${MAX_ITEMS} items per request; received ${items.length}`);
  const findings = items.flatMap((item, index) => structuralFindings(item, `items[${index}]`));
  const seen = new Map();
  items.forEach((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string") return;
    if (seen.has(item.id)) findings.push(`items[${index}].id: duplicate of items[${seen.get(item.id)}] (${JSON.stringify(item.id)})`);
    else seen.set(item.id, index);
  });
  if (findings.length > 0) throw refuse("CSL items refused", findings);
  return items.map(canonicalCslItem).sort((a, b) => codePointCompare(a.id, b.id));
}

/**
 * The Pandoc `references:` YAML for already-canonical items, with the witness that
 * the text decodes back to exactly those items.
 */
export function emitCslYaml(canonicalItems, { fence = false } = {}) {
  const body = encodeYaml({ references: referencesFrontmatterValue(canonicalItems) });
  if (body.length > MAX_YAML_CHARACTERS) throw new RangeError(`YAML output exceeds ${MAX_YAML_CHARACTERS} characters`);
  let back;
  try { back = decodeYaml(body).references; } catch (error) { throw new RangeError(`items are not representable as YAML: ${error.message}`); }
  if (JSON.stringify(back ?? []) !== JSON.stringify(canonicalItems)) {
    const index = canonicalItems.findIndex((item, at) => JSON.stringify(item) !== JSON.stringify((back ?? [])[at]));
    throw new RangeError(`item ${JSON.stringify(canonicalItems[index]?.id)} does not round-trip through YAML losslessly`);
  }
  return fence ? `---\n${body}...\n` : body;
}

const DATE_VARIABLES = Object.freeze(["issued", "accessed", "original-date", "submitted", "event-date"]);

/**
 * csl-json's normalization turns string and number shapes into CSL objects, but it rebuilds name
 * objects from {family, given, literal} and date objects from date-parts only, so a name's particles
 * and suffix and a date's literal, raw, season and circa would be lost. A name or date that is
 * already a valid CSL object is therefore taken from the source unchanged.
 */
function keepCslObjects(items, raw) {
  return items.map((item, index) => {
    const source = Array.isArray(raw) ? raw[index] : undefined;
    if (!isRecord(source)) return item;
    const kept = { ...item };
    for (const variable of NAME_VARIABLES) {
      const names = source[variable];
      if (Array.isArray(names) && names.length > 0 && names.every((name) => isRecord(name) && isValidCslName(name))) kept[variable] = names;
    }
    for (const variable of DATE_VARIABLES) if (validDate(source[variable])) kept[variable] = source[variable];
    return kept;
  });
}

const FENCED = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*\r?\n?$/u;

/** Decode CSL-YAML text (bare, `---`/`...` fenced, or Markdown-frontmatter fenced) to normalized items. */
export function decodeCslYamlText(text, { strict = false } = {}) {
  if (typeof text !== "string" || !text.isWellFormed()) throw new TypeError("text must be well-formed Unicode YAML text");
  if (text.length > MAX_YAML_CHARACTERS) throw new RangeError(`YAML text exceeds ${MAX_YAML_CHARACTERS} characters`);
  const match = FENCED.exec(text);
  let record;
  try { record = decodeYaml(match === null ? text : match[1]); } catch (error) { throw new TypeError(`CSL YAML refused: ${error.message}`); }
  if (!("references" in record)) throw new TypeError("CSL YAML refused: the document has no references: key");
  const raw = record.references;
  const decoded = decodeReferencesValue(raw);
  const { dialect } = decoded;
  const items = dialect === "csl" ? keepCslObjects(decoded.items, raw) : decoded.items;
  if (dialect === "mixed") throw new TypeError("CSL YAML refused: references: is neither a sequence of CSL items nor a citekey-keyed map");
  const rawCount = Array.isArray(raw) ? raw.length : raw === null || raw === undefined ? 0 : Object.keys(raw).length;
  if (items.length !== rawCount) throw new TypeError(`CSL YAML refused: ${rawCount - items.length} of ${rawCount} references entries are not mappings`);
  if (items.length > MAX_ITEMS) throw new RangeError(`at most ${MAX_ITEMS} items per request; found ${items.length}`);
  const warnings = [];
  items.forEach((item, index) => {
    const sourceType = Array.isArray(raw) ? raw[index]?.type : undefined;
    if (typeof sourceType === "string" && sourceType !== item.type) warnings.push({ id: item.id ?? null, path: `references[${index}].type`, message: `type ${JSON.stringify(sourceType)} normalized to ${JSON.stringify(item.type)}` });
  });
  const findings = items.flatMap((item, index) => structuralFindings(item, `references[${index}]`));
  if (strict) items.forEach((item, index) => findings.push(...recognizeCslItem(item).findings.map(({ path, message }) => `references[${index}]${path}: ${message}`)));
  const seen = new Map();
  items.forEach((item, index) => {
    if (typeof item.id !== "string") return;
    if (seen.has(item.id)) findings.push(`references[${index}].id: duplicate of references[${seen.get(item.id)}] (${JSON.stringify(item.id)})`);
    else seen.set(item.id, index);
  });
  if (findings.length > 0) throw refuse("CSL YAML refused", findings);
  return { items: items.map((item) => canonicalCslItem(JSON.parse(JSON.stringify(item)))), count: items.length, dialect, warnings };
}

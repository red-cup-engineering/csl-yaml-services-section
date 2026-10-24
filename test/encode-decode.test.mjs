import test from "node:test";
import assert from "node:assert/strict";
import { encodeCslItemsAsYaml } from "../scripts/encode-csl-items-as-yaml.mjs";
import { decodeCslYaml } from "../scripts/decode-csl-yaml.mjs";
import { canonicalCslItem } from "../scripts/csl-yaml.mjs";
import { items } from "./helpers.mjs";

const shuffled = (list) => [...list].reverse().map((item) => Object.fromEntries(Object.entries(item).reverse()));

test("encode is byte-reproducible regardless of item order or key order, and sorts by id", () => {
  const first = encodeCslItemsAsYaml({ items: items() });
  const second = encodeCslItemsAsYaml({ items: shuffled(items()) });
  assert.equal(first.text, second.text);
  assert.equal(first.count, 4);
  const ids = [...first.text.matchAll(/^ {2}- id: (.+)$/gmu)].map((match) => match[1]);
  assert.deepEqual(ids, ["\"001\"", "chapter-1", "web-1", "zotero-book"]);
  assert.ok(first.text.startsWith("references:\n  - id:"));
  assert.ok(first.text.endsWith("\n") && !first.text.endsWith("\n\n"));
});

test("encode puts the CSL variables in one fixed order with names and dates ordered inside", () => {
  const { text } = encodeCslItemsAsYaml({ items: [items()[1]] });
  const keys = [...text.matchAll(/^(?: {2}- | {4})([A-Za-z-]+):/gmu)].map((match) => match[1]);
  assert.deepEqual(keys, ["id", "type", "title", "author", "editor", "container-title", "volume", "page", "issued", "accessed", "DOI", "URL", "language", "abstract", "note"]);
  assert.match(text, /- family: van der Berg\n {8}given: Jan\n {8}non-dropping-particle: van der/u);
});

test("every item round-trips encode -> decode to its canonical form, including awkward strings", () => {
  const { text } = encodeCslItemsAsYaml({ items: items() });
  const decoded = decodeCslYaml({ text });
  assert.equal(decoded.dialect, "csl");
  assert.deepEqual(decoded.warnings, []);
  const expected = items().map(canonicalCslItem).sort((a, b) => (a.id < b.id ? -1 : 1));
  assert.deepEqual(decoded.items, expected);
  const byId = Object.fromEntries(decoded.items.map((item) => [item.id, item]));
  assert.equal(byId["001"].title, "true");
  assert.equal(byId["001"].publisher, "~");
  assert.equal(byId["001"].version, "1.10");
  assert.equal(byId["web-1"].number, "007");
  assert.equal(byId["chapter-1"].note, "  leading and trailing spaces  ");
});

test("fence wraps the YAML in --- and ... and decode accepts bare, document-fenced and frontmatter-fenced text", () => {
  const bare = encodeCslItemsAsYaml({ items: items() }).text;
  const fenced = encodeCslItemsAsYaml({ items: items(), fence: true }).text;
  assert.equal(fenced, `---\n${bare}...\n`);
  const expected = decodeCslYaml({ text: bare }).items;
  assert.deepEqual(decodeCslYaml({ text: fenced }).items, expected);
  assert.deepEqual(decodeCslYaml({ text: `---\n${bare}---\n` }).items, expected);
});

test("encode refuses invalid items with every finding, duplicates, and oversized requests", () => {
  assert.throws(() => encodeCslItemsAsYaml({ items: [{ id: "a", type: "nonsense" }, { type: "book" }, { id: "b", type: "book", author: [{ given: "No Family" }] }] }), (error) => {
    assert.ok(error instanceof TypeError);
    assert.match(error.message, /items\[0\]\.type/u);
    assert.match(error.message, /items\[1\]\.id/u);
    assert.match(error.message, /items\[2\]\.author/u);
    return true;
  });
  assert.throws(() => encodeCslItemsAsYaml({ items: [{ id: "a", type: "book" }, { id: "a", type: "book" }] }), /duplicate of items\[0\]/u);
  assert.throws(() => encodeCslItemsAsYaml({ items: [{ id: "a", type: "book", issued: { "date-parts": [["x"]] } }] }), /not a CSL date/u);
  assert.throws(() => encodeCslItemsAsYaml({ items: new Array(5001).fill({ id: "a", type: "book" }) }), RangeError);
  assert.throws(() => encodeCslItemsAsYaml({ items: "no" }), TypeError);
  assert.throws(() => encodeCslItemsAsYaml({ items: [], extra: 1 }), /does not admit extra/u);
  assert.throws(() => encodeCslItemsAsYaml({ items: [], fence: "yes" }), /fence/u);
  assert.deepEqual(encodeCslItemsAsYaml({ items: [] }), { text: "references: []\n", count: 0 });
});

test("decode normalizes with csl-json, warns on every normalization, and accepts the citekey-map dialect", () => {
  const sequence = decodeCslYaml({ text: "references:\n  - id: a2000\n    type: article\n    title: T\n    author: [Ann Zeta]\n    issued: 2000\n  - id: b2001\n    type: weird\n    title: X\n" });
  assert.deepEqual(sequence.items[0], { id: "a2000", type: "article-journal", title: "T", author: [{ literal: "Ann Zeta" }], issued: { "date-parts": [[2000]] } });
  assert.deepEqual(sequence.warnings.map((warning) => warning.path), ["references[0].type", "references[1].type"]);
  const map = decodeCslYaml({ text: "references:\n  a2000:\n    authors: [Ann Zeta]\n    year: 2000\n    title: T\n    publication: J\n" });
  assert.equal(map.dialect, "citekey-map");
  assert.deepEqual(map.items[0], { id: "a2000", type: "article-journal", title: "T", author: [{ literal: "Ann Zeta" }], "container-title": "J", issued: { "date-parts": [[2000]] } });
  assert.deepEqual(decodeCslYaml({ text: "references: []\n" }), { items: [], count: 0, dialect: "empty", warnings: [] });
});

test("decode refuses what it cannot validate, and strict adds the house item subset", () => {
  assert.throws(() => decodeCslYaml({ text: "title: no references\n" }), /no references: key/u);
  assert.throws(() => decodeCslYaml({ text: "references: [1, 2]" }), /not mappings/u);
  assert.throws(() => decodeCslYaml({ text: "references: nonsense" }), /neither a sequence/u);
  assert.throws(() => decodeCslYaml({ text: "references: [\n" }), /CSL YAML refused/u);
  assert.throws(() => decodeCslYaml({ text: "references:\n  - type: book\n    title: No id\n" }), /references\[0\]\.id/u);
  assert.throws(() => decodeCslYaml({ text: "references:\n  - {id: a, type: book}\n  - {id: a, type: book}\n" }), /duplicate of references\[0\]/u);
  assert.throws(() => decodeCslYaml({ text: "references:\n  - id: a\n    type: book\n    author: [{given: X}]\n" }), /references\[0\]\.author/u);
  const lax = "references:\n  - id: a\n    type: webpage\n    title: T\n";
  assert.equal(decodeCslYaml({ text: lax }).count, 1);
  assert.throws(() => decodeCslYaml({ text: lax, strict: true }), /issued/u);
  assert.throws(() => decodeCslYaml({ text: 5 }), TypeError);
  assert.throws(() => decodeCslYaml({ text: "x".repeat(4 * 1024 * 1024 + 1) }), RangeError);
});

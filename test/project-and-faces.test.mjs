import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectBibliographyRecordsCsl } from "@red-cup-engineering/bibliography-engineering-services-section/csl";
import { migrateReferenceRecordsToBibliographyRecords } from "@red-cup-engineering/bibliography-engineering-services-section/migration";
import { readBibliographyMarkdown, recognizeBibliographyMarkdown } from "@red-cup-engineering/bibliography-engineering-services-section/carrier";
import { projectBibliographyRecordsAsCslYaml } from "../scripts/project-bibliography-records-as-csl-yaml.mjs";
import { encodeCslItemsAsYaml } from "../scripts/encode-csl-items-as-yaml.mjs";
import { decodeCslYaml } from "../scripts/decode-csl-yaml.mjs";
import { fixture, items, root } from "./helpers.mjs";

const RECORDS = [
  { type: "bibliography", key: "cooper2017", "reference-type": "book", authors: ["Melinda Cooper"], year: 2017, title: "Family Values", publisher: "Zone Books", body: "# x\n" },
  { type: "bibliography", key: "arnold1995", "reference-type": "article", authors: ["Arnold, V. I."], year: 1995, title: "Remarks", publication: "Some Journal", doi: "10.1/x" },
];

test("projectBibliographyRecordsAsCslYaml is the engine's CSL projection, encoded; sorted by key and byte-reproducible", () => {
  const first = projectBibliographyRecordsAsCslYaml({ records: RECORDS });
  assert.equal(first.text, projectBibliographyRecordsAsCslYaml({ records: [...RECORDS].reverse() }).text);
  assert.equal(first.count, 2);
  const decoded = decodeCslYaml({ text: first.text, strict: true });
  assert.deepEqual(decoded.items, projectBibliographyRecordsCsl(RECORDS).map((item) => JSON.parse(JSON.stringify(item))).map((item) => decodeCslYaml({ text: encodeCslItemsAsYaml({ items: [item] }).text }).items[0]));
  assert.deepEqual(decoded.items.map((item) => item.id), ["arnold1995", "cooper2017"]);
  assert.deepEqual(decoded.items.map((item) => item.type), ["article-journal", "book"]);
});

test("projectBibliographyRecordsAsCslYaml refuses malformed records and duplicate keys", () => {
  assert.throws(() => projectBibliographyRecordsAsCslYaml({ records: [{ ...RECORDS[0], year: "2017" }] }), /records\[0\]/u);
  assert.throws(() => projectBibliographyRecordsAsCslYaml({ records: [RECORDS[0], RECORDS[0]] }), /duplicate citekey/u);
  assert.throws(() => projectBibliographyRecordsAsCslYaml({ records: "x" }), TypeError);
  assert.throws(() => projectBibliographyRecordsAsCslYaml({ records: [], other: 1 }), /does not admit other/u);
});

test("legacy sociology references -> one-time migration -> bibliography records -> CSL YAML (the whole data path)", () => {
  const files = ["ahmed2004.md", "cooper2017.md"].map((filename) => ({ filename, text: fixture(`legacy-reference-records/${filename}`) }));
  const { migrated, refused } = migrateReferenceRecordsToBibliographyRecords({ files, referenceTypes: { ahmed2004: "book", cooper2017: "book" } });
  assert.equal(refused.length, 0);
  const records = migrated.map(({ filename, text }) => {
    assert.equal(recognizeBibliographyMarkdown({ text, filename }).admitted, true);
    return readBibliographyMarkdown(text).frontmatter;
  });
  const { text, count } = projectBibliographyRecordsAsCslYaml({ records });
  assert.equal(count, 2);
  const decoded = decodeCslYaml({ text, strict: true }).items;
  assert.deepEqual(decoded.map((item) => [item.id, item.type, item.publisher]), [
    ["ahmed2004", "book", "Edinburgh University Press"],
    ["cooper2017", "book", "Zone Books / Near Futures series, 2017"],
  ]);
});

const pandoc = spawnSync("pandoc", ["--version"], { encoding: "utf8" });
test("Pandoc reads the generated YAML as a bibliography and cites from it", { skip: pandoc.status === 0 ? false : "pandoc is not installed" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "csl-yaml-pandoc-"));
  const { text } = projectBibliographyRecordsAsCslYaml({ records: RECORDS });
  writeFileSync(join(directory, "refs.yaml"), text);
  writeFileSync(join(directory, "doc.md"), "As argued [@cooper2017; @arnold1995].\n\n# References\n");
  const run = spawnSync("pandoc", ["doc.md", "--citeproc", "--bibliography", "refs.yaml", "-t", "plain"], { cwd: directory, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Cooper 2017/u);
  assert.match(run.stdout, /Arnold 1995/u);
  assert.match(run.stdout, /Family Values/u);
  assert.equal(run.stderr, "");
  const awkward = encodeCslItemsAsYaml({ items: items(), fence: true }).text;
  writeFileSync(join(directory, "awkward.yaml"), awkward);
  writeFileSync(join(directory, "awkward.md"), "See [@chapter-1; @001].\n");
  const second = spawnSync("pandoc", ["awkward.md", "--citeproc", "--bibliography", "awkward.yaml", "-t", "plain"], { cwd: directory, encoding: "utf8" });
  assert.equal(second.status, 0, second.stderr);
  assert.doesNotMatch(second.stderr, /not found|Could not|error/iu);
});

function command(script, lines) {
  const run = spawnSync(process.execPath, [join(root, "scripts", script)], { input: lines.map((line) => JSON.stringify(line)).join("\n") + "\n", encoding: "utf8" });
  return { status: run.status, lines: run.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)), stderr: run.stderr };
}

test("each command reads one JSON value per line and writes one per line; refusals exit 2", () => {
  const encoded = command("encode-csl-items-as-yaml.mjs", [{ items: items() }, { items: [{ id: "x", type: "nope" }] }]);
  assert.equal(encoded.status, 2);
  assert.equal(encoded.lines[0].count, 4);
  assert.deepEqual(Object.keys(encoded.lines[1]), ["ok", "refusal"]);
  assert.equal(encoded.lines[1].ok, false);
  assert.equal(encoded.lines[1].refusal.reason, "TypeError");
  const decoded = command("decode-csl-yaml.mjs", [{ text: encoded.lines[0].text }, { text: "x: 1" }]);
  assert.equal(decoded.lines[0].count, 4);
  assert.equal(decoded.lines[1].refusal.reason, "TypeError");
  const projected = command("project-bibliography-records-as-csl-yaml.mjs", [{ records: RECORDS }]);
  assert.equal(projected.status, 0);
  assert.equal(projected.lines[0].text, projectBibliographyRecordsAsCslYaml({ records: RECORDS }).text);
  assert.equal(command("decode-csl-yaml.mjs", [{ text: "references: []", extra: true }]).lines[0].ok, false);
  const help = spawnSync(process.execPath, [join(root, "scripts", "decode-csl-yaml.mjs"), "--help"], { encoding: "utf8" });
  assert.match(help.stdout, /^decodeCslYaml/u);
});

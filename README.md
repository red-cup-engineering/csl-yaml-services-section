# @red-cup-engineering/csl-yaml-services-section

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

CSL-YAML, the `references:` YAML that Pandoc reads as a bibliography, as the
sibling codec of CSL-JSON
([`csl-json-services-section`](https://github.com/red-cup-engineering/csl-json-services-section)).
Three operations: encode CSL-JSON items as deterministic YAML, decode YAML into
validated CSL-JSON items, and project bibliography-engine records as CSL YAML.

Intended seat in the Group tree:
`computer-serialized-content-engineering-services-section/services/yaml-services-section/services/csl-yaml-services-section`,
beside `yaml-frontmatter-codec-service`, whose `decodeYaml` / `encodeYaml` do all
YAML parsing and emission here. CSL validation and normalization are csl-json's
(`isCslType`, `isValidCslName`, `recognizeCslItem`, `decodeReferencesValue`,
`referencesFrontmatterValue`); the carrier-to-CSL projection is the bibliography
engine's (`projectBibliographyRecordsCsl`). This package adds only the canonical
item form and the YAML witness.

Every operation is a pure function (effect class **pure**: no filesystem, clock,
network or randomness) and a command that reads one JSON value per input line and
writes one JSON value per output line. A refusal is a thrown `TypeError` or
`RangeError`; the command renders it as
`{"ok":false,"refusal":{"reason":"TypeError","message":"..."}}` and exits 2.

## Dependencies and release order

`@red-cup-engineering/bibliography-engineering-services-section` **0.6.0** adds the
`./csl` and `./migration` exports this package uses. It is the version of
[bibliography-engineering-services-section#1](https://github.com/red-cup-engineering/bibliography-engineering-services-section/pull/1);
until that is merged and published, `npm install` cannot resolve it, and local
development links a checkout of that branch into `node_modules`. No dependency is
pinned through `github:`.

## The canonical form

Items are sorted by `id` (code-point order; duplicate ids are refused, because
Pandoc cannot cite an ambiguous id), and each item's variables are written in one
fixed order: `id`, `type`, `title`, the names (`author`, `editor`, `translator`, ...),
`container-title`, publication details, dates, identifiers (`DOI`, `ISBN`, ...),
`URL`, `language`, `abstract`, `note`; every other variable follows in code-point
order. Name objects write `family`, `given`, particles, `suffix`, `literal`; date
objects write `date-parts` first. `null` values are dropped. The same items always
give the same bytes, whatever order or key order they arrive in.

Every emission carries a witness: the text is decoded again and must equal the
canonical items exactly, else the operation refuses with `RangeError` rather than
write YAML that would not read back as the same references.

## Operations

### encodeCslItemsAsYaml

~~~js
export function encodeCslItemsAsYaml({ items, fence }) // -> { text, count }
~~~

- Refusals: `TypeError` for a malformed request, an unknown key, a non-boolean `fence`, or any invalid item (every finding is listed: missing or non-string `id`, a type outside CSL 1.0.2, a name without `family` or `literal`, a malformed date, a non-JSON value) or a duplicate id; `RangeError` for more than 5000 items, output over 4 MiB, or an item that does not round-trip through YAML.
- Precondition: `items` is an array of CSL-JSON objects.
- Postcondition: `text` is `references:` followed by the items in the canonical form and ends with one newline; with `fence: true` it is wrapped in `---` and `...`; Pandoc (`--citeproc --bibliography`) reads it; `decodeCslYaml` returns exactly the canonical items.
- Preserved frame: no variable is added, dropped (other than `null`) or rewritten; values are copied unchanged.
- Effect class: pure. Witness: byte-identical double encoding over shuffled input, the round-trip check, and a Pandoc citeproc test.

Command: `encode-csl-items-as-yaml` reads one JSON value per input line and writes one JSON value per output line.

~~~sh
echo '{"items":[{"id":"keats1962","type":"book","title":"The Snowy Day","author":[{"family":"Keats","given":"Ezra Jack"}],"issued":{"date-parts":[[1962]]}}]}' | npx encode-csl-items-as-yaml
~~~

### decodeCslYaml

~~~js
export function decodeCslYaml({ text, strict }) // -> { items, count, dialect, warnings }
~~~

- Refusals: `TypeError` for invalid YAML, a document with no `references:` key, a `references:` that is neither a sequence of items nor a citekey-keyed map, an entry that is not a mapping, or any invalid item (all findings listed, as `references[i].field`), or a duplicate id; with `strict: true` also any item outside the house subset (`id`, `title`, an `issued` year, an author or editor). `RangeError` for text over 4 MiB or more than 5000 items.
- Precondition: `text` is YAML text, bare, `---`/`...` fenced, or Markdown-frontmatter fenced.
- Postcondition: `items` are CSL-JSON in source order, canonical key order; a `dialect` of `csl` (sequence of items) or `citekey-map` (the house `references:` map, read through csl-json's `decodeReferencesValue`); every csl-json type normalization (`article` to `article-journal`, an unknown type to `document`) is a `warnings` entry with its path. A name or date that is already a valid CSL object is kept exactly (particles, suffix, literal dates); csl-json's normalization applies only to string and number shapes.
- Preserved frame: ids, titles and all variables other than normalized types and string-shaped names and dates.
- Effect class: pure. Witness: encode/decode round trip over awkward strings (quotes, colons, multi-line text, Unicode, numeric- and boolean-looking strings), and refusal tests.

Command: `decode-csl-yaml` reads one JSON value per input line and writes one JSON value per output line.

~~~sh
echo '{"text":"references:\n  - id: a2000\n    type: book\n    title: T\n"}' | npx decode-csl-yaml
~~~

### projectBibliographyRecordsAsCslYaml

~~~js
export function projectBibliographyRecordsAsCslYaml({ records, fence }) // -> { text, count }
~~~

- Refusals: `TypeError` for a malformed request, a record that does not admit as a bibliography record (`records[i]: ...`), or a duplicate citekey; `RangeError` for more than 5000 records or output over 4 MiB.
- Precondition: `records` are bibliography-engine records (`type: bibliography`, `key`, `reference-type`, `authors`, `year`, `title`, optional `publication`, `publisher`, `translator`, `url`, `doi`, `note`, `eprint`); `body` is not read.
- Postcondition: the items are exactly the bibliography engine's `projectBibliographyRecordsCsl(records)` (BibTeX-style `reference-type` becomes the CSL type; `translator` becomes a CSL name list), then encoded as above, sorted by citekey.
- Preserved frame: the records; nothing is reimplemented here.
- Effect class: pure. Witness: equality with the engine projection, Pandoc citeproc over the output, and the whole data path test below.
- Command: `project-bibliography-records-as-csl-yaml` reads one JSON value per input line and writes one JSON value per output line.

### The legacy sociology records

The sociology bibliography files use `type: reference` with `key`, `authors`,
`year`, `title`, `venue`; the bibliography engine expects `type: bibliography`
with `reference-type`. There is no compatibility reading of the old shape. The
one-time migration `migrateReferenceRecordsToBibliographyRecords` lives in the
bibliography engine, which owns the carrier contract (see its README); this
package only consumes the migrated records. `test/project-and-faces.test.mjs`
runs the whole path (legacy file, migration, carrier, CSL YAML) on copies of two
real files.

## Held market offers

`data/records/offers/<operation>.json` declares one x402 offer per operation for
the House markets (`x402-bazaar`, `402index`, `house-capability-market`,
`house-seller-catalog`), all `saleStatus: "held"` and sold by the `engineering`
enterprise, gateway `csl-yaml`, ledger account `Income:Sales:X402:Csl-yaml`.
Prices: `encode-csl-items-as-yaml` $0.002, `decode-csl-yaml` $0.002,
`project-bibliography-records-as-csl-yaml` $0.005 (the bibliography precedent:
`book-record` $0.002, `reference-check` $0.02). `test/fixtures/offer.schema.json`
is a copy of the x402 package's `schemas/offer.schema.json` (red-cup-engineering/x402-services-section,
last changed at commit `e9067ecc61616e86800ce40a190d3875fcc1b0b7`). Set
`X402_OFFER_MODULE=/path/to/x402-services-section/src/offer.mjs` to also run the
package's own `declareOffer` over each offer.

## Limitations

- Duplicate ids are refused rather than kept in input order; a bibliography with two entries of one id is ambiguous to Pandoc, so the codec does not pretend a stable order resolves it.
- `decodeCslYaml` validates structure (id, type, names, dates) by default, not CSL's per-type required fields; `strict` adds the house subset only.
- csl-json's normalization of strings and numbers is lossy in its own way (an author string becomes a `literal` name; it is not split into family and given).
- The projection types a record by its `reference-type`; a record with no better type than `misc` becomes a CSL `document`, and its `venue`/`publication` becomes `container-title`, whatever the work is.
- The `edge` runtime in the offers is declared, not measured on an edge host: the dependency chain includes `node:util` (the YAML codec).
- Dates are written as `date-parts` (CSL-JSON shape), not EDTF strings.

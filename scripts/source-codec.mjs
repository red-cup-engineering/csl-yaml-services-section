import {
  decodeUtf8Source, defineSourceCodec, encodeUtf8Source,
} from "@red-cup-engineering/typed-content/source-codec";
import { canonicalCslItems, decodeCslYamlText, emitCslYaml, MAX_YAML_CHARACTERS } from "./csl-yaml.mjs";

const profile = {
  mediaType: "application/yaml",
  // Preserve the existing UTF-16 character limit for any well-formed UTF-8 input.
  maxBytes: MAX_YAML_CHARACTERS * 3,
  valueIdentity: "exact",
};

export const cslYamlSourceCodec = defineSourceCodec({
  ...profile,
  id: "csl-yaml.references/v1",
  decode: bytes => decodeCslYamlText(decodeUtf8Source(bytes)),
  encode: items => encodeUtf8Source(emitCslYaml(canonicalCslItems(items))),
});

export const strictCslYamlSourceCodec = defineSourceCodec({
  ...profile,
  id: "csl-yaml.admitted-references/v1",
  decode: bytes => decodeCslYamlText(decodeUtf8Source(bytes), { strict: true }),
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "..");
export const fixture = (name) => readFileSync(join(here, "fixtures", name), "utf8");
export const json = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
export const items = () => JSON.parse(fixture("items.json"));

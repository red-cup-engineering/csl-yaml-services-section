// The command face shared by every operation script; loaded only when a script runs as a command.
export async function runCommand(operationDefinition, operation) {
  const { runJavascriptNodeOperation } = await import("@red-cup-engineering/javascript-node-services-section/operation");
  process.exitCode = (await runJavascriptNodeOperation(
    { ...operationDefinition, operation },
    { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout },
  )).exitCode;
}

export const yamlOutputSchema = {
  type: "object",
  required: ["text", "count"],
  additionalProperties: false,
  properties: {
    text: { type: "string", description: "The CSL-YAML bytes as UTF-8 text." },
    count: { type: "integer", minimum: 0 },
  },
};

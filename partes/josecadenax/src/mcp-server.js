import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createNotchTools } from "./mcp-tools.js";

// Notch MCP server (stdio). Claude Desktop starts it as a local process on the user's machine.
// stdout belongs to the protocol: log only to stderr.
// Settings (env): AGENT_SECRET, SPEND_CAP, NOTCH_API_URL, EXPECTED_PAYEE, NOTCH_STAMPER.
const tools = createNotchTools();
const asResult = ({ text, isError }) => ({ content: [{ type: "text", text }], isError });

const server = new McpServer({ name: "notch", version: "1.0.0" });

server.registerTool(
  "stamp_file",
  {
    title: "Stamp a file",
    description:
      "Creates a tamper-proof timestamp for a local file. Hashes it on this computer (the file never leaves it), " +
      "pays 0.01 USDC with x402 and anchors the SHA-256 in a Stellar transaction. Costs money. " +
      "Stamping the same file again is refused without charge and returns the existing stamp.",
    inputSchema: { path: z.string().describe("Absolute path of the file to stamp") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (args) => asResult(await tools.stampFile(args)),
);

server.registerTool(
  "verify_stamp",
  {
    title: "Verify a stamp",
    description:
      "Checks that a local file matches a Notch stamp and tells when it existed. Free. " +
      "The proof is verified directly on Stellar. If the transaction is not given, it is looked up by the file's hash.",
    inputSchema: {
      path: z.string().describe("Absolute path of the file to verify"),
      tx: z.string().optional().describe("Stamp transaction hash. Optional: it is looked up when omitted"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (args) => asResult(await tools.verifyFile(args)),
);

await server.connect(new StdioServerTransport());
console.error("Notch MCP server ready");

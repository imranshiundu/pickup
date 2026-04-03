import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
const server = new Server({
    name: "pickup-mcp",
    version: "0.1.0"
}, {
    capabilities: {
        tools: {}
    }
});
// Setup tools
registerTools(server);
// Start server on stdio
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Pickup MCP bridge running on stdio");
}
main().catch(err => {
    console.error("Failed to start Pickup MCP server:", err);
    process.exit(1);
});

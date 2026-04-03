import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getLast, getById, listRecords, appendCheckpoint, readStore } from "./store.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
// Validation schemas for tools
const GetLastSchema = z.object({
    process_name: z.string().optional(),
    project_dir: z.string().optional()
});
const GetByIdSchema = z.object({
    checkpoint_id: z.string()
});
const ListSchema = z.object({
    limit: z.number().default(10),
    project_dir: z.string().optional()
});
const SaveManualSchema = z.object({
    note: z.string(),
    process_name: z.string().optional(),
    project_dir: z.string().optional(),
    file_path: z.string().optional()
});
const SearchSchema = z.object({
    query: z.string(),
    limit: z.number().default(10)
});
export function registerTools(server) {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "pickup_get_last",
                    description: "Get the most recent checkpoint for a given task context",
                    inputSchema: {
                        type: "object",
                        properties: {
                            process_name: { type: "string" },
                            project_dir: { type: "string" }
                        }
                    }
                },
                {
                    name: "pickup_get_by_id",
                    description: "Get a specific checkpoint by ID",
                    inputSchema: {
                        type: "object",
                        properties: {
                            checkpoint_id: { type: "string" }
                        },
                        required: ["checkpoint_id"]
                    }
                },
                {
                    name: "pickup_list",
                    description: "List recent checkpoints",
                    inputSchema: {
                        type: "object",
                        properties: {
                            limit: { type: "number" },
                            project_dir: { type: "string" }
                        }
                    }
                },
                {
                    name: "pickup_save_manual",
                    description: "Save a checkpoint right now with an optional note. Used by AI agents to checkpoint their own state.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            note: { type: "string" },
                            process_name: { type: "string" },
                            project_dir: { type: "string" },
                            file_path: { type: "string" }
                        },
                        required: ["note"]
                    }
                },
                {
                    name: "pickup_search",
                    description: "Search checkpoints by keyword across briefs and context",
                    inputSchema: {
                        type: "object",
                        properties: {
                            query: { type: "string" },
                            limit: { type: "number" }
                        },
                        required: ["query"]
                    }
                }
            ]
        };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            switch (name) {
                case "pickup_get_last": {
                    const parsed = GetLastSchema.parse(args || {});
                    const record = await getLast(parsed.project_dir, parsed.process_name);
                    return {
                        content: [{ type: "text", text: JSON.stringify(record, null, 2) }]
                    };
                }
                case "pickup_get_by_id": {
                    const parsed = GetByIdSchema.parse(args);
                    const record = await getById(parsed.checkpoint_id);
                    return {
                        content: [{ type: "text", text: JSON.stringify(record, null, 2) }]
                    };
                }
                case "pickup_list": {
                    const parsed = ListSchema.parse(args || {});
                    const records = await listRecords(parsed.limit, parsed.project_dir);
                    return {
                        content: [{ type: "text", text: JSON.stringify(records, null, 2) }]
                    };
                }
                case "pickup_search": {
                    const parsed = SearchSchema.parse(args);
                    const all = await readStore();
                    const query = parsed.query.toLowerCase();
                    const filtered = all.filter(record => {
                        const haystack = [
                            record.brief,
                            record.window_title,
                            record.process_name,
                            record.raw_context.agent_note || "",
                            record.raw_context.file_tail || ""
                        ].join(" ").toLowerCase();
                        return haystack.includes(query);
                    });
                    filtered.reverse();
                    const results = filtered.slice(0, parsed.limit);
                    return {
                        content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
                    };
                }
                case "pickup_save_manual": {
                    const parsed = SaveManualSchema.parse(args);
                    const now = new Date().toISOString();
                    const id = uuidv4();
                    // Note: In reality, we could pipe this through the Python daemon for AI generation
                    // if we wanted the AI to write the brief based on the note. But per spec, this directly
                    // writes the checkpoint. If the agent provided a "note", we'll treat that as the key element.
                    // Actually, the spec says "returns { checkpoint_id, brief }", so if this goes directly here, 
                    // we'll format the agent's note as the brief for now, but ideally we emit an event.
                    // Simulating the checkpoint directly:
                    const newCheckpoint = {
                        checkpoint_id: id,
                        timestamp: now,
                        process_name: parsed.process_name || "mcp-agent",
                        window_title: "Agent Session",
                        file_path: parsed.file_path || null,
                        project_dir: parsed.project_dir || null,
                        brief: `[Agent] ${parsed.note}`, // Simplified brief direct assignment
                        trigger: "manual",
                        tokens_used: 0,
                        raw_context: {
                            process_name: parsed.process_name || "mcp-agent",
                            timestamp: now,
                            recent_windows: [],
                            file_tail: null,
                            clipboard: null,
                            shell_history: null,
                            agent_note: parsed.note
                        },
                        agent_authored: true
                    };
                    await appendCheckpoint(newCheckpoint);
                    return {
                        content: [{ type: "text", text: JSON.stringify({
                                    checkpoint_id: id,
                                    brief: newCheckpoint.brief
                                }, null, 2) }]
                    };
                }
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${error.message}` }],
                isError: true
            };
        }
    });
}

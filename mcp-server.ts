import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	ListToolsRequestSchema,
	CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import dotenv from "dotenv";
import path from "node:path";
import { getCodebaseMap } from "./utils/codebase-list";
import { runCursorAgentStream } from "./utils/cursor-agent";
import { runClaudeAgentStream } from "./utils/claude-agent";
import {
	cloneRepository,
	getProjectPath,
	getProjects,
	pullRepository,
} from "./utils/projects";
import { parseStreamEvent } from "./utils/stream-parser";
import { needsPull, updateLastPullDate } from "./utils/metadata";
import { getAgentBackend } from "./config";

// Load .env if present
const projectRoot = process.cwd();
dotenv.config({ path: path.join(projectRoot, ".env") });

const server = new Server(
	{
		name: "ai-code-search",
		version: "1.0.0",
	},
	{
		capabilities: {
			tools: {},
		},
	},
);

// Tool schemas
const questionSchema = z.object({
	library: z.string().describe("Name of the library/project to query"),
	prompt: z.string().describe("Question or prompt to ask about the library"),
});

const listLibrariesSchema = z.object({});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
	return {
		tools: [
			{
				name: "question",
				description: "Ask a question about a specific library",
				inputSchema: {
					type: "object",
					properties: {
						library: {
							type: "string",
							description: "Name of the library/project to query",
						},
						prompt: {
							type: "string",
							description: "Question or prompt to ask about the library",
						},
					},
					required: ["library", "prompt"],
				},
			},
			{
				name: "list_libraries",
				description: "List all available libraries",
				inputSchema: {
					type: "object",
					properties: {},
					required: [],
				},
			},
		],
	};
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	if (name === "question") {
		const validated = questionSchema.parse(args as unknown);
		const { library, prompt } = validated;

		if (!library || !prompt) {
			throw new Error("Library and prompt are required");
		}

		const progressToken = (
			request.params as { _meta?: { progressToken?: string } }
		)._meta?.progressToken;

		const sendProgress = async (
			progress: number,
			total: number | null,
			message?: string,
		) => {
			if (progressToken && serverTransport) {
				try {
					await serverTransport.send({
						jsonrpc: "2.0",
						method: "notifications/progress",
						params: {
							progressToken,
							progress,
							...(total !== null && { total }),
							...(message && { message }),
						},
					});
				} catch (err) {
					console.error("[mcp] Failed to send progress:", err);
				}
			}
		};

		// Check if library needs to be cloned
		const localProjects = await getProjects();
		const needClone = !localProjects.includes(library);
		let cloneUrl: string | null = null;

		if (needClone) {
			const codebaseMap = await getCodebaseMap();
			const entry = codebaseMap.get(library);
			if (!entry) {
				throw new Error(
					`Library "${library}" not found. Use list_libraries to see available libraries.`,
				);
			}
			cloneUrl = entry.url;
		}

		// Clone if needed
		if (needClone && cloneUrl) {
			try {
				await sendProgress(10, 100, "Cloning repository...");
				console.error(`[mcp] cloning ${library} from ${cloneUrl}`);
				await cloneRepository(cloneUrl);
				const afterClone = await getProjects();
				if (!afterClone.includes(library)) {
					throw new Error("Clone completed but library folder not found.");
				}
				await sendProgress(30, 100, "Repository cloned successfully");
			} catch (e) {
				const msg =
					e instanceof Error ? e.message : "Failed to clone repository";
				throw new Error(`Failed to clone library: ${msg}`);
			}
		}

		// Check if repository needs to be updated (git pull)
		const shouldPull = await needsPull(library);
		if (shouldPull) {
			try {
				await sendProgress(needClone ? 35 : 10, 100, "Updating repository...");
				console.error(`[mcp] pulling ${library}`);
				await pullRepository(library);
				await updateLastPullDate(library);
				await sendProgress(
					needClone ? 40 : 15,
					100,
					"Repository updated successfully",
				);
			} catch (e) {
				const msg =
					e instanceof Error ? e.message : "Failed to update repository";
				throw new Error(`Failed to update library: ${msg}`);
			}
		}

		const projectPath = getProjectPath(library);
		console.error(`[mcp] project=${library} dir=${projectPath}`);
		console.error(`[mcp] prompt=${prompt} backend=${getAgentBackend()}`);

		const backend = getAgentBackend();

		if (backend === "claude") {
			return await runWithClaudeAgent(projectPath, prompt, sendProgress, needClone, shouldPull);
		}
		return await runWithCursorAgent(projectPath, prompt, sendProgress, needClone, shouldPull);
	}

	if (name === "list_libraries") {
		try {
			const [localProjects, codebaseMap] = await Promise.all([
				getProjects(),
				getCodebaseMap(),
			]);

			const local = [...localProjects].sort();
			const codebaseKeys = Array.from(codebaseMap.keys()).sort();
			const remoteOnly = codebaseKeys.filter((k) => !local.includes(k));

			const libraries = [
				...local.map((n) => {
					const entry = codebaseMap.get(n);
					return {
						name: n,
						downloaded: true,
						url: entry?.url,
						description: entry?.description,
					};
				}),
				...remoteOnly.map((n) => {
					const entry = codebaseMap.get(n);
					return {
						name: n,
						downloaded: false,
						url: entry?.url,
						description: entry?.description,
					};
				}),
			].sort((a, b) => a.name.localeCompare(b.name));

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(libraries, null, 2),
					},
				],
				isError: false,
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Failed to list libraries";
			throw new Error(msg);
		}
	}

	throw new Error(`Unknown tool: ${name}`);
});

async function runWithClaudeAgent(
	projectPath: string,
	prompt: string,
	sendProgress: (progress: number, total: number | null, message?: string) => Promise<void>,
	needClone: boolean,
	shouldPull: boolean,
) {
	let resultMarkdown = "";
	const statusMessages: string[] = [];
	let lastProgress = needClone ? (shouldPull ? 40 : 30) : shouldPull ? 15 : 0;

	try {
		for await (const event of runClaudeAgentStream(projectPath, prompt)) {
			if (event.error) {
				throw new Error(event.error);
			}
			if (event.status) {
				statusMessages.push(event.status);
				lastProgress = Math.min(lastProgress + 5, 90);
				await sendProgress(lastProgress, 100, event.status).catch(() => {});
			}
			if (event.result) {
				resultMarkdown = event.result;
			}
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : "Claude agent error";
		throw new Error(msg);
	}

	await sendProgress(100, 100, "Completed").catch(() => {});

	const statusText =
		statusMessages.length > 0
			? `\n\n_Status updates: ${statusMessages.join(", ")}_\n\n`
			: "";
	const finalText = resultMarkdown
		? `${resultMarkdown}${statusText}`
		: `No result returned.${statusText}`;

	return {
		content: [{ type: "text" as const, text: finalText }],
		isError: false,
	};
}

async function runWithCursorAgent(
	projectPath: string,
	prompt: string,
	sendProgress: (progress: number, total: number | null, message?: string) => Promise<void>,
	needClone: boolean,
	shouldPull: boolean,
): Promise<{ content: { type: "text"; text: string }[]; isError: boolean }> {
	const { stdout, child } = runCursorAgentStream(projectPath, prompt);

	let resultMarkdown = "";
	const statusMessages: string[] = [];
	let lastProgress = needClone ? (shouldPull ? 40 : 30) : shouldPull ? 15 : 0;
	const decoder = new TextDecoder();
	let buffer = "";

	return new Promise((resolve, reject) => {
		child.on("error", (err) => {
			console.error("Failed to start cursor-agent process", err);
			reject(
				new Error(
					"Failed to start cursor-agent process. Ensure cursor-agent is installed and available in PATH.",
				),
			);
		});

		stdout.on("data", async (chunk: Buffer) => {
			buffer += decoder.decode(chunk, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const parsed = parseStreamEvent(line);
				if (!parsed) continue;

				if (parsed.error) {
					reject(new Error(parsed.error));
					return;
				}

				if (parsed.status) {
					statusMessages.push(parsed.status);
					lastProgress = Math.min(lastProgress + 5, 90);
					await sendProgress(lastProgress, 100, parsed.status).catch(() => {});
				}

				if (parsed.result) {
					resultMarkdown = parsed.result;
				}
			}
		});

		stdout.on("end", async () => {
			if (buffer) {
				const parsed = parseStreamEvent(buffer);
				if (parsed?.error) {
					reject(new Error(parsed.error));
					return;
				}
				if (parsed?.status) {
					statusMessages.push(parsed.status);
				}
				if (parsed?.result) {
					resultMarkdown = parsed.result;
				}
			}

			await sendProgress(100, 100, "Completed").catch(() => {});

			const statusText =
				statusMessages.length > 0
					? `\n\n_Status updates: ${statusMessages.join(", ")}_\n\n`
					: "";
			const finalText = resultMarkdown
				? `${resultMarkdown}${statusText}`
				: `No result returned.${statusText}`;

			resolve({
				content: [{ type: "text" as const, text: finalText }],
				isError: false,
			});
		});

		stdout.on("error", (err: Error) => {
			console.error("Error reading cursor-agent stream", err);
			reject(new Error(`Stream error: ${err.message}`));
		});

		child.on("close", (code) => {
			if (code !== 0 && code !== null) {
				console.error(`[mcp] cursor-agent exited with code ${code}`);
			}
		});
	});
}

// Start server
let serverTransport: StdioServerTransport | null = null;

async function main() {
	const transport = new StdioServerTransport();
	serverTransport = transport;
	await server.connect(transport);
	console.error("MCP server running on stdio");
}

main().catch((error) => {
	console.error("Fatal error in MCP server:", error);
	process.exit(1);
});

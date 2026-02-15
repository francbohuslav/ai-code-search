/**
 * Parses a single NDJSON line from cursor-agent --output-format stream-json.
 * Returns human-readable status and/or the final markdown result.
 * Shared utility for both frontend and MCP server.
 */
export interface ParsedEvent {
	status?: string;
	result?: string;
	error?: string;
}

export function basename(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

function getToolCallInfo(toolCall: Record<string, unknown>): string | null {
	if (toolCall.readToolCall && typeof toolCall.readToolCall === "object") {
		const args = (toolCall.readToolCall as Record<string, unknown>).args as
			| Record<string, unknown>
			| undefined;
		const path = typeof args?.path === "string" ? args.path : "";
		return path ? `Reading file: ${basename(path)}` : "Reading file";
	}
	if (toolCall.grepToolCall && typeof toolCall.grepToolCall === "object") {
		const args = (toolCall.grepToolCall as Record<string, unknown>).args as
			| Record<string, unknown>
			| undefined;
		const pattern = typeof args?.pattern === "string" ? args.pattern : "…";
		const glob = typeof args?.glob === "string" ? args.glob : "";
		return glob
			? `Searching for ${pattern} in ${glob}`
			: `Searching for ${pattern}`;
	}
	if (
		toolCall.listDirToolCall &&
		typeof toolCall.listDirToolCall === "object"
	) {
		const args = (toolCall.listDirToolCall as Record<string, unknown>).args as
			| Record<string, unknown>
			| undefined;
		const path = typeof args?.path === "string" ? args.path : "";
		return path ? `Listing directory: ${basename(path)}` : "Listing directory";
	}
	if (toolCall.codebaseSearchToolCall) return "Searching codebase";
	if (toolCall.webSearchToolCall) return "Searching the web";
	const key = Object.keys(toolCall)[0];
	if (key)
		return `${key
			.replace(/([A-Z])/g, " $1")
			.replace(/^./, (s) => s.toUpperCase())
			.trim()}…`;
	return null;
}

export function parseStreamEvent(line: string): ParsedEvent | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	try {
		const obj = JSON.parse(trimmed) as Record<string, unknown>;
		const type = typeof obj.type === "string" ? obj.type : "";
		const subtype = typeof obj.subtype === "string" ? obj.subtype : "";

		if (type === "system" && subtype === "init") {
			return { status: "Starting…" };
		}
		if (type === "thinking") {
			if (subtype === "delta") return { status: "Thinking…" };
			if (subtype === "completed") return { status: "Thinking completed." };
		}
		if (type === "tool_call") {
			const tc = obj.tool_call as Record<string, unknown> | undefined;
			if (subtype === "started" && tc) {
				const label = getToolCallInfo(tc);
				if (label) return { status: label };
			}
			if (subtype === "completed" && tc) {
				const label = getToolCallInfo(tc);
				if (label) return { status: `${label} — done.` };
			}
		}
		if (type === "assistant") {
			return { status: "Preparing answer…" };
		}
		if (
			type === "result" &&
			subtype === "success" &&
			typeof obj.result === "string"
		) {
			return { result: obj.result };
		}
		if (type === "result" && subtype === "error") {
			const err = typeof obj.error === "string" ? obj.error : "Unknown error";
			return { status: `Error: ${err}` };
		}
		if (type === "status" && typeof obj.status === "string") {
			return { status: obj.status };
		}
		if (type === "error" && typeof obj.error === "string") {
			return { error: obj.error };
		}
		return null;
	} catch {
		return null;
	}
}

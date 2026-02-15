/**
 * Centralized configuration and environment access.
 * All runtime configuration should be read via these helpers instead of
 * touching process.env directly in feature modules.
 */

import { execSync } from "node:child_process";

function readEnv(name: string): string | undefined {
	const value = process.env[name];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

/**
 * Returns the TCP port the HTTP server should listen on.
 * Defaults to 8000 when PORT is not set.
 * Throws an error when PORT is set but invalid.
 */
export function getPort(): number {
	const raw = readEnv("PORT");
	if (!raw) {
		return 8000;
	}
	const parsed = Number.parseInt(raw, 10);
	if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
		throw new Error(`Invalid PORT value: ${raw}`);
	}
	return parsed;
}

/**
 * Returns the directory that contains cloned source projects.
 * The optional override allows callers to pass a custom path for tests.
 */
export function getSourcesDir(override?: string): string {
	const fromArg = override?.trim();
	if (fromArg) {
		return fromArg;
	}

	const fromEnv = readEnv("SOURCES_DIR");
	if (!fromEnv) {
		throw new Error(
			"SOURCES_DIR is not set. Configure it via environment variable (e.g. .env file or IDE / MCP client configuration).",
		);
	}
	return fromEnv;
}

/**
 * Returns the command used to start cursor-agent.
 * Defaults to "cursor-agent" when CURSOR_AGENT_CMD is not set.
 */
export function getCursorAgentCommand(): string {
	return readEnv("CURSOR_AGENT_CMD") ?? "cursor-agent";
}

/**
 * Returns the path to codebase-list.json file.
 * Reads from CODEBASE_LIST_PATH environment variable.
 * Throws an error when CODEBASE_LIST_PATH is not set.
 */
export function getCodebaseListPath(): string {
	const fromEnv = readEnv("CODEBASE_LIST_PATH");
	if (!fromEnv) {
		throw new Error(
			"CODEBASE_LIST_PATH is not set. Configure it via environment variable (e.g. .env file or IDE / MCP client configuration).",
		);
	}
	return fromEnv;
}

export type AgentBackend = "cursor" | "claude";

/**
 * Returns the agent backend to use for code search.
 * When AGENT_BACKEND is set to "cursor" or "claude", that value is used directly.
 * When AGENT_BACKEND is "auto" or not set, the backend is detected automatically:
 *   - If ANTHROPIC_API_KEY is set → "claude"
 *   - If cursor-agent CLI is found in PATH → "cursor"
 *   - Throws if neither is available.
 */
export function getAgentBackend(): AgentBackend {
	const val = readEnv("AGENT_BACKEND");
	if (val === "claude") return "claude";
	if (val === "cursor") return "cursor";
	return detectAgentBackend();
}

let detectedBackend: AgentBackend | undefined;

function detectAgentBackend(): AgentBackend {
	if (detectedBackend) return detectedBackend;

	const hasAnthropicKey = !!readEnv("ANTHROPIC_API_KEY");
	const hasCursorAgent = isCursorAgentAvailable();

	if (hasAnthropicKey && hasCursorAgent) {
		// Both available — prefer claude (SDK-based, no external process)
		detectedBackend = "claude";
	} else if (hasAnthropicKey) {
		detectedBackend = "claude";
	} else if (hasCursorAgent) {
		detectedBackend = "cursor";
	} else {
		throw new Error(
			"No agent backend available. Either set ANTHROPIC_API_KEY for Claude or install cursor-agent CLI. " +
				"You can also set AGENT_BACKEND explicitly to 'cursor' or 'claude'.",
		);
	}

	return detectedBackend;
}

function isCursorAgentAvailable(): boolean {
	const cmd = getCursorAgentCommand();
	try {
		const isWindows = process.platform === "win32";
		execSync(isWindows ? `where ${cmd}` : `which ${cmd}`, {
			stdio: "ignore",
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Returns the Claude model to use (optional).
 * When not set, the SDK uses its default model.
 */
export function getClaudeModel(): string | undefined {
	return readEnv("CLAUDE_MODEL");
}

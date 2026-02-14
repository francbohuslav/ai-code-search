import type { ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import { getAgentCommand, getAgentType } from "../config";
import { runCursorAgentStream } from "./cursor-agent";
import { runGeminiStream } from "./gemini-agent";

/**
 * Runs the configured agent (cursor or gemini) in streaming mode.
 * Returns stdout as a Readable stream and the child process.
 */
export function runAgentStream(
	projectPath: string,
	prompt: string,
): { stdout: Readable; child: ChildProcess } {
	const agentType = getAgentType();
	const cmd = getAgentCommand();
	console.error(`[agent] type=${agentType} cmd=${cmd}`);
	switch (agentType) {
		case "cursor":
			return runCursorAgentStream(projectPath, prompt);
		case "gemini":
			return runGeminiStream(projectPath, prompt);
		default: {
			const _exhaust: never = agentType;
			throw new Error(`Unsupported agent type: ${String(_exhaust)}`);
		}
	}
}

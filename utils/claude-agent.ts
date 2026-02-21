import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { getAgentModel } from "../config";

/**
 * Runs Claude Agent SDK in streaming mode and returns a cursor-format NDJSON stream
 * plus a fake ChildProcess for API compatibility with runAgentStream() consumers.
 */
export function runClaudeAgentStream(
	projectPath: string,
	prompt: string,
): { stdout: Readable; child: ChildProcess } {
	const fullPrompt = `${prompt.trim()}. Do not change any files! Only return results in chat!`;

	const outStream = new Readable({ read: () => {} });

	const child = Object.assign(new EventEmitter(), {
		stdout: outStream,
		stderr: null,
		stdin: null,
	}) as ChildProcess;

	(async () => {
		try {
			const { query } = await import("@anthropic-ai/claude-agent-sdk");
			const model = getAgentModel();
			const options: { cwd: string; includePartialMessages?: boolean; model?: string } = {
				cwd: projectPath,
				includePartialMessages: true,
			};
			if (model) options.model = model;

			outStream.push(`${JSON.stringify({ type: "status", status: "Starting…" })}\n`);

			for await (const msg of query({ prompt: fullPrompt, options })) {
				const m = msg as { type: string; subtype?: string; result?: string; errors?: string[] };
				if (m.type === "system" && m.subtype === "init") {
					outStream.push(`${JSON.stringify({ type: "status", status: "Claude agent ready." })}\n`);
				}
				if (m.type === "stream_event") {
					const ev = (m as { event?: { type?: string; delta?: { type?: string; text?: string } } }).event;
					if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
						// Optional: stream raw text deltas as status for progress
						// For now we only push final result to match cursor-format
					}
				}
				if (m.type === "result") {
					if (m.subtype === "success" && typeof m.result === "string") {
						outStream.push(
							`${JSON.stringify({ type: "result", subtype: "success", result: m.result })}\n`,
						);
					} else if (m.subtype?.startsWith("error_") && Array.isArray(m.errors)) {
						const errMsg = m.errors.length > 0 ? m.errors.join("; ") : "Unknown error";
						outStream.push(`${JSON.stringify({ type: "error", error: errMsg })}\n`);
					}
				}
			}

			child.emit("close", 0);
		} catch (e) {
			const err = e instanceof Error ? e : new Error(String(e));
			console.error("[claude-agent]", err.message);
			outStream.push(`${JSON.stringify({ type: "error", error: err.message })}\n`);
			child.emit("error", err);
			child.emit("close", 1);
		} finally {
			outStream.push(null);
		}
	})();

	return { stdout: outStream, child };
}

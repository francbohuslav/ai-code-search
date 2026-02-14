import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { Readable } from "node:stream";
import { getAgentCommand } from "../config";

/**
 * Runs Gemini CLI in streaming mode. Spawns the process and returns stdout.
 * If the CLI does not output NDJSON in cursor-agent format, the stream is
 * adapted to emit a single result line so parseStreamEvent still works.
 */
export function runGeminiStream(
	projectPath: string,
	prompt: string,
): { stdout: Readable; child: ChildProcess } {
	const cmd = getAgentCommand();
	const fullPrompt = `${prompt.trim()}. Do not change any files! Only return results in chat!`;
	const isWindows = process.platform === "win32";
	const child = spawn(cmd, [fullPrompt], {
		cwd: projectPath,
		stdio: ["ignore", "pipe", "pipe"],
		shell: isWindows,
	});

	if (!child.stdout) {
		throw new Error("Failed to start Gemini CLI: stdout stream is null");
	}

	// Gemini CLI may not output NDJSON. Adapt: emit status, then collect stdout and emit one result line on end.
	const adapter = new Readable({ read() {} });
	adapter.push(
		`${JSON.stringify({ type: "status", status: "Running Gemini…" })}\n`,
	);
	let buffer = "";
	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		buffer += chunk;
	});
	child.stdout.on("end", () => {
		const line = JSON.stringify({
			type: "result",
			subtype: "success",
			result: buffer.trim() || "(No output)",
		});
		adapter.push(`${line}\n`);
		adapter.push(null);
	});
	child.stdout.on("error", (err) => {
		adapter.destroy(err);
	});

	return { stdout: adapter, child };
}

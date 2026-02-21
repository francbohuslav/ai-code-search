import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { Readable } from "node:stream";
import { getAgentCommand, getAgentModel } from "../config";

function getGeminiArgs(): string[] {
	const args = ["-o", "stream-json"];
	const model = getAgentModel();
	if (model) {
		args.push("-m", model);
	}
	return args;
}

function basename(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

/**
 * Converts a Gemini stream event to cursor-format NDJSON line.
 * Returns { line?, assistantContent } - push line when present; always update assistantContent.
 */
function geminiEventToCursorLine(
	obj: Record<string, unknown>,
	assistantContent: string,
): { line?: string; assistantContent: string } | null {
	const type = typeof obj.type === "string" ? obj.type : "";

	if (type === "init") {
		return { line: `${JSON.stringify({ type: "status", status: "Starting…" })}\n`, assistantContent };
	}
	if (type === "message") {
		const role = typeof obj.role === "string" ? obj.role : "";
		const content = typeof obj.content === "string" ? obj.content : "";
		if (role === "user") {
			return { line: `${JSON.stringify({ type: "status", status: "Sending prompt…" })}\n`, assistantContent };
		}
		if (role === "assistant" && content) {
			return { assistantContent: assistantContent + content };
		}
		return null;
	}
	if (type === "tool_use") {
		const toolName = typeof obj.tool_name === "string" ? obj.tool_name : "";
		const params = obj.parameters as Record<string, unknown> | undefined;
		const filePath = typeof params?.file_path === "string" ? params.file_path : "";
		const label = filePath
			? `Reading file: ${basename(filePath)}`
			: toolName
				? `${toolName.replace(/_/g, " ")}…`
				: "Using tool…";
		return { line: `${JSON.stringify({ type: "status", status: label })}\n`, assistantContent };
	}
	if (type === "tool_result") {
		return { line: `${JSON.stringify({ type: "status", status: "Tool completed." })}\n`, assistantContent };
	}
	if (type === "result") {
		const status = typeof obj.status === "string" ? obj.status : "";
		if (status === "success") {
			const result = assistantContent.trim() || "(No response)";
			return {
				line: `${JSON.stringify({ type: "result", subtype: "success", result })}\n`,
				assistantContent,
			};
		}
		const err = typeof obj.error === "string" ? obj.error : "Unknown error";
		return {
			line: `${JSON.stringify({ type: "error", error: err })}\n`,
			assistantContent,
		};
	}
	return null;
}

/**
 * Runs Gemini CLI in streaming mode. Spawns the process and returns stdout.
 * Converts Gemini NDJSON stream to cursor-format (status/result) so the frontend shows progress like cursor-agent.
 */
export function runGeminiStream(
	projectPath: string,
	prompt: string,
): { stdout: Readable; child: ChildProcess } {
	const cmd = getAgentCommand();
	const fullPrompt = `${prompt.trim()}. Do not change any files! Only return results in chat!`;
	const isWindows = process.platform === "win32";
	const child = spawn(cmd, [...getGeminiArgs(), fullPrompt], {
		cwd: projectPath,
		stdio: ["ignore", "pipe", "pipe"],
		shell: isWindows,
	});

	if (!child.stdout) {
		throw new Error("Failed to start Gemini CLI: stdout stream is null");
	}

	// Convert Gemini NDJSON to cursor format (status/result) for the frontend.
	const adapter = new Readable({ read() {} });
	adapter.push(
		`${JSON.stringify({ type: "status", status: "Running Gemini…" })}\n`,
	);
	let stdoutBuffer = "";
	let lineBuffer = "";
	let stderrBuffer = "";
	let assistantContent = "";
	let resultEmitted = false;
	let closed = false;

	child.stdout?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => {
		stdoutBuffer += chunk;
		lineBuffer += chunk;
		let idx: number;
		while ((idx = lineBuffer.indexOf("\n")) !== -1) {
			const raw = lineBuffer.slice(0, idx).trim();
			lineBuffer = lineBuffer.slice(idx + 1);
			if (!raw) continue;

			try {
				const obj = JSON.parse(raw) as Record<string, unknown>;
				const converted = geminiEventToCursorLine(obj, assistantContent);
				if (converted) {
					assistantContent = converted.assistantContent;
					if (converted.line) {
						adapter.push(converted.line);
						if (
							converted.line.includes('"type":"result"') ||
							converted.line.includes('"type":"error"')
						) {
							resultEmitted = true;
						}
					}
				} else {
					// Not a Gemini event we handle; show raw as status
					adapter.push(
						`${JSON.stringify({ type: "status", status: raw })}\n`,
					);
				}
			} catch {
				// Not JSON; push as status
				adapter.push(
					`${JSON.stringify({ type: "status", status: raw })}\n`,
				);
			}
		}
	});
	child.stderr?.setEncoding("utf8");
	child.stderr?.on("data", (chunk: string) => {
		stderrBuffer += chunk;
	});

	function emitFinal() {
		if (closed) return;
		closed = true;
		if (resultEmitted) {
			adapter.push(null);
			return;
		}
		const code = child.exitCode ?? null;
		const stderrTrim = stderrBuffer.trim();
		const stdoutTrim = stdoutBuffer.trim();

		if (code !== 0 && code !== null) {
			const errorMsg = stderrTrim
				? `Exit code ${code}. stderr:\n${stderrTrim}`
				: `Process exited with code ${code}.`;
			console.error("[gemini-agent]", errorMsg);
			adapter.push(
				`${JSON.stringify({ type: "error", error: errorMsg })}\n`,
			);
		} else if (assistantContent.trim()) {
			adapter.push(
				`${JSON.stringify({
					type: "result",
					subtype: "success",
					result: assistantContent.trim(),
				})}\n`,
			);
		} else if (stdoutTrim) {
			adapter.push(
				`${JSON.stringify({
					type: "result",
					subtype: "success",
					result: stdoutTrim,
				})}\n`,
			);
		} else if (stderrTrim) {
			adapter.push(
				`${JSON.stringify({
					type: "result",
					subtype: "success",
					result: `(No stdout)\n\n--- stderr ---\n${stderrTrim}`,
				})}\n`,
			);
		} else {
			adapter.push(
				`${JSON.stringify({
					type: "result",
					subtype: "success",
					result: "(No output)",
				})}\n`,
			);
		}
		adapter.push(null);
	}

	child.on("close", (_code, _signal) => {
		emitFinal();
	});
	child.stdout?.on("error", (err) => {
		adapter.destroy(err);
	});

	return { stdout: adapter, child };
}

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import { getAgentCommand, getAgentModel } from "../config";

function getClaudeCliArgs(): string[] {
	const args = [
		"-p",
		"--output-format",
		"stream-json",
		"--verbose",
		"--allowedTools",
		"Read,Grep,Glob",
	];
	const model = getAgentModel();
	if (model) {
		args.push("--model", model);
	}
	return args;
}

/**
 * Runs the Claude Code CLI (`claude -p`) in streaming mode (--output-format stream-json).
 * Uses the CLI's own login (subscription or API key), so no ANTHROPIC_API_KEY is required by this app.
 * The prompt is passed via stdin to avoid shell quoting issues on Windows.
 * Only read-only tools are pre-approved; anything else is denied in non-interactive mode.
 */
export function runClaudeCliStream(
	projectPath: string,
	prompt: string,
): { stdout: Readable; child: ChildProcess } {
	const cmd = getAgentCommand();
	const fullPrompt = `${prompt.trim()}. Do not change any files! Only return results in chat!`;
	const isWindows = process.platform === "win32";
	const child = spawn(cmd, getClaudeCliArgs(), {
		cwd: projectPath,
		stdio: ["pipe", "pipe", "pipe"],
		shell: isWindows,
	});

	if (!child.stdout) {
		throw new Error("Failed to start claude: stdout stream is null");
	}

	child.stdin?.on("error", () => {
		// Process may exit before reading the prompt; the close handler reports the failure.
	});
	child.stdin?.end(fullPrompt);

	if (child.stderr) {
		let stderrBuffer = "";
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderrBuffer += chunk;
		});
		child.on("close", (code) => {
			if (code !== 0 && code !== null) {
				const stderrTrim = stderrBuffer.trim();
				const errorMsg = stderrTrim
					? `Exit code ${code}. stderr:\n${stderrTrim}`
					: `Process exited with code ${code}.`;
				console.error("[claude-cli]", errorMsg);
			}
		});
	}

	return { stdout: child.stdout, child };
}

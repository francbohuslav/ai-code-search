import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import { getAgentCommand } from "../config";

const AGENT_ARGS = [
	"-p",
	"--mode",
	"ask",
	"--model",
	"auto",
	"--output-format",
	"stream-json",
	"agent",
];

/**
 * Runs cursor-agent in streaming mode (--output-format stream-json).
 * Returns stdout as a Node.js Readable stream. Process keeps running until stream is consumed or closed.
 */
export function runCursorAgentStream(
	projectPath: string,
	prompt: string,
): { stdout: Readable; child: ChildProcess } {
	const cmd = getAgentCommand();
	const fullPrompt = `${prompt.trim()}. Do not change any files! Only return results in chat!`;
	const isWindows = process.platform === "win32";
	const child = spawn(cmd, [...AGENT_ARGS, fullPrompt], {
		cwd: projectPath,
		stdio: ["ignore", "pipe", "pipe"],
		shell: isWindows,
	});

	if (!child.stdout) {
		throw new Error("Failed to start cursor-agent: stdout stream is null");
	}

	return { stdout: child.stdout, child };
}

/**
 * Runs cursor-agent and returns full output (for test/fake and non-streaming fallback).
 */
export async function runCursorAgent(
	projectPath: string,
	prompt: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
	const execaModule = await import("execa");
	const execa = execaModule.default;
	const cmd = getAgentCommand();
	const fullPrompt = `${prompt.trim()} Do not change any files! Only return results in chat!`;
	const argsNoStream = AGENT_ARGS.filter(
		(a) => a !== "--output-format" && a !== "stream-json",
	);

	try {
		const result = await execa(cmd, [...argsNoStream, fullPrompt], {
			cwd: projectPath,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});

		return {
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			code: result.exitCode ?? 0,
		};
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"stdout" in error &&
			"stderr" in error &&
			"exitCode" in error
		) {
			const execaError = error as {
				stdout?: string;
				stderr?: string;
				exitCode?: number;
			};
			return {
				stdout: execaError.stdout ?? "",
				stderr: execaError.stderr ?? "",
				code: execaError.exitCode ?? 1,
			};
		}
		throw error;
	}
}

import { promises as fs } from "node:fs";
import path from "node:path";
import express, { Router } from "express";
import { getCodebaseMap } from "../utils/codebase-list";
import { runAgentStream } from "../utils/agent-runner";
import {
	cloneRepository,
	getProjectPath,
	getProjects,
	pullRepository,
} from "../utils/projects";
import { needsPull, updateLastPullDate } from "../utils/metadata";

export const apiRouter = Router();

apiRouter.use(express.json());

apiRouter.get("/projects", async (_req, res) => {
	try {
		const [localProjects, codebaseMap] = await Promise.all([
			getProjects(),
			getCodebaseMap(),
		]);
		const local = [...localProjects].sort();
		const codebaseKeys = Array.from(codebaseMap.keys()).sort();
		const remoteOnly = codebaseKeys.filter((k) => !local.includes(k));
		const projects = [...local, ...remoteOnly];
		res.json({ projects, localProjects: local });
	} catch (e) {
		res.status(500).json({
			error: e instanceof Error ? e.message : "Failed to list projects",
		});
	}
});

apiRouter.post("/search", async (req, res) => {
	const body = (req.body ?? {}) as { project?: string; prompt?: string };

	const project = typeof body.project === "string" ? body.project.trim() : "";
	const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

	if (!project) {
		res.status(400).json({ error: "Missing or empty project" });
		return;
	}
	if (!prompt) {
		res.status(400).json({ error: "Missing or empty prompt" });
		return;
	}

	const localProjects = await getProjects();
	const needClone = !localProjects.includes(project);
	let cloneUrl: string | null = null;
	if (needClone) {
		const codebaseMap = await getCodebaseMap();
		const url = codebaseMap.get(project);
		if (!url) {
			res.status(400).json({
				error:
					"Project not found. Select a project from the list or ensure it exists in SOURCES_DIR.",
			});
			return;
		}
		cloneUrl = url;
	}

	try {
		if (prompt === "test") {
			const testPath = path.join(process.cwd(), "test.md");
			const stdout = await fs.readFile(testPath, "utf8");
			console.log("[search] fake response from test.md (prompt=test)");
			res.json({ stdout, stderr: "", code: 0 });
			return;
		}

		res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
		res.setHeader("X-Response-Mode", "stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");

		if (needClone && cloneUrl) {
			res.write(
				`${JSON.stringify({
					type: "status",
					status: "Cloning repository…",
				})}\n`,
			);
			try {
				console.log(`[search] cloning ${project} from ${cloneUrl}`);
				await cloneRepository(cloneUrl);
				const afterClone = await getProjects();
				if (!afterClone.includes(project)) {
					res.write(
						`${JSON.stringify({
							type: "error",
							error: "Clone completed but project folder not found.",
						})}\n`,
					);
					res.end();
					return;
				}
			} catch (e) {
				const msg =
					e instanceof Error ? e.message : "Failed to clone repository";
				res.write(`${JSON.stringify({ type: "error", error: msg })}\n`);
				res.end();
				return;
			}
		}

		// Check if repository needs to be updated (git pull)
		const shouldPull = await needsPull(project);
		if (shouldPull) {
			res.write(
				`${JSON.stringify({
					type: "status",
					status: "Updating repository…",
				})}\n`,
			);
			try {
				console.log(`[search] pulling ${project}`);
				await pullRepository(project);
				await updateLastPullDate(project);
			} catch (e) {
				const msg =
					e instanceof Error ? e.message : "Failed to update repository";
				res.write(`${JSON.stringify({ type: "error", error: msg })}\n`);
				res.end();
				return;
			}
		}

		const projectPath = getProjectPath(project);
		console.log(`[search] project=${project} dir=${projectPath}`);
		console.log(`[search] prompt=${prompt} (streaming)`);
		const startMs = Date.now();
		const { stdout, child } = runAgentStream(projectPath, prompt);

		child.on("error", (err) => {
			console.error("Failed to start cursor-agent process", err);
			res.write(
				`${JSON.stringify({
					type: "error",
					error:
						"Failed to start cursor-agent process. Ensure cursor-agent is installed and available in PATH.",
				})}\n`,
			);
			res.end();
		});

		// Collect stderr for error reporting
		let stderrBuffer = "";
		let exitCode: number | null = null;
		let streamEnded = false;
		if (child.stderr) {
			child.stderr.setEncoding("utf8");
			child.stderr.on("data", (chunk: string) => {
				stderrBuffer += chunk;
			});
		}

		child.on("close", (code) => {
			exitCode = code;
			const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(2);
			console.log(
				`[search] done in ${elapsedSec}s (exit code: ${code ?? "unknown"})`,
			);
			if (code !== 0 && code !== null) {
				const stderrTrim = stderrBuffer.trim();
				const errorMsg = stderrTrim
					? `Exit code ${code}. stderr:\n${stderrTrim}`
					: `Process exited with code ${code}.`;
				console.error("[search]", errorMsg);
				// Send error to stream if not already ended
				if (!streamEnded && !res.closed && !res.destroyed) {
					res.write(
						`${JSON.stringify({ type: "error", error: errorMsg })}\n`,
					);
				}
			}
		});

		stdout.on("data", (chunk: Buffer) => {
			res.write(chunk);
		});

		stdout.on("end", () => {
			streamEnded = true;
			// If process exited with error code but no error was sent in stream, send it now
			if (exitCode !== 0 && exitCode !== null && !res.closed && !res.destroyed) {
				const stderrTrim = stderrBuffer.trim();
				const errorMsg = stderrTrim
					? `Exit code ${exitCode}. stderr:\n${stderrTrim}`
					: `Process exited with code ${exitCode}.`;
				res.write(
					`${JSON.stringify({ type: "error", error: errorMsg })}\n`,
				);
			}
			res.end();
		});

		stdout.on("error", (err: Error) => {
			console.error("Error reading cursor-agent stream", err);
			res.end();
		});
	} catch (e) {
		res.status(500).json({
			error: e instanceof Error ? e.message : "Failed to run cursor-agent",
		});
	}
});

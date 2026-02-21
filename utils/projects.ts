import { promises as fs } from "node:fs";
import path from "node:path";
import { getSourcesDir } from "../config";

/**
 * Returns list of project names (subdirectory names) in the sources directory.
 * @param sourcesDir - Path to sources directory (if not set, uses SOURCES_DIR env var)
 */
export async function getProjects(sourcesDir?: string): Promise<string[]> {
	const dir = getSourcesDir(sourcesDir);

	let entries: import("fs").Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch (e: unknown) {
		if (
			e &&
			typeof e === "object" &&
			"code" in e &&
			(e as { code?: string }).code === "ENOENT"
		) {
			throw new Error(`SOURCES_DIR does not exist: ${dir}`);
		}
		throw e;
	}

	const projects: string[] = [];
	for (const entry of entries) {
		if (entry.isDirectory() && !entry.name.startsWith(".")) {
			const fullPath = path.join(dir, entry.name);
			try {
				await fs.stat(fullPath);
				projects.push(entry.name);
			} catch {
				// skip inaccessible
			}
		}
	}

	return projects.sort();
}

/**
 * Resolves full path for a project name. Validates that the project is under SOURCES_DIR.
 */
export function getProjectPath(
	projectName: string,
	sourcesDir?: string,
): string {
	const dir = getSourcesDir(sourcesDir);
	// Prevent directory traversal
	if (
		projectName.includes("..") ||
		projectName.includes("/") ||
		projectName.includes("\\")
	) {
		throw new Error(`Invalid project name ${projectName}.`);
	}
	return path.join(dir, projectName);
}

const BRANCH_ORDER = ["sprint", "master", "main"];

/**
 * Clones a repository into SOURCES_DIR. The created folder name is the last segment of the URL.
 * Tries branches in order: sprint, master, main. Logs which branch is tried and which one is used.
 */
export async function cloneRepository(
	url: string,
	sourcesDir?: string,
): Promise<void> {
	const execaModule = await import("execa");
	const execa = execaModule.default;
	const dir = getSourcesDir(sourcesDir);
	let lastError: Error | null = null;

	for (const branch of BRANCH_ORDER) {
		console.log(`[clone] Trying branch "${branch}"...`);
		try {
			await execa("git", ["clone", "-b", branch, url], {
				cwd: dir,
				stdin: "ignore",
				stdout: "ignore",
				stderr: "pipe",
			});
			console.log(`[clone] Cloned with branch "${branch}"`);
			return;
		} catch (error: unknown) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (
				error &&
				typeof error === "object" &&
				"exitCode" in error &&
				(error as { exitCode?: number }).exitCode === 128
			) {
				continue;
			}
			if (
				error &&
				typeof error === "object" &&
				"stderr" in error &&
				"exitCode" in error
			) {
				const execaError = error as { stderr?: string; exitCode?: number };
				const stderrText = execaError.stderr?.trim() ?? "";
				throw new Error(
					`git clone failed: ${stderrText || `exit code ${execaError.exitCode ?? "unknown"}`}`,
				);
			}
			throw error;
		}
	}

	const msg =
		lastError instanceof Error ? lastError.message : "Failed to clone repository";
	throw new Error(`git clone failed (no branch found): ${msg}`);
}

/**
 * Returns the first branch from BRANCH_ORDER that exists on origin (after fetch).
 * Falls back to current branch if none of the preferred branches exist.
 */
async function getBranchToPull(projectPath: string): Promise<string> {
	const execaModule = await import("execa");
	const execa = execaModule.default;
	let currentBranch = "main";
	try {
		const result = await execa("git", ["branch", "--show-current"], {
			cwd: projectPath,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		if (result.stdout?.trim()) {
			currentBranch = result.stdout.trim();
		}
	} catch {
		// use default
	}

	for (const branch of BRANCH_ORDER) {
		try {
			await execa("git", ["rev-parse", "--verify", `origin/${branch}`], {
				cwd: projectPath,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			});
			return branch;
		} catch {
			// try next branch
		}
	}
	return currentBranch;
}

/**
 * Performs git fetch then pull in the repository directory for the given library.
 * Uses the same branch order as clone (sprint, master, main): picks the first branch
 * that exists on origin, checks it out if needed, then pulls. Logs which branch is used.
 */
export async function pullRepository(
	libraryName: string,
	sourcesDir?: string,
): Promise<void> {
	const execaModule = await import("execa");
	const execa = execaModule.default;
	const projectPath = getProjectPath(libraryName, sourcesDir);

	try {
		await execa("git", ["fetch", "origin"], {
			cwd: projectPath,
			stdin: "ignore",
			stdout: "ignore",
			stderr: "pipe",
		});
	} catch {
		// Continue to pull even if fetch fails (e.g. offline)
	}

	const branchToUse = await getBranchToPull(projectPath);

	let currentBranch = "?";
	try {
		const result = await execa("git", ["branch", "--show-current"], {
			cwd: projectPath,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		if (result.stdout?.trim()) {
			currentBranch = result.stdout.trim();
		}
	} catch {
		// keep "?"
	}

	if (currentBranch !== branchToUse) {
		try {
			await execa("git", ["checkout", branchToUse], {
				cwd: projectPath,
				stdin: "ignore",
				stdout: "ignore",
				stderr: "pipe",
			});
		} catch (error: unknown) {
			if (
				error &&
				typeof error === "object" &&
				"stderr" in error &&
				"exitCode" in error
			) {
				const execaError = error as { stderr?: string; exitCode?: number };
				const stderrText = execaError.stderr?.trim() ?? "";
				throw new Error(
					`git checkout ${branchToUse} failed: ${stderrText || `exit code ${execaError.exitCode ?? "unknown"}`}`,
				);
			}
			throw error;
		}
	}

	console.log(`[pull] ${libraryName}: using branch "${branchToUse}"`);

	try {
		await execa("git", ["pull"], {
			cwd: projectPath,
			stdin: "ignore",
			stdout: "ignore",
			stderr: "pipe",
		});
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"stderr" in error &&
			"exitCode" in error
		) {
			const execaError = error as { stderr?: string; exitCode?: number };
			const stderrText = execaError.stderr?.trim() ?? "";
			throw new Error(
				`git pull failed: ${stderrText || `exit code ${execaError.exitCode ?? "unknown"}`}`,
			);
		}
		throw error;
	}
}

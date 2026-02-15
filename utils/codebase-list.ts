import { promises as fs } from "node:fs";
import { getCodebaseListPath } from "../config";

export interface CodebaseEntry {
	url: string;
	name: string;
	description?: string;
}

let cachedMap: Map<string, CodebaseEntry> | null = null;

/**
 * Returns the last path segment of a URL (e.g. repo/codebase name).
 * Strips trailing ".git" so that clone URLs and HTTPS URLs yield the same name.
 */
function lastSegment(url: string): string {
	const normalized = url.replace(/\/$/, "");
	const parts = normalized.split("/").filter(Boolean);
	const segment = parts[parts.length - 1] ?? normalized;
	return segment.endsWith(".git") ? segment.slice(0, -4) : segment;
}

/**
 * Loads codebase-list.json and returns a map: name -> CodebaseEntry.
 * Supports both simple string URLs and enhanced { url, name, description } objects.
 * Cached after first load.
 */
export async function getCodebaseMap(): Promise<Map<string, CodebaseEntry>> {
	if (cachedMap) {
		return cachedMap;
	}
	let filePath: string;
	try {
		filePath = getCodebaseListPath();
	} catch (err) {
		console.error(
			`[codebase-list] ${err instanceof Error ? err.message : "Failed to get codebase list path"}`,
		);
		cachedMap = new Map();
		return cachedMap;
	}
	let entries: unknown;
	try {
		const content = await fs.readFile(filePath, "utf8");
		entries = JSON.parse(content);
	} catch (err) {
		console.error(
			`[codebase-list] Failed to read codebase list from ${filePath}:`,
			err instanceof Error ? err.message : err,
		);
		cachedMap = new Map();
		return cachedMap;
	}
	if (!Array.isArray(entries)) {
		console.error(
			`[codebase-list] Invalid format: expected array, got ${typeof entries}`,
		);
		cachedMap = new Map();
		return cachedMap;
	}
	const map = new Map<string, CodebaseEntry>();
	for (const entry of entries) {
		if (typeof entry === "string" && entry.trim()) {
			const key = lastSegment(entry);
			map.set(key, { url: entry, name: key });
		} else if (
			entry &&
			typeof entry === "object" &&
			typeof (entry as Record<string, unknown>).url === "string"
		) {
			const obj = entry as Record<string, unknown>;
			const url = obj.url as string;
			const name =
				typeof obj.name === "string" ? obj.name : lastSegment(url);
			const description =
				typeof obj.description === "string" ? obj.description : undefined;
			map.set(name, { url, name, description });
		}
	}
	cachedMap = map;
	return cachedMap;
}

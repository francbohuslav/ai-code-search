import { promises as fs } from "node:fs";
import { getCodebaseListPath } from "../config";

let cachedMap: Map<string, string> | null = null;

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
 * Loads codebase-list.json and returns a map: last URL segment -> full URL.
 * Cached after first load.
 * The file path is read from CODEBASE_LIST_PATH environment variable.
 */
export async function getCodebaseMap(): Promise<Map<string, string>> {
	if (cachedMap) {
		return cachedMap;
	}
	let filePath: string;
	try {
		filePath = getCodebaseListPath();
	} catch (err) {
		// If CODEBASE_LIST_PATH is not set, return empty map
		console.error(
			`[codebase-list] ${err instanceof Error ? err.message : "Failed to get codebase list path"}`,
		);
		cachedMap = new Map();
		return cachedMap;
	}
	let urls: unknown;
	try {
		const content = await fs.readFile(filePath, "utf8");
		urls = JSON.parse(content);
	} catch (err) {
		console.error(
			`[codebase-list] Failed to read codebase list from ${filePath}:`,
			err instanceof Error ? err.message : err,
		);
		cachedMap = new Map();
		return cachedMap;
	}
	if (!Array.isArray(urls)) {
		console.error(
			`[codebase-list] Invalid format: expected array, got ${typeof urls}`,
		);
		cachedMap = new Map();
		return cachedMap;
	}
	const map = new Map<string, string>();
	for (const url of urls) {
		if (typeof url === "string" && url.trim()) {
			const key = lastSegment(url);
			map.set(key, url);
		}
	}
	cachedMap = map;
	return cachedMap;
}

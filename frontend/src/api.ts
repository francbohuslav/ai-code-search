import { parseStreamEvent } from "../../utils/stream-parser";

const API_BASE = "";

export interface ProjectOption {
	name: string;
	isLocal: boolean;
}

export async function fetchProjects(): Promise<ProjectOption[]> {
	const res = await fetch(`${API_BASE}/api/projects`);
	if (!res.ok) {
		throw new Error(`Failed to load projects: ${res.statusText}`);
	}
	const data = await res.json();
	if (!Array.isArray(data.projects)) {
		throw new Error("Invalid response: missing projects");
	}
	const all: string[] = data.projects;
	const localList: string[] = Array.isArray(data.localProjects)
		? data.localProjects
		: all;
	const localSet = new Set(localList);
	return all.map((name) => ({ name, isLocal: localSet.has(name) }));
}

export interface SearchResult {
	stdout: string;
	stderr: string;
	code: number;
}

export interface RunSearchCallbacks {
	onStatus?: (status: string) => void;
	onResult?: (markdown: string) => void;
}

export async function runSearch(
	project: string,
	prompt: string,
	callbacks?: RunSearchCallbacks,
): Promise<SearchResult> {
	const res = await fetch(`${API_BASE}/api/search`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ project, prompt }),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(
			(err as { error?: string }).error ?? `Search failed: ${res.statusText}`,
		);
	}

	const isStream = res.headers.get("X-Response-Mode") === "stream";
	if (!isStream || !res.body) {
		return res.json() as Promise<SearchResult>;
	}

	const decoder = new TextDecoder();
	let buffer = "";
	let resultMarkdown = "";
	const reader = res.body.getReader();

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				const parsed = parseStreamEvent(line);
				if (!parsed) continue;
				if (parsed.error) throw new Error(parsed.error);
				if (parsed.status) callbacks?.onStatus?.(parsed.status);
				if (parsed.result) {
					resultMarkdown = parsed.result;
					callbacks?.onResult?.(parsed.result);
				}
			}
		}
		if (buffer) {
			const parsed = parseStreamEvent(buffer);
			if (parsed?.error) throw new Error(parsed.error);
			if (parsed?.status) callbacks?.onStatus?.(parsed.status);
			if (parsed?.result) {
				resultMarkdown = parsed.result;
				callbacks?.onResult?.(parsed.result);
			}
		}
	} finally {
		reader.releaseLock();
	}

	return { stdout: resultMarkdown, stderr: "", code: 0 };
}

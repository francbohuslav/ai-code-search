import { promises as fs } from "node:fs";
import path from "node:path";
import { getSourcesDir } from "../config";

interface LibraryMetadata {
	lastPull: string; // ISO 8601 date string
}

interface MetadataFile {
	libraries: Record<string, LibraryMetadata>;
}

/**
 * Returns the path to metadata.json in SOURCES_DIR.
 */
function getMetadataPath(sourcesDir?: string): string {
	const dir = getSourcesDir(sourcesDir);
	return path.join(dir, "metadata.json");
}

/**
 * Loads metadata.json if it exists, otherwise returns empty metadata object.
 * If reading fails, returns empty metadata (treats as "no record").
 */
export async function loadMetadata(sourcesDir?: string): Promise<MetadataFile> {
	const metadataPath = getMetadataPath(sourcesDir);
	try {
		const content = await fs.readFile(metadataPath, "utf8");
		const parsed = JSON.parse(content) as unknown;
		if (
			parsed &&
			typeof parsed === "object" &&
			"libraries" in parsed &&
			typeof parsed.libraries === "object" &&
			parsed.libraries !== null
		) {
			return parsed as MetadataFile;
		}
		return { libraries: {} };
	} catch {
		// File doesn't exist or is invalid - treat as empty metadata
		return { libraries: {} };
	}
}

/**
 * Saves metadata.json atomically (write to temp file, then rename).
 * If save fails, logs warning but doesn't throw (pull already happened).
 */
export async function saveMetadata(
	metadata: MetadataFile,
	sourcesDir?: string,
): Promise<void> {
	const metadataPath = getMetadataPath(sourcesDir);
	const tempPath = `${metadataPath}.tmp`;
	try {
		const content = JSON.stringify(metadata, null, 2);
		await fs.writeFile(tempPath, content, "utf8");
		await fs.rename(tempPath, metadataPath);
	} catch (error) {
		// Try to clean up temp file if it exists
		try {
			await fs.unlink(tempPath);
		} catch {
			// Ignore cleanup errors
		}
		console.warn(
			`[metadata] Failed to save metadata.json: ${error instanceof Error ? error.message : "unknown error"}`,
		);
		// Don't throw - pull already succeeded, metadata save failure is non-critical
	}
}

/**
 * Returns the last pull date for a library, or null if not found.
 */
export async function getLastPullDate(
	libraryName: string,
	sourcesDir?: string,
): Promise<Date | null> {
	const metadata = await loadMetadata(sourcesDir);
	const libraryMeta = metadata.libraries[libraryName];
	if (!libraryMeta || !libraryMeta.lastPull) {
		return null;
	}
	try {
		return new Date(libraryMeta.lastPull);
	} catch {
		return null;
	}
}

/**
 * Updates the last pull date for a library to the current time.
 */
export async function updateLastPullDate(
	libraryName: string,
	sourcesDir?: string,
): Promise<void> {
	const metadata = await loadMetadata(sourcesDir);
	metadata.libraries[libraryName] = {
		lastPull: new Date().toISOString(),
	};
	await saveMetadata(metadata, sourcesDir);
}

/**
 * Returns true if the library needs a pull (no record or last pull was yesterday or earlier).
 * Compares only the date part (ignores time) - if lastPull is before today's start, returns true.
 */
export async function needsPull(
	libraryName: string,
	sourcesDir?: string,
): Promise<boolean> {
	const lastPullDate = await getLastPullDate(libraryName, sourcesDir);
	if (!lastPullDate) {
		// No record - needs pull
		return true;
	}

	// Get today's start (00:00:00)
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	// Compare dates (ignore time)
	const lastPullDateOnly = new Date(lastPullDate);
	lastPullDateOnly.setHours(0, 0, 0, 0);

	// If lastPull is before today, needs pull
	return lastPullDateOnly < today;
}

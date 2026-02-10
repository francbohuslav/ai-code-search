#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const dir = __dirname;
const serverPath = path.join(dir, "mcp-server.ts");

// Use locally installed tsx to run mcp-server.ts
const result = spawnSync("npx", ["tsx", serverPath], {
	stdio: "inherit",
	cwd: dir,
	shell: true,
});

process.exitCode = result.status !== null ? result.status : 1;

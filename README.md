# Code Search using cursor-agent, Gemini CLI, or Claude Agent SDK

Run an AI agent on selected codebases in two ways:

1. **MCP server** – use from Cursor, Claude Desktop or other MCP clients (tools: query a library, list libraries).
2. **Standalone application with GUI** – web UI in the browser; you choose a project and enter a prompt.

Backend is Node.js (TypeScript), frontend is React with Material UI.

## Requirements

- [Node.js](https://nodejs.org/) and npm
- **Agent:** [Cursor CLI](https://cursor.com/cli) **cursor-agent**, [Gemini CLI](https://geminicli.com/) **gemini**, or **Claude Agent SDK** (with `ANTHROPIC_API_KEY`). Set **AGENT_TYPE** to `cursor`, `gemini`, or `claude`. \
  Helpful commands (Windows PowerShell):

- **SOURCES_DIR** – directory where cloned projects live (one subdirectory per project)
- optional **CODEBASE_LIST_PATH** – path to a JSON file with the list of available codebase URLs

### Cursor Agent helpful commands

Use official installation guide from Cursor. If you struggle, use these commands:

- `irm 'https://cursor.com/install?win32=true' | iex`
- `winget install BurntSushi.ripgrep.MSVC`
- `cursor-agent --version` - everything is OK if version is printed

### Gemini CLI helpful commands

Use official installation guide from Gemini. If you struggle, use these commands:

- `npm install -g @google/gemini-cli`
- `gemini -v` - everything is OK if version is printed

### Claude Agent SDK (AGENT_TYPE=claude)

The backend includes `@anthropic-ai/claude-agent-sdk`. Set **ANTHROPIC_API_KEY** in your environment (e.g. in `.env`). No separate CLI install needed. If `npm install` fails due to peer dependency (zod), run `npm install --legacy-peer-deps`.

## 1. MCP server

Use ai-code-search as an MCP server so that your IDE or Claude can call **question** (query a library) and **list_libraries** (list available libraries). The server runs as a separate process and communicates via stdio.

### What you need to do

1. **Install the agent** (cursor-agent or Gemini CLI in PATH, or set **AGENT_TYPE=claude** and **ANTHROPIC_API_KEY** for Claude). Optionally set **AGENT_CMD** for cursor/gemini.
2. **Configure your MCP client** with the path to this server and the required environment variables.

### MCP client configuration

Add the server to your MCP config. Use **SOURCES_DIR** (where clones are stored) and **CODEBASE_LIST_PATH** (path to `codebase-list.json` or your own list file).

**Example – Cursor (`~/.cursor/mcp.json` or equivalent):**

```json
{
  "mcpServers": {
    "ai-code-search": {
      "command": "npx",
      "args": ["-y", "github:francbohuslav/ai-code-search"],
      "env": {
        "SOURCES_DIR": "c:\\...\\repos",
        "CODEBASE_LIST_PATH": "c:\\...\\codebase-list.json"
      }
    }
  }
}
```

**Example – Claude Desktop** (use the same structure in your Claude MCP config file, e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS).

Optional env vars: **AGENT_TYPE** (`cursor` | `gemini` | `claude`, default `cursor`), **AGENT_CMD** – command for cursor/gemini (default `"cursor-agent"` / `"gemini"`). For **claude**, set **ANTHROPIC_API_KEY**. **AGENT_MODEL** (optional) – model for any backend (cursor/gemini/claude).

### MCP tools

- **`question`** – Parameters: `library` (string), `prompt` (string). Runs cursor-agent on the given library; clones it first if not in `SOURCES_DIR`. Supports progress notifications.
- **`list_libraries`** – Returns all libraries from the codebase list with `{ name, downloaded, url? }[]`.

## 2. Standalone application with GUI

Run the web server and open the UI in a browser. You select a project (from `SOURCES_DIR` and/or the codebase list) and enter a prompt; the backend runs cursor-agent and streams the result.

### What you need to do

1. **Set environment variables** (e.g. in `.env` in the project root):

   - **SOURCES_DIR** – absolute path to the directory with project subdirectories (required).
   - **CODEBASE_LIST_PATH** – absolute path to your codebase list JSON file (required if you want the dropdown to show codebases from the list).
   - **PORT** (optional) – HTTP server port, default 8000.
   - **AGENT_TYPE** (optional) – `cursor` | `gemini` | `claude`, default `cursor`.
   - **AGENT_CMD** (optional) – command for cursor/gemini (default `"cursor-agent"` or `"gemini"`). For **claude**, set **ANTHROPIC_API_KEY**. **AGENT_MODEL** (optional) – model for any backend.

2. **Install and build:**

   - Copy `.env.example` to `.env` and fill in the paths.
   - Install backend and frontend, then build the frontend.

3. **Start the server** and open the app in the browser.

### Quick start (clone and run locally)

```bash
# 1. Clone repo, then in repo root:
cp .env.example .env
# Edit .env: set SOURCES_DIR and CODEBASE_LIST_PATH

# 2. Install and build frontend
npm install
cd frontend && npm install && npm run build && cd ..

# 3. Start server
npm run dev
```

Server runs at `http://localhost:8000` (or the port from `.env`).

### Run with npx (no clone)

```bash
npx -y github:francbohuslav/ai-code-search
```

Set **SOURCES_DIR** and **CODEBASE_LIST_PATH** in your environment. The GUI will work only if the frontend is built (in the npx cache you can run `cd frontend && npm install && npm run build` from the installed package directory, or clone the repo and use the steps above).

### Usage (GUI)

1. Open `http://localhost:8000` in a browser.
2. Select a **project** from the dropdown (from `SOURCES_DIR` / codebase list).
3. Enter your **prompt** and click **Submit**.

The backend runs cursor-agent in the selected project directory and streams the result to the page.

### Frontend development (optional)

Run backend and Vite separately for HMR:

```bash
# Terminal 1 – backend
npm run dev
```

```bash
# Terminal 2 – frontend
cd frontend && npm run dev
```

Frontend at `http://localhost:5173`; API calls go to the backend.

## Environment variables summary

| Variable               | Required | MCP/GUI  | Description                                                                 |
| ---------------------- | -------- | -------- | --------------------------------------------------------------------------- |
| **SOURCES_DIR**        | yes      | both     | Directory for cloned projects (one subfolder per project).                  |
| **CODEBASE_LIST_PATH** | no       | both     | Path to JSON file: array of codebase URLs or `{ url, name, description }`.  |
| **PORT**               | no       | GUI only | HTTP server port (default 8000).                                            |
| **AGENT_TYPE**         | no       | both     | Agent: `cursor` \| `gemini` \| `claude` (default `cursor`).                 |
| **AGENT_CMD**          | no       | both     | Command for cursor/gemini (default `"cursor-agent"` or `"gemini"`).         |
| **AGENT_MODEL**        | no       | both     | Model for the agent (cursor: `--model`, gemini: `-m`, claude: SDK). Optional for all. |

# Code Search using cursor-agent

Web application for running **cursor-agent** on selected projects through a browser. Backend is in Node.js (TypeScript), frontend in React with Material UI. The application also provides an **MCP (Model Context Protocol) server** for integration with MCP clients (e.g., Cursor, Claude Desktop).

## Requirements

- [Node.js](https://nodejs.org/) and npm (for both backend and frontend)
- **cursor-agent** installed in PATH
- Directory with source projects (each project = one subdirectory)

## Configuration

### Environment variables

You can configure the application either via a local `.env` file (convenient for local HTTP server)
or via environment variables provided by your MCP client / IDE (recommended for pure MCP usage).

1. Copy `.env.example` to `.env` (for local server):
   ```bash
   cp .env.example .env
   ```
2. In `.env` **or** in your IDE / MCP configuration, set:
   - **SOURCES_DIR** – absolute path to the directory where you have projects (subdirectories).
   - **PORT** (optional) – server port, default is 8000 (used only by the HTTP server).
   - **CURSOR_AGENT_CMD** (optional) – command to run cursor-agent, default is "cursor-agent". Use if you have cursor-agent installed under a different name or path.

Example `.env`:

```env
SOURCES_DIR=C:\Projekty\sources
PORT=8000
# CURSOR_AGENT_CMD=cursor-agent
```

## Running

### Run with npx (from GitHub)

You can run the web server without cloning the repo:

```bash
npx github:francbohuslav/ai-code-search
```

This installs the package and starts the server (default port 8000). Set `SOURCES_DIR` and optionally `CODEBASE_LIST_PATH` in your environment. For the web UI, build the frontend once: from the installed package directory run `cd frontend && npm install && npm run build`. Or clone the repo and follow the steps below.

### 1. Install dependencies (clone and run locally)

```bash
# Backend (in repository root)
npm install

# Frontend
cd frontend
npm install
cd ..
```

### 2. Build frontend

```bash
cd frontend
npm run build
cd ..
```

### 3. Start server

```bash
npm run dev
```

For production:

```bash
npm run build
npm run start
```

Server will run on `http://localhost:8000` (or on the port from `.env`).

### 4. Start MCP server

MCP server runs as a separate process and communicates via stdio:

```bash
npm run mcp
```

MCP server provides the following tools:
- **`question`** – query a specific library (automatically clones if not downloaded)
- **`list_libraries`** – list all available libraries (both downloaded and not downloaded)

#### MCP client configuration

**For Cursor:**
Add to `~/.cursor/mcp.json` (or equivalent configuration file). Here we also show how to pass
environment variables directly from Cursor, so you don't need a `.env` file for the MCP server:

```json
{
  "mcpServers": {
    "ai-code-search": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/project/source",
      "env": {
        "SOURCES_DIR": "/absolute/path/to/sources",
        "CURSOR_AGENT_CMD": "cursor-agent"
      }
    }
  }
}
```

**For Claude Desktop:**
Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or equivalent file:

```json
{
  "mcpServers": {
    "ai-code-search": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/project/source",
      "env": {
        "SOURCES_DIR": "/absolute/path/to/sources",
        "CURSOR_AGENT_CMD": "cursor-agent"
      }
    }
  }
}
```

### Frontend development (optional)

For React application development with HMR, run backend in one terminal and Vite in another:

```bash
# Terminal 1 – backend
npm run dev
```

```bash
# Terminal 2 – frontend (proxy on /api points to localhost:8000)
cd frontend
npm run dev
```

Frontend then runs on `http://localhost:5173` and API calls go to backend.

## Usage

1. Open the server address in a browser (e.g., `http://localhost:8000`).
2. Enter your query for cursor-agent in the **Prompt** field.
3. Select a project from the **Project** dropdown (loaded from `SOURCES_DIR`).
4. Click **Submit**.

Backend will run in the selected project directory:

```bash
cursor-agent -p --mode ask agent "{your prompt}"
```

Result (stdout, stderr, and exit code) will be displayed on the page.

## Project structure

- **server.ts** – Node.js server, loading `.env`, API and serving frontend from `frontend/dist`
- **mcp-server.ts** – MCP server for integration with MCP clients
- **routes/api.ts** – endpoints `GET /api/projects` and `POST /api/search`
- **utils/projects.ts** – reading project list from `SOURCES_DIR`
- **utils/cursor-agent.ts** – running cursor-agent in a given project
- **utils/stream-parser.ts** – parsing stream-json output from cursor-agent
- **frontend/** – React + Material UI application (Vite), builds to `frontend/dist`

## API

### REST API (for web interface)

- **GET /api/projects** – returns `{ projects: string[] }` (subdirectory names in `SOURCES_DIR`).
- **POST /api/search** – body `{ project: string, prompt: string }`, returns streamed result from cursor-agent.

### MCP Tools

- **`question`** – Parameters: `library` (string), `prompt` (string). Queries a specific library using cursor-agent. Automatically clones the library if not downloaded. Supports progress notifications during processing.
- **`list_libraries`** – Returns a list of all available libraries in JSON array format with objects `{ name: string, downloaded: boolean, url?: string }[]`.

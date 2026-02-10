import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import express from "express";
import { getPort } from "./config";
import { apiRouter } from "./routes/api";

// Load .env if present
dotenv.config({ path: path.join(process.cwd(), ".env") });

const PORT = getPort();
const staticRoot = path.join(process.cwd(), "frontend", "dist");

const app = express();

// API routes
app.use("/api", apiRouter);

// Static files from frontend/dist
app.use(express.static(staticRoot));

// SPA fallback – always serve index.html for non-API routes
app.get("*", (req, res) => {
	if (req.path.startsWith("/api")) {
		res.status(404).send("Not found");
		return;
	}

	const indexPath = path.join(staticRoot, "index.html");

	fs.access(indexPath, (err) => {
		if (err) {
			res
				.status(404)
				.send(
					"Not found. Build the frontend first: cd frontend && npm run build",
				);
			return;
		}

		res.sendFile(indexPath, (sendErr) => {
			if (sendErr) {
				res.status(500).send("Failed to serve index.html");
			}
		});
	});
});

app.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}`);
});

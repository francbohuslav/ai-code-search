import { Alert, Container, CssBaseline, Typography } from "@mui/material";
import React, { useState, useEffect } from "react";
import {
	type ProjectOption,
	type SearchResult,
	fetchProjects,
	runSearch,
} from "./api";
import { ResultDisplay } from "./components/ResultDisplay";
import { SearchForm } from "./components/SearchForm";

function App() {
	const [projects, setProjects] = useState<ProjectOption[]>([]);
	const [projectsError, setProjectsError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [statusLines, setStatusLines] = useState<
		{ text: string; elapsedSec: number }[]
	>([]);
	const [result, setResult] = useState<SearchResult | null>(null);
	const [searchError, setSearchError] = useState<string | null>(null);
	const startTimeRef = React.useRef<number>(0);

	useEffect(() => {
		fetchProjects()
			.then(setProjects)
			.catch((e) =>
				setProjectsError(
					e instanceof Error ? e.message : "Failed to load projects",
				),
			);
	}, []);

	const handleSubmit = async (project: string, prompt: string) => {
		setSearchError(null);
		setResult(null);
		setStatusLines([]);
		setLoading(true);
		startTimeRef.current = Date.now();
		try {
			const data = await runSearch(project, prompt, {
				onStatus: (status) => {
					const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
					setStatusLines((prev) => {
						if (
							prev[prev.length - 1]?.text === status &&
							status === "Thinking…"
						)
							return prev;
						return [...prev.slice(-2), { text: status, elapsedSec }];
					});
				},
				onResult: (markdown) => {
					setResult({ stdout: markdown, stderr: "", code: 0 });
				},
			});
			setResult(data);
		} catch (e) {
			setSearchError(e instanceof Error ? e.message : "Search failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<CssBaseline />
			<Container maxWidth="md" sx={{ py: 3 }}>
				<Typography variant="h5" component="h1" gutterBottom>
					Search in source code
				</Typography>
				{projectsError && (
					<Alert severity="error" sx={{ mb: 2 }}>
						{projectsError}
					</Alert>
				)}
				<SearchForm
					projects={projects}
					onSubmit={handleSubmit}
					disabled={loading || projects.length === 0}
				/>
				<ResultDisplay
					loading={loading}
					statusLines={statusLines}
					result={result}
					error={searchError}
				/>
			</Container>
		</>
	);
}

export default App;

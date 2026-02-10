import { Autocomplete, Box, Button, Divider, TextField } from "@mui/material";
import { useState } from "react";
import type { ProjectOption } from "../api";

interface SearchFormProps {
	projects: ProjectOption[];
	onSubmit: (project: string, prompt: string) => void;
	disabled?: boolean;
}

export function SearchForm({ projects, onSubmit, disabled }: SearchFormProps) {
	const [project, setProject] = useState<ProjectOption | null>(null);
	const [prompt, setPrompt] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const selected = project?.name?.trim();
		if (selected && prompt.trim()) {
			onSubmit(selected, prompt.trim());
		}
	};

	return (
		<Box
			component="form"
			onSubmit={handleSubmit}
			sx={{ display: "flex", flexDirection: "column", gap: 2 }}
		>
			<TextField
				label="Query"
				multiline
				minRows={3}
				value={prompt}
				onChange={(e) => setPrompt(e.target.value)}
				placeholder="Enter your query..."
				fullWidth
				required
				disabled={disabled}
			/>
			<Autocomplete
				options={projects}
				getOptionLabel={(option) => option.name}
				groupBy={(option) => (option.isLocal ? "Downloaded" : "Remote")}
				value={project}
				onChange={(_, value) => setProject(value)}
				fullWidth
				disabled={disabled}
				renderGroup={(params) => (
					<Box key={params.key}>
						{params.group === "Remote" && <Divider sx={{ my: 0.5 }} />}
						{params.children}
					</Box>
				)}
				renderInput={(params) => (
					<TextField {...params} label="Project" required />
				)}
			/>
			<Button
				type="submit"
				variant="contained"
				disabled={disabled || !project || !prompt.trim()}
			>
				Submit
			</Button>
		</Box>
	);
}

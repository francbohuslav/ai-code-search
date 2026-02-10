import { Alert, Box, CircularProgress, Paper, Typography } from "@mui/material";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import type { SearchResult } from "../api";

const CodeBlock: Components["code"] = ({
	node,
	className,
	children,
	...props
}) => {
	const match = /language-(\w+)/.exec(className ?? "");
	if (match) {
		return (
			<SyntaxHighlighter
				style={oneDark}
				language={match[1]}
				PreTag="div"
				customStyle={{ margin: 0, borderRadius: 4 }}
				codeTagProps={{
					style: { fontFamily: "monospace", fontSize: "0.85em" },
				}}
				showLineNumbers={false}
			>
				{String(children).replace(/\n$/, "")}
			</SyntaxHighlighter>
		);
	}
	return (
		<code className={className} {...props}>
			{children}
		</code>
	);
};

export interface StatusEntry {
	text: string;
	elapsedSec: number;
}

interface ResultDisplayProps {
	loading: boolean;
	statusLines?: StatusEntry[];
	result: SearchResult | null;
	error: string | null;
}

const markdownBoxSx = {
	fontSize: "0.875rem",
	"& pre": { overflow: "auto", maxHeight: 400 },
	"& code": { fontFamily: "monospace", fontSize: "0.85em" },
	"& p": { mt: 0, mb: 1 },
	"& p:last-child": { mb: 0 },
	"& ul, & ol": { pl: 2.5 },
	"& [class*='syntax-highlighter']": { borderRadius: 1 },
	"& table": { borderCollapse: "collapse" as const, width: "100%", mb: 1 },
	"& th, & td": {
		border: "1px solid",
		borderColor: "divider",
		px: 1.5,
		py: 0.75,
	},
	"& th": { bgcolor: "action.hover", fontWeight: 600 },
};

export function ResultDisplay({
	loading,
	statusLines = [],
	result,
	error,
}: ResultDisplayProps) {
	if (error) {
		return (
			<Alert severity="error" sx={{ mt: 2 }}>
				{error}
			</Alert>
		);
	}

	const hasStatus = statusLines.length > 0;
	const content = result?.stdout ?? "";
	const hasStderr = result && result.stderr.trim().length > 0;

	if (loading && !hasStatus && !content) {
		return (
			<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
				<CircularProgress />
			</Box>
		);
	}

	if (!hasStatus && !content && !result) {
		return null;
	}

	if (result && !content && !hasStderr) {
		return (
			<Typography color="text.secondary" sx={{ mt: 2 }}>
				No output (exit code: {result.code}).
			</Typography>
		);
	}

	return (
		<Box sx={{ mt: 2 }}>
			{content.length > 0 && (
				<Paper
					variant="outlined"
					sx={{ p: 2, mb: hasStatus ? 2 : hasStderr ? 2 : 0 }}
				>
					<Typography variant="subtitle2" color="text.secondary" gutterBottom>
						Result
					</Typography>
					<Box sx={markdownBoxSx}>
						<ReactMarkdown
							remarkPlugins={[remarkGfm]}
							components={{ code: CodeBlock }}
						>
							{content}
						</ReactMarkdown>
					</Box>
				</Paper>
			)}
			{hasStatus && (
				<Paper variant="outlined" sx={{ p: 2, mb: hasStderr ? 2 : 0 }}>
					<Typography
						variant="subtitle2"
						color="text.secondary"
						gutterBottom
						sx={{ display: "flex", alignItems: "center", gap: 1 }}
					>
						Progress
						{loading && (
							<>
								<CircularProgress size={14} />
								<Typography component="span" variant="caption">
									Running…
								</Typography>
							</>
						)}
					</Typography>
					<Box
						component="ul"
						sx={{
							m: 0,
							pl: 2.5,
							fontSize: "0.875rem",
							lineHeight: 1.4,
							maxHeight: "4.5em",
							overflow: "hidden",
							listStyle: "disc",
						}}
					>
						{statusLines.map((entry, i) => (
							<Box
								component="li"
								key={`${i}-${entry.elapsedSec}-${entry.text}`}
								sx={{ mb: 0.25 }}
							>
								<Typography
									component="span"
									variant="body2"
									color="text.secondary"
									sx={{ fontFamily: "monospace", mr: 1 }}
								>
									+{entry.elapsedSec.toFixed(1)} s
								</Typography>
								{entry.text}
							</Box>
						))}
					</Box>
				</Paper>
			)}
			{hasStderr && result && (
				<Paper variant="outlined" sx={{ p: 2 }}>
					<Typography variant="subtitle2" color="text.secondary" gutterBottom>
						Errors / stderr
					</Typography>
					<Box
						component="pre"
						sx={{
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
							fontFamily: "monospace",
							fontSize: "0.875rem",
							m: 0,
							overflow: "auto",
							maxHeight: 200,
							color: "error.main",
						}}
					>
						{result.stderr}
					</Box>
				</Paper>
			)}
		</Box>
	);
}

import { GithubConfig, GithubSaveResult } from '../types/types';
import { base64EncodeUnicode } from './file-utils';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Lightweight UI gate: token and repo are both non-empty.
 */
export function isGithubConfigured(config?: GithubConfig): boolean {
	return !!config?.token?.trim() && !!config?.repo?.trim();
}

/**
 * Full config validation. repo must be exactly "owner/repo" (two non-empty
 * segments), not a URL.
 */
export function validateGithubConfig(config?: GithubConfig): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	if (!config) {
		errors.push('Configuration is missing');
		return { valid: false, errors };
	}

	if (!config.token?.trim()) {
		errors.push('Personal Access Token is required');
	}

	const repo = config.repo?.trim() || '';
	if (!repo) {
		errors.push('Repository is required');
	} else if (repo.includes('://') || repo.startsWith('github.com')) {
		errors.push('Repository must be in "owner/repo" format, not a URL');
	} else {
		const parts = repo.split('/');
		if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
			errors.push('Repository must be in "owner/repo" format');
		}
	}

	return { valid: errors.length === 0, errors };
}

/**
 * Parse "owner/repo" into its parts. Returns null if malformed.
 */
function parseRepo(repo: string): { owner: string; name: string } | null {
	const parts = (repo || '').trim().split('/');
	if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
		return null;
	}
	return { owner: parts[0].trim(), name: parts[1].trim() };
}

/**
 * Encode a repository path segment-by-segment, preserving "/" separators.
 * Never use encodeURIComponent on the whole path (it would encode "/").
 */
function encodeGithubPath(path: string): string {
	return path.split('/').map(seg => encodeURIComponent(seg)).join('/');
}

/**
 * Extract a human-readable error message from a GitHub API response,
 * tolerating non-JSON bodies (proxies, rate limiters, CORS layers).
 */
async function readGithubError(response: Response): Promise<string> {
	try {
		const json = await response.json();
		return json?.message || response.statusText || `HTTP ${response.status}`;
	} catch {
		return response.statusText || `HTTP ${response.status}`;
	}
}

function githubHeaders(token: string): Record<string, string> {
	return {
		'Authorization': `Bearer ${token}`,
		'Accept': 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28'
	};
}

/**
 * Commit markdown content to GitHub via the Contents API.
 * Never throws — all errors are wrapped in GithubSaveResult { success: false, error }.
 *
 * If the file already exists, its sha is fetched first and included so the PUT
 * updates (overwrites) it instead of failing with 422.
 */
export async function saveToGithub(
	content: string,
	path: string,
	config: GithubConfig
): Promise<GithubSaveResult> {
	try {
		const validation = validateGithubConfig(config);
		if (!validation.valid) {
			return { success: false, error: validation.errors.join(', ') };
		}

		const parsed = parseRepo(config.repo);
		if (!parsed) {
			return { success: false, error: 'Invalid repository format' };
		}

		const encodedPath = encodeGithubPath(path);
		const contentsUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}/contents/${encodedPath}`;
		const headers = githubHeaders(config.token);

		// 1. Fetch existing sha (if any) to allow overwrite.
		let existingSha: string | undefined;
		const getResponse = await fetch(contentsUrl, { method: 'GET', headers });
		if (getResponse.ok) {
			try {
				const existing = await getResponse.json();
				existingSha = existing?.sha;
			} catch {
				// Ignore parse errors; treat as new file.
			}
		} else if (getResponse.status !== 404) {
			// 404 = new file (expected). Anything else is a real error.
			return { success: false, error: await readGithubError(getResponse) };
		}

		// 2. PUT create/update.
		const fileName = path.split('/').pop() || path;
		const body: Record<string, string> = {
			message: `Save clipped note: ${fileName}`,
			content: base64EncodeUnicode(content)
		};
		if (existingSha) {
			body.sha = existingSha;
		}

		const putResponse = await fetch(contentsUrl, {
			method: 'PUT',
			headers,
			body: JSON.stringify(body)
		});

		if (!putResponse.ok) {
			const error = await readGithubError(putResponse);
			console.warn('[GitHub Save] PUT failed:', putResponse.status, error);
			return { success: false, error: `HTTP ${putResponse.status}: ${error}` };
		}

		let url: string | undefined;
		try {
			const json = await putResponse.json();
			url = json?.content?.html_url;
		} catch {
			// Success regardless of parseable URL.
		}

		console.log('[GitHub Save] Saved:', path);
		return { success: true, url };

	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn('[GitHub Save] failed:', message);
		return { success: false, error: message };
	}
}

/**
 * Test the GitHub configuration by fetching repo metadata.
 * Never throws. Confirms the repo is accessible and (best-effort) writable.
 */
export async function testGithubConnection(
	config: GithubConfig
): Promise<{ success: boolean; error?: string }> {
	try {
		const validation = validateGithubConfig(config);
		if (!validation.valid) {
			return { success: false, error: validation.errors.join(', ') };
		}

		const parsed = parseRepo(config.repo);
		if (!parsed) {
			return { success: false, error: 'Invalid repository format' };
		}

		const repoUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}`;
		const response = await fetch(repoUrl, { method: 'GET', headers: githubHeaders(config.token) });

		if (response.status === 401) {
			return { success: false, error: 'Invalid token' };
		}
		if (response.status === 404) {
			return { success: false, error: 'Repository not found or no access' };
		}
		if (response.status === 403) {
			return { success: false, error: 'Access forbidden or rate limited' };
		}
		if (!response.ok) {
			return { success: false, error: await readGithubError(response) };
		}

		let permissions: { push?: boolean } | undefined;
		try {
			const json = await response.json();
			permissions = json?.permissions;
		} catch {
			// Ignore; treat as unconfirmed write permission.
		}

		if (permissions && permissions.push === false) {
			return { success: false, error: 'Token lacks write access to this repository' };
		}
		if (!permissions || permissions.push === undefined) {
			// Repo reachable but write permission not confirmable (some fine-grained PATs).
			return {
				success: true,
				error: 'Repository accessible, but write permission could not be confirmed; final write is verified on save.'
			};
		}

		return { success: true };

	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { success: false, error: message };
	}
}

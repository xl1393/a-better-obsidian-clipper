import { generalSettings, saveSettings } from '../utils/storage-utils';
import { testGithubConnection } from '../utils/github-uploader';
import { getMessage } from '../utils/i18n';
import { debounce } from '../utils/debounce';

function initializeTextInput(
	inputId: string,
	settingKey: 'token' | 'repo',
	debounceMs: number = 500
): void {
	const input = document.getElementById(inputId) as HTMLInputElement;
	if (!input) return;

	input.value = generalSettings.githubConfig[settingKey];

	const debouncedSave = debounce(async (value: string) => {
		generalSettings.githubConfig[settingKey] = value;
		await saveSettings();
	}, debounceMs);

	input.addEventListener('input', () => {
		debouncedSave(input.value);
	});
}

async function handleTestConnection(): Promise<void> {
	const button = document.getElementById('github-test-connection') as HTMLButtonElement;
	const resultSpan = document.getElementById('github-test-result') as HTMLSpanElement;

	if (!button || !resultSpan) return;

	button.disabled = true;
	button.textContent = getMessage('githubTesting');
	resultSpan.textContent = '';
	resultSpan.style.color = '';

	try {
		const result = await testGithubConnection(generalSettings.githubConfig);

		if (result.success) {
			// success may still carry a soft warning (write permission unconfirmed)
			resultSpan.textContent = result.error || getMessage('githubTestSuccess');
			resultSpan.style.color = result.error ? 'var(--text-warning, var(--text-accent))' : 'var(--text-success)';
		} else {
			resultSpan.textContent = getMessage('githubTestFailed', [result.error || 'Unknown error']);
			resultSpan.style.color = 'var(--text-error)';
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		resultSpan.textContent = getMessage('githubTestFailed', [message]);
		resultSpan.style.color = 'var(--text-error)';
	} finally {
		button.disabled = false;
		button.textContent = getMessage('githubTestConnection');
	}
}

export async function initializeGithubSettings(): Promise<void> {
	initializeTextInput('github-token', 'token');
	initializeTextInput('github-repo', 'repo');

	const testButton = document.getElementById('github-test-connection');
	if (testButton) {
		testButton.addEventListener('click', handleTestConnection);
	}
}

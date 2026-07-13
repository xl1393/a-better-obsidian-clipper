import { generalSettings, saveSettings } from '../utils/storage-utils';
import { testR2Connection } from '../utils/r2-config';
import { getMessage } from '../utils/i18n';
import { debounce } from '../utils/debounce';

function initializeSettingToggle(
	inputId: string,
	settingKey: 'enabled',
	onChange?: (value: boolean) => void
): void {
	const input = document.getElementById(inputId) as HTMLInputElement;
	if (!input) return;

	input.checked = generalSettings.r2Config[settingKey];

	input.addEventListener('change', async () => {
		generalSettings.r2Config[settingKey] = input.checked;
		await saveSettings();
		onChange?.(input.checked);
	});
}

function initializeTextInput(
	inputId: string,
	settingKey: 'accountId' | 'accessKeyId' | 'secretAccessKey' | 'bucketName' | 'publicBaseUrl',
	debounceMs: number = 500
): void {
	const input = document.getElementById(inputId) as HTMLInputElement;
	if (!input) return;

	input.value = generalSettings.r2Config[settingKey];

	const debouncedSave = debounce(async (value: string) => {
		generalSettings.r2Config[settingKey] = value;
		await saveSettings();
	}, debounceMs);

	input.addEventListener('input', () => {
		debouncedSave(input.value);
	});
}

async function handleTestConnection(): Promise<void> {
	const button = document.getElementById('r2-test-connection') as HTMLButtonElement;
	const resultSpan = document.getElementById('r2-test-result') as HTMLSpanElement;

	if (!button || !resultSpan) return;

	// Update button state
	button.disabled = true;
	button.textContent = getMessage('r2Testing');
	resultSpan.textContent = '';
	resultSpan.style.color = '';

	try {
		const result = await testR2Connection(generalSettings.r2Config);

		if (result.success) {
			resultSpan.textContent = getMessage('r2TestSuccess');
			resultSpan.style.color = 'var(--text-success)';
		} else {
			resultSpan.textContent = getMessage('r2TestFailed', [result.error || 'Unknown error']);
			resultSpan.style.color = 'var(--text-error)';
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		resultSpan.textContent = getMessage('r2TestFailed', [message]);
		resultSpan.style.color = 'var(--text-error)';
	} finally {
		button.disabled = false;
		button.textContent = getMessage('r2TestConnection');
	}
}

export async function initializeR2Settings(): Promise<void> {
	// Initialize enable toggle (no debounce)
	initializeSettingToggle('r2-enabled', 'enabled');

	// Initialize text inputs with debounced auto-save
	initializeTextInput('r2-account-id', 'accountId');
	initializeTextInput('r2-access-key-id', 'accessKeyId');
	initializeTextInput('r2-secret-access-key', 'secretAccessKey');
	initializeTextInput('r2-bucket-name', 'bucketName');
	initializeTextInput('r2-public-base-url', 'publicBaseUrl');

	// Initialize test connection button
	const testButton = document.getElementById('r2-test-connection');
	if (testButton) {
		testButton.addEventListener('click', handleTestConnection);
	}
}

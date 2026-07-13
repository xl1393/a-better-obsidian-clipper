import { createIcons } from 'lucide';
import { icons } from '../icons/icons';
import { copyToClipboard } from './clipboard-utils';
import { getMessage } from './i18n';

/**
 * Attaches a "copy to clipboard" button next to a text/password input.
 *
 * Works for masked inputs (type="password") because the value is read from the
 * input's `value` property in JS, which holds the plaintext regardless of how
 * the field is rendered on screen.
 *
 * The input and button are wrapped in a flex container so they sit side by side.
 * Safe to call multiple times — it will not add a second button to the same input.
 *
 * @param inputId - The id of the input element to augment.
 */
export function attachCopyButton(inputId: string): void {
	const input = document.getElementById(inputId) as HTMLInputElement | null;
	if (!input) return;

	// Avoid double-initialization (e.g. if settings are re-rendered).
	if (input.parentElement?.classList.contains('input-with-copy')) return;

	const wrapper = document.createElement('div');
	wrapper.className = 'input-with-copy';

	// Insert the wrapper where the input currently is, then move the input inside.
	input.parentElement?.insertBefore(wrapper, input);
	wrapper.appendChild(input);

	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'clickable-icon copy-input-button';
	button.setAttribute('aria-label', getMessage('copyToClipboard'));
	button.setAttribute('title', getMessage('copyToClipboard'));

	const iconEl = document.createElement('i');
	iconEl.setAttribute('data-lucide', 'copy');
	button.appendChild(iconEl);

	wrapper.appendChild(button);

	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	button.addEventListener('click', async () => {
		const value = input.value;
		if (!value) return;

		const ok = await copyToClipboard(value);
		if (!ok) return;

		button.classList.add('is-copied');
		button.setAttribute('aria-label', getMessage('copied'));
		button.setAttribute('title', getMessage('copied'));
		setButtonIcon(button, 'check');

		if (resetTimer) clearTimeout(resetTimer);
		resetTimer = setTimeout(() => {
			button.classList.remove('is-copied');
			button.setAttribute('aria-label', getMessage('copyToClipboard'));
			button.setAttribute('title', getMessage('copyToClipboard'));
			setButtonIcon(button, 'copy');
		}, 1500);
	});

	// Render the lucide icon for the freshly created element.
	createIcons({ icons });
}

function setButtonIcon(button: HTMLElement, iconName: string): void {
	button.textContent = '';
	const iconEl = document.createElement('i');
	iconEl.setAttribute('data-lucide', iconName);
	button.appendChild(iconEl);
	createIcons({ icons });
}

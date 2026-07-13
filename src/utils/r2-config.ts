import { R2Config } from '../types/types';
import { uploadImageToR2 } from './r2-uploader';

/**
 * Validate R2 configuration completeness.
 * Checks all required fields.
 */
export function validateR2Config(config?: R2Config): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	if (!config) {
		errors.push('Configuration is missing');
		return { valid: false, errors };
	}

	if (!config.accountId?.trim()) {
		errors.push('Account ID is required');
	}
	if (!config.accessKeyId?.trim()) {
		errors.push('Access Key ID is required');
	}
	if (!config.secretAccessKey?.trim()) {
		errors.push('Secret Access Key is required');
	}
	if (!config.bucketName?.trim()) {
		errors.push('Bucket Name is required');
	}
	if (!config.publicBaseUrl?.trim()) {
		errors.push('Public Base URL is required');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Check if R2 upload is enabled (lightweight check).
 * Only checks the enabled flag and config existence.
 */
export function isR2Enabled(config?: R2Config): boolean {
	return config?.enabled === true;
}

/**
 * Test R2 connection by uploading a small test file.
 * Uploads a 1x1 transparent PNG and verifies both upload and public access.
 */
export async function testR2Connection(
	config: R2Config
): Promise<{ success: boolean; error?: string }> {
	try {
		// Validate config first
		const validation = validateR2Config(config);
		if (!validation.valid) {
			return { success: false, error: validation.errors.join(', ') };
		}

		// Generate 1x1 transparent PNG (67 bytes)
		const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
		const testImageData = Uint8Array.from(atob(testImageBase64), c => c.charCodeAt(0));

		// Create a data URL for the test image
		const blob = new Blob([testImageData], { type: 'image/png' });
		const testImageUrl = URL.createObjectURL(blob);

		try {
			// Upload test file
			const result = await uploadImageToR2(testImageUrl, config);

			// Clean up object URL
			URL.revokeObjectURL(testImageUrl);

			if (!result.success) {
				return { success: false, error: result.error || 'Upload failed' };
			}

			// Verify public access by fetching the uploaded file
			if (result.url) {
				try {
					const verifyResponse = await fetch(result.url, { method: 'HEAD' });
					if (!verifyResponse.ok) {
						return {
							success: false,
							error: `Upload succeeded but public access failed (HTTP ${verifyResponse.status}). Check Public Base URL or bucket public access settings.`
						};
					}
				} catch (fetchError) {
					return {
						success: false,
						error: `Upload succeeded but public access verification failed. Check Public Base URL or bucket public access settings.`
					};
				}
			}

			return { success: true };
		} catch (error) {
			URL.revokeObjectURL(testImageUrl);
			throw error;
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { success: false, error: message };
	}
}

import { R2Config, R2UploadResult } from '../types/types';
import { validateR2Config } from './r2-config';
import { withReferer } from './referer-spoof';

const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB
const DOWNLOAD_TIMEOUT_MS = 10000; // 10 seconds
const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico'];

interface DownloadResult {
	data: ArrayBuffer;
	contentType: string;
}

/**
 * Download image from URL using Chrome native fetch.
 * Returns ArrayBuffer and Content-Type.
 *
 * `referer` (optional) is applied via a declarativeNetRequest session rule to
 * bypass hotlink protection on CDNs that check the Referer header.
 */
export async function downloadImage(url: string, referer?: string): Promise<DownloadResult> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

	try {
		const doFetch = () => fetch(url, { signal: controller.signal });
		const response = referer
			? await withReferer(referer, doFetch)
			: await doFetch();
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const contentType = response.headers.get('content-type') || '';
		if (!contentType.startsWith('image/')) {
			throw new Error(`Not an image: ${contentType}`);
		}

		const data = await response.arrayBuffer();
		if (data.byteLength > MAX_IMAGE_BYTES) {
			throw new Error(`Image too large: ${data.byteLength} bytes`);
		}

		return { data, contentType };
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Generate AWS Signature V4 headers for R2 PUT request.
 * Must be async because crypto.subtle operations return Promises.
 */
export async function signRequestV4(
	method: string,
	url: URL,
	payload: ArrayBuffer,
	contentType: string,
	creds: {
		accessKeyId: string;
		secretAccessKey: string;
		region: string;
		service: string;
	}
): Promise<Record<string, string>> {
	const encoder = new TextEncoder();
	const now = new Date();
	const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
	const dateStamp = amzDate.slice(0, 8);

	// Compute payload hash
	const payloadHashBuffer = await crypto.subtle.digest('SHA-256', payload);
	const payloadHash = Array.from(new Uint8Array(payloadHashBuffer))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');

	// Canonical request
	const canonicalUri = url.pathname;
	const canonicalQueryString = '';
	const canonicalHeaders = [
		`content-type:${contentType}`,
		`host:${url.host}`,
		`x-amz-content-sha256:${payloadHash}`,
		`x-amz-date:${amzDate}`
	].join('\n') + '\n';
	const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

	const canonicalRequest = [
		method,
		canonicalUri,
		canonicalQueryString,
		canonicalHeaders,
		signedHeaders,
		payloadHash
	].join('\n');

	// String to sign
	const credentialScope = `${dateStamp}/${creds.region}/${creds.service}/aws4_request`;
	const canonicalRequestHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest));
	const canonicalRequestHash = Array.from(new Uint8Array(canonicalRequestHashBuffer))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');

	const stringToSign = [
		'AWS4-HMAC-SHA256',
		amzDate,
		credentialScope,
		canonicalRequestHash
	].join('\n');

	// Calculate signature using HMAC-SHA256 chain
	const kDate = await hmacSha256(encoder.encode('AWS4' + creds.secretAccessKey), encoder.encode(dateStamp));
	const kRegion = await hmacSha256(kDate, encoder.encode(creds.region));
	const kService = await hmacSha256(kRegion, encoder.encode(creds.service));
	const kSigning = await hmacSha256(kService, encoder.encode('aws4_request'));
	const signatureBuffer = await hmacSha256(kSigning, encoder.encode(stringToSign));
	const signature = Array.from(new Uint8Array(signatureBuffer))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');

	// Build Authorization header
	const authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

	return {
		'Authorization': authorization,
		'Host': url.host,
		'x-amz-date': amzDate,
		'x-amz-content-sha256': payloadHash,
		'Content-Type': contentType
	};
}

/**
 * HMAC-SHA256 helper using crypto.subtle (async).
 */
async function hmacSha256(key: ArrayBuffer, data: Uint8Array): Promise<ArrayBuffer> {
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		key,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return await crypto.subtle.sign('HMAC', cryptoKey, data);
}

/**
 * Infer file extension.
 * Prefers the actual Content-Type (the real bytes returned by the server),
 * falling back to the URL path extension, then a jpg default. This matters for
 * CDNs that transform images (e.g. `format=auto` / `format/webp`), where the URL
 * still ends in `.png`/`.jpg` but the delivered bytes are webp/avif.
 */
function inferExtension(imageUrl: string, contentType: string): string {
	// Map Content-Type to extension (authoritative — reflects actual bytes)
	const typeMap: Record<string, string> = {
		'image/jpeg': 'jpg',
		'image/jpg': 'jpg',
		'image/png': 'png',
		'image/gif': 'gif',
		'image/webp': 'webp',
		'image/avif': 'avif',
		'image/svg+xml': 'svg',
		'image/bmp': 'bmp',
		'image/x-icon': 'ico',
		'image/vnd.microsoft.icon': 'ico'
	};

	// Content-Type may include parameters, e.g. "image/webp; charset=binary".
	const normalizedType = contentType.toLowerCase().split(';')[0].trim();
	const typeExt = typeMap[normalizedType];
	if (typeExt) {
		return typeExt;
	}

	// Fall back to URL path extension
	try {
		const pathname = new URL(imageUrl).pathname;
		const match = pathname.match(/\.([a-z0-9]+)$/i);
		if (match) {
			const ext = match[1].toLowerCase();
			if (SUPPORTED_EXTENSIONS.includes(ext)) {
				return ext;
			}
		}
	} catch {
		// Invalid URL, fall through
	}

	return 'jpg'; // Default fallback
}

/**
 * Generate a UUID v4.
 */
function generateUUID(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

/**
 * Upload image to R2 bucket and return public URL.
 * Never throws — all errors are wrapped in R2UploadResult { success: false, error }.
 */
export async function uploadImageToR2(
	imageUrl: string,
	config: R2Config,
	referer?: string
): Promise<R2UploadResult> {
	try {
		// Validate config
		const validation = validateR2Config(config);
		if (!validation.valid) {
			return { success: false, error: validation.errors.join(', ') };
		}

		// Download image
		const { data, contentType } = await downloadImage(imageUrl, referer);

		// Generate UUID key with extension
		const extension = inferExtension(imageUrl, contentType);
		const key = `${generateUUID()}.${extension}`;

		// Construct S3 endpoint (path-style to avoid TLS issues with bucket names containing dots)
		const endpoint = new URL(
			`https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}/${key}`
		);

		// Sign request
		const headers = await signRequestV4(
			'PUT',
			endpoint,
			data,
			contentType,
			{
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey,
				region: 'auto',
				service: 's3'
			}
		);

		// Upload to R2
		const uploadResponse = await fetch(endpoint.href, {
			method: 'PUT',
			headers,
			body: data
		});

		if (!uploadResponse.ok) {
			const errorText = await uploadResponse.text().catch(() => '');
			console.warn('[R2 Uploader] Upload failed:', uploadResponse.status, errorText);
			return { success: false, error: `HTTP ${uploadResponse.status}` };
		}

		// Build public URL
		const publicUrl = `${config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
		console.log('[R2 Uploader] Upload successful:', publicUrl);
		return { success: true, url: publicUrl };

	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn('[R2 Uploader] Upload failed:', message);
		return { success: false, error: message };
	}
}

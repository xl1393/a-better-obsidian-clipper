import { generalSettings } from './storage-utils';
import { uploadImageToR2 } from './r2-uploader';
import { isR2Enabled } from './r2-config';

/**
 * Create imageProcessor hook for the cover image.
 * Returns undefined if R2 is disabled, otherwise returns a function that uploads images to R2.
 * The returned function never throws — it returns the uploaded URL or undefined on failure.
 *
 * `pageUrl` is used as the Referer when downloading images, to bypass hotlink
 * protection on CDNs that check the Referer header.
 */
export function createR2ImageProcessor(pageUrl?: string): ((imageUrl: string) => Promise<string | undefined>) | undefined {
	if (!isR2Enabled(generalSettings.r2Config)) {
		return undefined;
	}

	return async (imageUrl: string): Promise<string | undefined> => {
		const result = await uploadImageToR2(imageUrl, generalSettings.r2Config, pageUrl);
		return result.success ? result.url : undefined;
	};
}

// Max number of inline images uploaded concurrently. Keeps clip responsive on
// image-heavy pages instead of uploading strictly one-by-one.
const MAX_CONCURRENT_UPLOADS = 4;

/**
 * Determine whether an <img> src should be uploaded to R2.
 * Skips data URIs, blobs, and already-rewritten R2 URLs.
 */
function isUploadableImageUrl(src: string): boolean {
	if (!src) return false;
	const lower = src.toLowerCase();
	if (lower.startsWith('data:') || lower.startsWith('blob:')) return false;
	return lower.startsWith('http://') || lower.startsWith('https://');
}

/**
 * Upload all inline images referenced in an HTML string to R2 and rewrite their
 * src attributes to the R2 public URLs.
 *
 * - Deduplicates identical URLs (each unique URL uploaded once).
 * - Uploads with bounded concurrency to avoid blocking for minutes on image-heavy pages.
 * - Never throws. Images that fail to upload keep their original URL.
 *
 * `pageUrl` is used as the Referer when downloading images, to bypass hotlink
 * protection on CDNs that check the Referer header.
 *
 * Returns the (possibly) rewritten HTML. If R2 is disabled or there is nothing
 * to upload, returns the original HTML unchanged.
 */
export async function processContentImages(html: string, pageUrl?: string): Promise<string> {
	if (!isR2Enabled(generalSettings.r2Config) || !html) {
		return html;
	}

	let doc: Document;
	try {
		doc = new DOMParser().parseFromString(html, 'text/html');
	} catch {
		return html;
	}

	const imgElements = Array.from(doc.querySelectorAll('img'));
	if (imgElements.length === 0) {
		return html;
	}

	// Collect unique uploadable URLs.
	const uniqueUrls: string[] = [];
	const seen = new Set<string>();
	for (const img of imgElements) {
		const src = img.getAttribute('src') || '';
		if (isUploadableImageUrl(src) && !seen.has(src)) {
			seen.add(src);
			uniqueUrls.push(src);
		}
	}

	if (uniqueUrls.length === 0) {
		return html;
	}

	// Upload unique URLs with bounded concurrency, building an original -> R2 URL map.
	const urlMap = new Map<string, string>();
	let cursor = 0;

	async function worker(): Promise<void> {
		while (cursor < uniqueUrls.length) {
			const index = cursor++;
			const originalUrl = uniqueUrls[index];
			const result = await uploadImageToR2(originalUrl, generalSettings.r2Config, pageUrl);
			if (result.success && result.url) {
				urlMap.set(originalUrl, result.url);
			}
		}
	}

	const workerCount = Math.min(MAX_CONCURRENT_UPLOADS, uniqueUrls.length);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));

	if (urlMap.size === 0) {
		return html;
	}

	// Rewrite src attributes for every img whose URL was uploaded.
	// Also strip srcset/data-srcset: markdown conversion prefers srcset over src,
	// so leaving it in place would keep the original (non-R2) URL in the output.
	for (const img of imgElements) {
		const src = img.getAttribute('src') || '';
		const mapped = urlMap.get(src);
		if (mapped) {
			img.setAttribute('src', mapped);
			img.removeAttribute('srcset');
			img.removeAttribute('data-srcset');
		}
	}

	return doc.body.innerHTML;
}

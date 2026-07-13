// Some image CDNs (e.g. sspai) enforce hotlink protection by checking the
// Referer header and return 403 for requests that don't originate from their
// own site. Extension-initiated fetch() cannot set the Referer header directly
// (the browser overrides it), so we use declarativeNetRequest session rules to
// inject a Referer header for the duration of our downloads.

declare const chrome: any;

let ruleIdCounter = 90000;

/**
 * Run `fn` with a temporary declarativeNetRequest rule that sets the Referer
 * header (to `referer`) on the extension's own GET requests. The rule is
 * removed once `fn` settles.
 *
 * Falls back to running `fn` without any rule if declarativeNetRequest is
 * unavailable or the rule cannot be installed. Never throws on its own account.
 */
export async function withReferer<T>(referer: string, fn: () => Promise<T>): Promise<T> {
	const dnr = typeof chrome !== 'undefined' ? chrome?.declarativeNetRequest : undefined;

	if (!dnr?.updateSessionRules || !referer) {
		return fn();
	}

	const ruleId = ruleIdCounter++;

	try {
		await dnr.updateSessionRules({
			removeRuleIds: [ruleId],
			addRules: [{
				id: ruleId,
				priority: 1,
				action: {
					type: 'modifyHeaders',
					requestHeaders: [
						{ header: 'referer', operation: 'set', value: referer }
					]
				},
				condition: {
					// Only rewrite our own download requests (GET / xmlhttprequest),
					// never the signed R2 PUT upload.
					requestMethods: ['get'],
					resourceTypes: ['xmlhttprequest']
				}
			}]
		});
	} catch (error) {
		console.warn('[R2] Failed to install Referer rule, downloading without it:', error);
		return fn();
	}

	try {
		return await fn();
	} finally {
		try {
			await dnr.updateSessionRules({ removeRuleIds: [ruleId] });
		} catch (error) {
			console.warn('[R2] Failed to remove Referer rule:', error);
		}
	}
}

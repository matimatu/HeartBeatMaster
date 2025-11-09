/**
 * Query a remote PHP REST API for device ownership information.
 *
 * Inputs:
 *  - deviceIds: Array<string|number> - list of device IDs to check
 *  - timeoutMs: number (optional) - request timeout in milliseconds (default 5000ms)
 *
 * Output:
 *  - Object mapping deviceId -> { username: string|null, registered: boolean }
 *
 * Behavior/assumptions:
 *  - By default it POSTs JSON { device_ids: [...] } to options.url or process.env.DEVICE_API_URL
 *  - The API may respond with either:
 *      1) an object mapping deviceId -> username (or null)
 *      2) an array of objects [{ device_id, username }]
 *    This function normalizes those formats into the output shape above.
 *  - Uses global fetch where available
 */
const DEBUG = false;
export async function queryDeviceOwners(deviceIds, timeoutMs) {
	if (!Array.isArray(deviceIds)) {
		throw new TypeError('deviceIds must be an array');
	}

	if (deviceIds.length === 0) return {};
	if(timeoutMs == null || timeoutMs == 0) timeoutMs = 5000;
	const url = 'http://localhost/HeartBeatMaster/OnlineSite/API/device-registration-status.php';
	let fetchImpl = (typeof fetch !== 'undefined' ? fetch : null);

	if (!fetchImpl) {
		// try dynamic import of node-fetch
		try {
			// node-fetch v3 is ESM; dynamic import returns the module namespace
			const mod = await import('node-fetch');
			fetchImpl = mod.default || mod;
		} catch (e) {
			throw new Error('No fetch available. Please run on Node 18+ or install node-fetch and pass fetchImpl in options');
		}
	}

	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
	const signal = controller ? controller.signal : undefined;

	const body = JSON.stringify({ device_ids: deviceIds });
	const timer = controller
		? setTimeout(() => controller.abort(), timeoutMs)
		: null;

	let resp;
	if(DEBUG)
		console.log("Sending request to", url, "with body", body);
	try {
		resp = await fetchImpl(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			signal,
		});
	} catch (err) {
		if (err.name === 'AbortError') {
			throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
		}
		throw err;
	} finally {
		if (timer) clearTimeout(timer);
	}

	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		throw new Error(`API request failed: ${resp.status} ${resp.statusText} ${text}`);
	}

	let data;
	try {
		data = await resp.json();
	} catch (err) {
		const txt = await resp.text().catch(() => '');
		throw new Error('Failed to parse JSON from API response: ' + txt + "\n" + err.message);
	}

	// Normalize response into map: deviceId -> username|null
	const result = {};
	if(DEBUG)
		console.log("response raw json: ", data);
	if (data && typeof data === 'object' && !Array.isArray(data)) {
		// Handle the API response format: { success: true, data: { deviceId: { registered, user } } }
		const devices = data.data && typeof data.data === 'object' ? data.data : data;
		for (const id of deviceIds) {
			const key = String(id);
			//secure method to check key existence
			if (Object.prototype.hasOwnProperty.call(devices, key)) {
				const deviceData = devices[key];
				const userData = deviceData.user || null;
				result[key] = {
					username: userData ? `${userData.nome} ${userData.cognome}` : null,
					registered: deviceData.registered,
					userData: userData  // optional: include full user data if needed
				};
			} else {
				result[key] = { username: null, registered: false, userData: null };
			}
		}
		return result;
	}
	if (Array.isArray(data)) {
		/* 
		 Expect an array response, commonly one of these shapes:
		   - [{ device_id, username }]          // snake_case keys from some PHP APIs
		   - [{ deviceId, username }]           // camelCase keys from JS-style APIs
		   - [{ id, username }]                 // generic id field
		   - [{ device, username }]             // other variants
		   - items may omit username (null) for unregistered devices
		   - items may be null/undefined in the array (skip those)
		*/
		const map = {};
		for (const item of data) {
			if (!item) continue;

			// accept multiple possible identifier names; prefer the first defined
			// note: use nullish coalescing so zero-string or 0 are treated as valid ids
			const id = item.device_id ?? item.deviceId ?? item.id ?? item.device;
			// if no recognizable id field, skip this item
			if (id == null) continue;

			// normalize id to string for consistent lookup keys
			// preserve username as-is; could be null to indicate "no user"
			map[String(id)] = item.username == null ? null : item.username;
		}

		// Now ensure every requested deviceId has a result entry:
		// - username: the value from the map or null if missing
		// - registered: true when username is present (non-null), false otherwise
		// Use hasOwnProperty to avoid picking up prototype properties.
		for (const id of deviceIds) {
			const key = String(id);
			const username = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
			result[key] = { username, registered: username != null };
		}
		return result;
	}
	throw new Error('Unexpected API response format: ' + JSON.stringify(data));
}

export default queryDeviceOwners;


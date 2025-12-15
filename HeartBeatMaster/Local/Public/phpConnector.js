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
const DEBUG = true;
export async function queryDeviceOwners(deviceIds, timeoutMs) {
	if (!Array.isArray(deviceIds)) {
		throw new TypeError('deviceIds must be an array');
	}

	if (deviceIds.length === 0) return {};
	if (timeoutMs == null || timeoutMs == 0) timeoutMs = 5000;
	const url = 'http://localhost/HeartBeatMaster/OnlineSite/API/device-registration-status.php';
	let fetchImpl = (typeof fetch !== 'undefined' ? fetch : null);

	if (!fetchImpl) {
		// try dynamic import of node-fetch
		try {
			// node-fetch v3 is ESM; dynamic import returns the module namespace
			const mod = await import('node-fetch');
			fetchImpl = mod.default || mod;
		} catch (e) {
			throw new Error('phpConnector-> No fetch available. Please run on Node 18+ or install node-fetch and pass fetchImpl in options');
		}
	}

	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
	const signal = controller ? controller.signal : undefined;

	const body = JSON.stringify({ device_ids: deviceIds });
	const timer = controller
		? setTimeout(() => controller.abort(), timeoutMs)
		: null;

	let resp;
	if (DEBUG)
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
			throw new Error(`phpConnector-> Request to ${url} timed out after ${timeoutMs}ms`);
		}
		throw err;
	} finally {
		if (timer) clearTimeout(timer);
	}

	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		throw new Error(`phpConnector-> API request failed: ${resp.status} ${resp.statusText} ${text}`);
	}

	let data;
	try {
		data = await resp.json();
	} catch (err) {
		const txt = await resp.text().catch(() => '');
		throw new Error('phpConnector-> Failed to parse JSON from API response: ' + txt + "\n" + err.message);
	}

	// Normalize response into map: deviceId -> username|null
	const result = {};
	if (DEBUG)
		console.log("phpConnector-> response raw json: ", data);
	if (data && typeof data === 'object' && !Array.isArray(data)) {
		// Handle the API response format: { success: true, data: { deviceId: { registered,isDirectAttach, user } } }
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
					isDirectAttach: deviceData.direct_attach,
					userData: userData  // optional: include full user data if needed
				};
			} else {
				result[key] = { username: null, registered: false,isDirectAttach: false, userData: null };
			}
		}
		if(DEBUG) console.log("phpConnector-> result",result);
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
			result[key] = { username, registered: username != null};
		}
		return result;
	}
	throw new Error('phpConnector-> Unexpected API response format: ' + JSON.stringify(data));
}

export async function registerNewDevice(deviceId, mail, password, weight, height, timeoutMs) {
	// Validate input types
	if (deviceId == null) throw new TypeError("phpConnector-> deviceId must be provided");
	if (mail == null) throw new TypeError("phpConnector-> mail must be provided");
	if (password == null) throw new TypeError("phpConnector-> password must be provided");
	if (weight == null) throw new TypeError("phpConnector-> weight must be provided");
	if (height == null) throw new TypeError("phpConnector-> height must be provided");

	if (timeoutMs == null || timeoutMs === 0) timeoutMs = 5000;

	const url = 'http://localhost/HeartBeatMaster/OnlineSite/API/device-registration.php';

	// Determine available fetch implementation (Browser fetch or node-fetch)
	let fetchImpl = (typeof fetch !== 'undefined' ? fetch : null);
	if (!fetchImpl) {
		try {
			// Dynamic import for node-fetch (ES module)
			const mod = await import('node-fetch');
			fetchImpl = mod.default || mod;
		} catch (err) {
			throw new Error('phpConnector-> No fetch available. Use Node 18+ or install node-fetch.');
		}
	}

	// Setup AbortController to handle timeout
	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
	const signal = controller ? controller.signal : undefined;

	// Build the JSON payload for the API
	//TODO add isDirectAttach
	const body = JSON.stringify({
		device_id: deviceId,
		mail,
		password,
		weight,
		height
	});

	// Start timeout timer if AbortController is supported
	const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

	let resp;
	try {
		// Perform the POST request
		resp = await fetchImpl(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			signal
		});
	} catch (err) {
		// Distinguish between timeout vs other fetch errors
		if (err.name === 'AbortError') {
			throw new Error(`phpConnector-> Request to ${url} timed out after ${timeoutMs}ms`);
		}
		throw err;
	} finally {
		// Always clear the timeout timer
		if (timer) clearTimeout(timer);
	}

	// Handle HTTP errors
	if (!resp.ok) {
		// Case 404 → NOT AN ERROR for this API → return structured result
		if (resp.status === 404) {
			return {
				success: false,
				message: "User not found... retry!",
				data: null,
				httpStatus: 404
			};
		}

		// Other error codes → throw
		const text = await resp.text().catch(() => '');
		throw new Error(`phpConnector-> API request failed: ${resp.status} ${resp.statusText} ${text}`);
	}

	// Parse JSON response with fallback to text on failure
	let data;
	try {
		data = await resp.json();
	} catch (err) {
		const txt = await resp.text().catch(() => '');
		throw new Error('phpConnector-> Failed to parse JSON from API response: ' + txt + "\n" + err.message);
	}

	/*
	   Expected API response formats typically look like:

	   {
		 "success": true,
		 "message": "...",
		 "data": { ... }   // optional
	   }

	   This function normalizes the result and returns an object:
	   {
		 success: boolean,
		 message: string|null,
		 data: object|null
	   }
	*/

	// Normalize the response
	let result = {
		success: false,
		message: null,
		data: null
	};

	if (data && typeof data === 'object') {
		// Extract common API fields
		result.success = Boolean(data.success);
		result.message = data.message ?? null;
		result.data = data.data ?? null;
	} else {
		throw new Error('phpConnector-> Unexpected API response format: ' + JSON.stringify(data));
	}

	return result;
}

/**
 * Save workout data to the remote PHP API
 * 
 * Parameters:
 *  - jsonData: Array of device workout data (e.g., from devicesData.json)
 *  - startDate: ISO 8601 or MySQL datetime string (e.g., "2025-12-07 10:00:00")
 *  - endDate: ISO 8601 or MySQL datetime string (e.g., "2025-12-07 11:00:00")
 *  - intervalDuration: Number - duration of each measurement interval in seconds
 *  - workoutType: String - name of workout type (must exist in database)
 * 
 * Returns: boolean (true if successful, false if failed)
 */
export async function saveWorkoutData(jsonData, startDate, endDate, intervalDuration, workoutType) {
	// --- Input Validation ---
	if (jsonData == null) {
		console.error('phpConnector-> jsonData is required');
		return false;
	}

	if (!Array.isArray(jsonData)) {
		console.error('phpConnector-> jsonData must be an array');
		return false;
	}

	if (jsonData.length === 0) {
		console.error('phpConnector-> jsonData array is empty');
		return false;
	}

	if(startDate != null)	{
		if(typeof startDate === 'string') {
			if (startDate.trim() === '') {
				console.error('phpConnector-> startDate must be a non-empty string: ');
				return false;
			}
			const tmp = new Date(startDate);
			startDate = tmp.toMySQLLocalDateTime();
		}
		else{
			startDate = toMySQLLocalDateTime(startDate);
		}
	}
	else{
		console.error('phpConnector-> startDate is null');
		return false;
	}
	startDate = checkAndFormatDate(startDate);
	endDate = 	checkAndFormatDate(endDate);

	if (intervalDuration == null || !Number.isInteger(Number(intervalDuration)) || Number(intervalDuration) <= 0) {
		console.error('phpConnector-> intervalDuration must be a positive integer');
		return false;
	}

	if (workoutType == null || typeof workoutType !== 'string' || workoutType.trim() === '') {
		console.error('phpConnector-> workoutType must be a non-empty string');
		return false;
	}
	
	const url = 'http://localhost/HeartBeatMaster/OnlineSite/API/save-workout-data.php';
	const timeoutMs = 8000;

	// Select fetch implementation (browser or node-fetch)
	let fetchImpl = (typeof fetch !== 'undefined' ? fetch : null);
	if (!fetchImpl) {
		try {
			const mod = await import('node-fetch');
			fetchImpl = mod.default || mod;
		} catch (err) {
			console.error('phpConnector-> No fetch available. Please run on Node 18+ or install node-fetch');
			return false;
		}
	}

	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
	const signal = controller ? controller.signal : undefined;

	// Build request payload matching API expectations
	const body = JSON.stringify({
		workout_data: jsonData,
		start_date: startDate.trim(),
		end_date: endDate.trim(),
		interval_duration: parseInt(intervalDuration, 10),
		workout_type: workoutType.trim()
	});

	const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

	let resp;
	try {
		if (DEBUG) console.log('phpConnector-> POST', url, 'with body:', JSON.parse(body), "\n");
		resp = await fetchImpl(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			signal,
		});
	} catch (err) {
		if (err.name === 'AbortError') {
			console.error(`phpConnector-> request to ${url} timed out after ${timeoutMs}ms`);
			return false;
		}
		console.error('phpConnector-> fetch error:', err.message);
		return false;
	} finally {
		if (timer) clearTimeout(timer);
	}

	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		console.error(`phpConnector-> API returned ${resp.status} ${resp.statusText}: ${text}`);
		return false;
	}

	// Parse JSON response
	try {
		const data = await resp.json().catch(() => null);
		if (DEBUG) console.log('phpConnector-> response:', data);

		// API response format: { success: boolean, message: string, workoutId: number, deviceCount: number }
		if (data && typeof data === 'object') {
			if (typeof data.success === 'boolean') {
				if (data.success) {
					if(DEBUG) console.log(`phpConnector-> Success! Saved workout ${data.workoutId} with ${data.deviceCount} devices`);
					
					return true;
				} else {
					console.error('phpConnector-> API returned error:', data.error || data.message);
					return false;
				}
			}
		}

		console.error('phpConnector-> Unexpected API response format');
		return false;
	} catch (err) {
		console.error('phpConnector-> failed parsing response:', err.message);
		return false;
	}
}

function checkAndFormatDate(date){
if(date != null)	{
		if(typeof date === 'string') {
			if (date.trim() === '') {
				console.error('phpConnector-> date must be a non-empty string: ');
				return null;
			}
			const tmp = new Date(date);
			date = toMySQLLocalDateTime(tmp);
		}
		else {
			date = toMySQLLocalDateTime(date);
		}
	}
	else{
		console.error('phpConnector-> date is null');
		return null;
	}
	return date;
}

function toMySQLLocalDateTime(date) {
    const pad = n => n < 10 ? '0' + n : n;

    return date.getFullYear() + '-' +
        pad(date.getMonth() + 1) + '-' +
        pad(date.getDate()) + ' ' +
        pad(date.getHours()) + ':' +
        pad(date.getMinutes()) + ':' +
        pad(date.getSeconds());
}

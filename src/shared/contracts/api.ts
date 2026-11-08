// Public URL layout of the HTTP API, shared by the server and the browser SDK.
export const API_PREFIX = 'api';
export const API_VERSION = '1';
/** Base path of every versioned route, e.g. `/api/v1/account/history`. Health probes are excluded. */
export const API_BASE_PATH = `/${API_PREFIX}/v${API_VERSION}`;

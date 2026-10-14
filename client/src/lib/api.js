const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
let currentCsrfToken = null;
export function setCsrfToken(token) {
    currentCsrfToken = token;
}
export function getCsrfToken() {
    return currentCsrfToken;
}
export class ApiError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
export async function apiFetch(path, init = {}) {
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type') && init.body) {
        headers.set('Content-Type', 'application/json');
    }
    if (currentCsrfToken) {
        headers.set('X-CSRF-Token', currentCsrfToken);
    }
    const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
        credentials: 'include',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
    }
    return data;
}
export function getApiBaseUrl() {
    return API_BASE;
}

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export const getAuthToken = async (): Promise<string> => localStorage.getItem('prashn_auth_token') || '';
export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem('prashn_auth_token', token);
  else localStorage.removeItem('prashn_auth_token');
}
export async function apiResponse(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const token = await getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && token && !endpoint.startsWith('/auth/')) {
      setAuthToken(null);
      window.dispatchEvent(new Event('prashn-session-expired'));
    }
    throw new ApiError(body.error || `Request failed (${response.status})`, response.status);
  }
  return response;
}
export const apiClient = async (endpoint: string, options: RequestInit = {}) => (await apiResponse(endpoint, options)).json();

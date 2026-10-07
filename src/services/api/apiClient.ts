const API_BASE_URL = 'http://localhost:5000/api';

const TOKEN_KEY = 'docflow_auth_token';

let token = localStorage.getItem(TOKEN_KEY);

export async function getAuthToken(): Promise<string> {
  if (token) return token;

  // Auto-login or register logic for local development
  try {
    const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
    });

    if (loginRes.ok) {
      const data = await loginRes.json();
      token = data.token;
      localStorage.setItem(TOKEN_KEY, data.token);
      return data.token;
    } else if (loginRes.status === 401) {
      // Register
      const regRes = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123', fullName: 'Test User' })
      });
      if (regRes.ok) {
        const loginRetry = await fetch(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
        });
        const data = await loginRetry.json();
        token = data.token;
        localStorage.setItem(TOKEN_KEY, data.token);
        return data.token;
      }
    }
  } catch (error) {
    console.error('Auth auto-setup failed:', error);
  }
  
  return '';
}

export async function apiClient(endpoint: string, options: RequestInit = {}) {
  const currentToken = await getAuthToken();
  
  const headers: HeadersInit = {
    ...options.headers,
  };

  if (currentToken) {
    (headers as any)['Authorization'] = `Bearer ${currentToken}`;
  }
  
  if (!(options.body instanceof FormData)) {
    (headers as any)['Content-Type'] = (headers as any)['Content-Type'] || 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

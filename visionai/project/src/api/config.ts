/**
 * config.ts
 * ---------
 * Points the frontend at the real FastAPI backend from Phases 0-2.
 * Override with VITE_API_BASE_URL in a .env.local file if your backend
 * runs somewhere other than localhost:8000 (e.g. a deployed server).
 */

function resolveApiBaseUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const port = '8020';
    return `${protocol}//${window.location.hostname}:${port}`;
  }
  return envUrl || 'http://localhost:8020';
}

export const API_BASE_URL: string = resolveApiBaseUrl();

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail || res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers // let the browser set multipart boundary itself
        : { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });

  if (!res.ok) {
    const message = await parseErrorBody(res);
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const apiGet = <T>(path: string) => apiRequest<T>(path, { method: 'GET' });
export const apiPost = <T>(path: string, body?: unknown) =>
  apiRequest<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
export const apiPatch = <T>(path: string, body?: unknown) =>
  apiRequest<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
export const apiDelete = <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' });
export const apiPostForm = <T>(path: string, form: FormData) =>
  apiRequest<T>(path, { method: 'POST', body: form });

/** Resolves a backend-relative media path (e.g. "/media/faces/...") to a full URL. */
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return `${API_BASE_URL}${path}`;
}

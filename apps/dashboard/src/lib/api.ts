const API_ROOT = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000';

export class ApiError extends Error {
  code: string;
  hint?: string;
  status: number;

  constructor(status: number, code: string, message: string, hint?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

interface Envelope<T> {
  data?: T;
  error?: { code: string; message: string; hint?: string; details?: unknown };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  headers.set('accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}/api/v1${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Tidak dapat menghubungi API. Pastikan server berjalan.');
  }

  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || payload?.error) {
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'INTERNAL_ERROR',
      payload?.error?.message ?? 'Permintaan gagal.',
      payload?.error?.hint,
    );
  }
  return payload!.data as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  },
  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  },
};

export { API_ROOT };

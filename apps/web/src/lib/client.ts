const API_ROOT = import.meta.env.PUBLIC_API_URL ?? 'http://127.0.0.1:3000';

export class ClientError extends Error {
  code: string;
  hint?: string;
  status: number;

  constructor(status: number, code: string, message: string, hint?: string) {
    super(message);
    this.name = 'ClientError';
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
}

interface Envelope<T> {
  data?: T;
  error?: { code: string; message: string; hint?: string; details?: Record<string, unknown> };
  requestId?: string;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  headers.set('accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}/api/v1${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ClientError(0, 'NETWORK_ERROR', 'Tidak dapat menghubungi server. Periksa koneksi Anda.');
  }

  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || payload?.error) {
    throw new ClientError(
      response.status,
      payload?.error?.code ?? 'INTERNAL_ERROR',
      payload?.error?.message ?? 'Permintaan gagal.',
      payload?.error?.hint,
    );
  }
  return payload!.data as T;
}

export { API_ROOT };

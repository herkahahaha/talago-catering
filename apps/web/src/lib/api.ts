import type { AvailabilityDto, MenuDayDto, OrderDto, ServiceAreaDto } from '@catering/contracts';

const SERVER_BASE = process.env.API_BASE_URL ?? import.meta.env.API_BASE_URL ?? 'http://127.0.0.1:3000';

export const PUBLIC_API_URL =
  import.meta.env.PUBLIC_API_URL ?? process.env.PUBLIC_API_URL ?? 'http://127.0.0.1:3000';

export const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:4321';

export class ApiRequestError extends Error {
  code: string;
  hint?: string;
  status: number;

  constructor(status: number, code: string, message: string, hint?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SERVER_BASE}/api/v1${path}`, {
    ...init,
    headers: { accept: 'application/json', ...(init.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code: string; message: string; hint?: string };
  } | null;

  if (!response.ok || payload?.error) {
    throw new ApiRequestError(
      response.status,
      payload?.error?.code ?? 'INTERNAL_ERROR',
      payload?.error?.message ?? 'Permintaan gagal.',
      payload?.error?.hint,
    );
  }
  return payload!.data as T;
}

export const serverApi = {
  availability(days = 14): Promise<AvailabilityDto> {
    return request<AvailabilityDto>(`/availability?days=${days}`);
  },
  menu(date: string): Promise<MenuDayDto> {
    return request<MenuDayDto>(`/menu?date=${encodeURIComponent(date)}`);
  },
  serviceArea(params: { district?: string; lat?: number; lng?: number }): Promise<ServiceAreaDto> {
    const query = new URLSearchParams();
    if (params.district) query.set('district', params.district);
    if (typeof params.lat === 'number') query.set('lat', String(params.lat));
    if (typeof params.lng === 'number') query.set('lng', String(params.lng));
    return request<ServiceAreaDto>(`/service-area?${query.toString()}`);
  },
  order(token: string): Promise<{ order: OrderDto; statusUrl: string | null }> {
    return request<{ order: OrderDto; statusUrl: string | null }>(`/orders/${encodeURIComponent(token)}`);
  },
};

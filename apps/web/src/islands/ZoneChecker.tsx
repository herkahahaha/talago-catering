import { Show, createSignal } from 'solid-js';
import { apiFetch, ClientError } from '../lib/client';

interface AreaResult {
  inZone: boolean;
  message: string;
  deliveryFee: number;
  zone: { name: string; city: string } | null;
}

export default function ZoneChecker() {
  const [district, setDistrict] = createSignal('Pontianak Kota');
  const [loading, setLoading] = createSignal(false);
  const [result, setResult] = createSignal<AreaResult | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  async function check(event: SubmitEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const area = await apiFetch<AreaResult>(
        `/service-area?district=${encodeURIComponent(district().trim())}`,
      );
      setResult(area);
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Gagal memeriksa area.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={check} style="display: flex; gap: 0.5rem; flex-wrap: wrap">
        <label class="sr-only" for="district">
          Kecamatan
        </label>
        <input
          id="district"
          class="input"
          style="flex: 1; min-width: 170px"
          value={district()}
          onInput={(event) => setDistrict(event.currentTarget.value)}
          placeholder="Tulis kecamatan Anda"
          required
        />
        <button class="btn btn-primary" type="submit" disabled={loading()}>
          {loading() ? 'Memeriksa…' : 'Cek area'}
        </button>
      </form>
      <Show when={result()}>
        <p class="zone-result" style={{ color: result()!.inZone ? 'var(--ok)' : 'var(--danger)' }}>
          {result()!.inZone ? '✓ ' : '✕ '}
          {result()!.message}
        </p>
        <Show when={result()!.inZone}>
          <a class="btn btn-ghost btn-sm" href="/menu">
            Lihat menu untuk area ini
          </a>
        </Show>
      </Show>
      <Show when={error()}>
        <p class="zone-result" style="color: var(--danger)">
          {error()}
        </p>
      </Show>
    </div>
  );
}

import { For, Show, createSignal, onMount } from 'solid-js';
import type { CustomerOrderSummaryDto } from '@catering/contracts';
import { apiFetch, ClientError } from '../lib/client';
import { formatShortDate, rp } from '../lib/format';

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Menunggu pembayaran',
  paid: 'Dibayar',
  paid_after_expiry: 'Dibayar setelah kedaluwarsa',
  in_production: 'Diproduksi',
  out_for_delivery: 'Diantar',
  delivered: 'Selesai',
  expired: 'Kedaluwarsa',
  cancelled_refunded: 'Dibatalkan & refund',
};

function statusTone(status: string): string {
  if (status === 'delivered') return 'badge badge-ok';
  if (status === 'cancelled_refunded') return 'badge badge-danger';
  if (status === 'paid' || status === 'in_production' || status === 'out_for_delivery') return 'badge';
  return 'badge badge-amber';
}

export default function OrderLookup() {
  const [mine, setMine] = createSignal<CustomerOrderSummaryDto[]>([]);
  const [mineLoaded, setMineLoaded] = createSignal(false);
  const [orderNo, setOrderNo] = createSignal('');
  const [phone, setPhone] = createSignal('');
  const [results, setResults] = createSignal<CustomerOrderSummaryDto[] | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<{ message: string; hint?: string } | null>(null);

  onMount(async () => {
    try {
      const data = await apiFetch<{ orders: CustomerOrderSummaryDto[] }>('/orders/mine');
      setMine(data.orders);
    } catch {
      // Tamu tanpa sesi: abaikan, form pencarian tetap tersedia.
    } finally {
      setMineLoaded(true);
    }
  });

  async function lookup(event: SubmitEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ orders: CustomerOrderSummaryDto[] }>('/orders/lookup', {
        method: 'POST',
        body: JSON.stringify({ orderNo: orderNo().trim(), phone: phone().trim() }),
      });
      setResults(data.orders);
    } catch (err) {
      if (err instanceof ClientError) {
        setError({ message: err.message, ...(err.hint ? { hint: err.hint } : {}) });
      } else {
        setError({ message: 'Gagal mencari pesanan.' });
      }
    } finally {
      setLoading(false);
    }
  }

  function OrderCard(props: { order: CustomerOrderSummaryDto }) {
    return (
      <a
        class="card"
        href={`/order/${props.order.viewToken}`}
        style="display: block; padding: 1rem 1.1rem; text-decoration: none; color: inherit"
      >
        <div style="display: flex; justify-content: space-between; gap: 1rem; align-items: baseline">
          <strong>{props.order.orderNo}</strong>
          <span class={statusTone(props.order.status)}>
            {STATUS_LABELS[props.order.status] ?? props.order.status}
          </span>
        </div>
        <p class="tiny" style="margin: 0.45rem 0 0">
          Layanan {formatShortDate(props.order.serviceDate)} · {props.order.portions} porsi ·{' '}
          {rp(props.order.total)}
        </p>
        <span class="tiny" style="display: inline-block; margin-top: 0.45rem; color: var(--amber)">
          Lihat status →
        </span>
      </a>
    );
  }

  return (
    <div class="split" style="align-items: start">
      <div>
        <div class="card panel">
          <h3 style="font-size: 1.05rem">Lacak dengan nomor pesanan</h3>
          <p class="tiny">Masukkan nomor pesanan dan nomor HP yang dipakai saat memesan.</p>
          <form onSubmit={lookup}>
            <div class="field">
              <label for="order-no">Nomor pesanan</label>
              <input
                id="order-no"
                class="input"
                required
                value={orderNo()}
                onInput={(event) => setOrderNo(event.currentTarget.value)}
                placeholder="CG-261106-EV43"
              />
            </div>
            <div class="field">
              <label for="order-phone">Nomor HP</label>
              <input
                id="order-phone"
                class="input"
                required
                inputMode="tel"
                pattern="^(?:\+62|62|0)8[1-9][0-9]{6,11}$"
                value={phone()}
                onInput={(event) => setPhone(event.currentTarget.value)}
                placeholder="0812xxxxxxx"
              />
            </div>
            <Show when={error()}>
              <div class="alert alert-error" style="margin-bottom: 0.8rem" role="alert">
                <strong>{error()!.message}</strong>
                <Show when={error()!.hint}>
                  <p style="margin: 0.3rem 0 0">{error()!.hint}</p>
                </Show>
              </div>
            </Show>
            <button class="btn btn-primary" type="submit" disabled={loading()}>
              {loading() ? 'Mencari…' : 'Cari pesanan'}
            </button>
          </form>

          <Show when={results()}>
            <div class="divider" />
            <Show
              when={results()!.length > 0}
              fallback={
                <p class="tiny" style="margin: 0">
                  Pesanan tidak ditemukan. Pastikan nomor pesanan dan nomor HP sama dengan saat checkout.
                </p>
              }
            >
              <p class="tiny" style="margin-bottom: 0.6rem">
                {results()!.length} pesanan ditemukan:
              </p>
              <div style="display: grid; gap: 0.6rem">
                <For each={results()!}>{(order) => <OrderCard order={order} />}</For>
              </div>
            </Show>
          </Show>
        </div>

        <div class="alert alert-info" style="margin-top: 1rem">
          Tautan status dari pesan konfirmasi tetap berlaku permanen. Tautan dari halaman ini berlaku 30 menit
          demi keamanan.
        </div>
      </div>

      <div class="card panel">
        <h3 style="font-size: 1.05rem">Pesanan di perangkat ini</h3>
        <p class="tiny">Muncul otomatis bila Anda memesan dari browser ini.</p>
        <Show when={!mineLoaded()}>
          <p class="tiny">Memuat…</p>
        </Show>
        <Show when={mineLoaded()}>
          <Show
            when={mine().length > 0}
            fallback={
              <div class="empty" style="padding: 1.4rem 0.4rem">
                <p class="tiny" style="margin: 0">
                  Belum ada pesanan yang terhubung ke perangkat ini.
                </p>
                <a class="btn btn-ghost btn-sm" href="/menu" style="margin-top: 0.6rem">
                  Pesan sekarang
                </a>
              </div>
            }
          >
            <div style="display: grid; gap: 0.6rem">
              <For each={mine()}>{(order) => <OrderCard order={order} />}</For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}

import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import type { OrderStatus } from '@catering/contracts';
import { apiFetch, ClientError } from '../lib/client';
import { countdown } from '../lib/format';

interface Props {
  orderId: string;
  token: string;
  status: OrderStatus;
  gatewayRef: string | null;
  holdExpiresAt: string | null;
  orderNo: string;
}

export default function OrderStatusActions(props: Props) {
  const [busy, setBusy] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [remaining, setRemaining] = createSignal(countdown(props.holdExpiresAt));

  onMount(() => {
    const timer = window.setInterval(() => setRemaining(countdown(props.holdExpiresAt)), 1000);
    onCleanup(() => window.clearInterval(timer));
  });

  const canCancel = () =>
    props.status === 'pending_payment' || props.status === 'paid' || props.status === 'paid_after_expiry';
  const canPay = () => props.status === 'pending_payment' && Boolean(props.gatewayRef);
  const isDev = import.meta.env.DEV;

  async function simulatePayment() {
    if (!props.gatewayRef) return;
    setBusy('pay');
    setError(null);
    try {
      await apiFetch(`/dev/payments/${encodeURIComponent(props.gatewayRef)}/settle`, { method: 'POST' });
      window.location.reload();
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Gagal mensimulasikan pembayaran.');
    } finally {
      setBusy(null);
    }
  }

  async function retryPayment() {
    setBusy('retry');
    setError(null);
    try {
      await apiFetch(`/orders/${props.orderId}/payment-retry?token=${encodeURIComponent(props.token)}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      window.location.reload();
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Gagal membuat tagihan ulang.');
    } finally {
      setBusy(null);
    }
  }

  async function cancelOrder() {
    const reason = window.prompt('Alasan pembatalan (boleh dikosongkan):', 'Berubah rencana');
    if (reason === null) return;
    setBusy('cancel');
    setError(null);
    try {
      await apiFetch(`/orders/${props.orderId}/cancel?token=${encodeURIComponent(props.token)}`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || 'Dibatalkan pelanggan' }),
      });
      window.location.reload();
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Gagal membatalkan pesanan.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style="display: grid; gap: 0.6rem; margin-top: 1rem">
      <Show when={props.status === 'pending_payment'}>
        <div class="alert alert-warn" style="display: flex; justify-content: space-between; gap: 1rem">
          <span>Sisa waktu hold</span>
          <span class="countdown">{remaining()}</span>
        </div>
      </Show>

      <Show when={canPay() && isDev}>
        <button
          type="button"
          class="btn btn-primary"
          onClick={() => void simulatePayment()}
          disabled={busy() !== null}
        >
          {busy() === 'pay' ? 'Memproses…' : 'Simulasikan pembayaran (mode uji)'}
        </button>
      </Show>

      <Show when={props.status === 'pending_payment'}>
        <button
          type="button"
          class="btn btn-ghost"
          onClick={() => void retryPayment()}
          disabled={busy() !== null}
        >
          {busy() === 'retry' ? 'Memproses…' : 'Buat tagihan ulang'}
        </button>
      </Show>

      <Show when={canCancel()}>
        <button
          type="button"
          class="btn btn-ghost"
          onClick={() => void cancelOrder()}
          disabled={busy() !== null}
        >
          {busy() === 'cancel' ? 'Membatalkan…' : 'Batalkan pesanan'}
        </button>
      </Show>

      <a
        class="btn btn-ghost"
        href={`https://wa.me/6281234567890?text=${encodeURIComponent(`Halo, saya ingin menanyakan pesanan ${props.orderNo}.`)}`}
        target="_blank"
        rel="noopener"
      >
        Hubungi dapur via WhatsApp
      </a>

      <Show when={error()}>
        <div class="alert alert-error" role="alert">
          {error()}
        </div>
      </Show>
    </div>
  );
}

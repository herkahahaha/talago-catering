import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { apiFetch, ClientError } from '../lib/client';
import { clearCart, loadCart, newIdempotencyKey, cartSubtotal, type Cart } from '../lib/cart';
import { formatDate, rp } from '../lib/format';

interface WindowProp {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  remainingStops: number;
}

interface DayProp {
  date: string;
  isOpen: boolean;
  cutoffPassed: boolean;
  remainingRegular: number;
  windows: WindowProp[];
}

interface Props {
  days: DayProp[];
  minPortions: number;
  maxPortions: number;
  deliveryFee: number;
}

interface Challenge {
  challengeId: string;
  question: string;
  expiresAt: string;
}

interface CreatedOrder {
  statusUrl: string;
  order: { orderNo: string };
}

export default function CheckoutFlow(props: Props) {
  const [cart, setCart] = createSignal<Cart | null>(null);
  const [ready, setReady] = createSignal(false);
  const [name, setName] = createSignal('');
  const [phone, setPhone] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [line, setLine] = createSignal('');
  const [district, setDistrict] = createSignal('Pontianak Kota');
  const [windowId, setWindowId] = createSignal('');
  const [method, setMethod] = createSignal<'qris' | 'va'>('qris');
  const [notes, setNotes] = createSignal('');
  const [consent, setConsent] = createSignal(false);
  const [challenge, setChallenge] = createSignal<Challenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = createSignal('');
  const [captchaLoading, setCaptchaLoading] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<{ message: string; code?: string; hint?: string } | null>(null);
  const [otpRequired, setOtpRequired] = createSignal(false);
  const [otpCode, setOtpCode] = createSignal('');
  const [otpMessage, setOtpMessage] = createSignal<string | null>(null);
  const [otpLoading, setOtpLoading] = createSignal(false);

  let retryKey = '';

  onMount(() => {
    const saved = loadCart();
    setCart(saved && saved.items.length > 0 ? saved : null);
    setReady(true);
    void refreshCaptcha();
  });

  const day = createMemo(() => {
    const current = cart();
    if (!current) return null;
    return props.days.find((entry) => entry.date === current.date) ?? null;
  });
  const windows = createMemo(() => (day()?.windows ?? []).filter((w) => w.remainingStops > 0));
  const subtotal = createMemo(() => (cart() ? cartSubtotal(cart()!.items) : 0));
  const total = createMemo(() => subtotal() + props.deliveryFee);
  const closed = createMemo(() => !day() || day()!.cutoffPassed || !day()!.isOpen);

  async function refreshCaptcha() {
    setCaptchaLoading(true);
    setCaptchaAnswer('');
    try {
      const next = await apiFetch<Challenge>('/captcha', { method: 'POST' });
      setChallenge(next);
    } catch (err) {
      setError({ message: err instanceof ClientError ? err.message : 'CAPTCHA gagal dimuat.' });
    } finally {
      setCaptchaLoading(false);
    }
  }

  async function requestOtp() {
    setOtpLoading(true);
    setOtpMessage(null);
    try {
      const result = await apiFetch<{ devCode?: string; expiresAt: string }>('/auth/otp', {
        method: 'POST',
        body: JSON.stringify({ phone: phone().trim(), purpose: 'adaptive' }),
      });
      setOtpMessage(
        result.devCode
          ? `Mode pengembangan — kode OTP: ${result.devCode}`
          : 'Kode OTP dikirim ke WhatsApp/SMS Anda.',
      );
    } catch (err) {
      setError({ message: err instanceof ClientError ? err.message : 'Gagal mengirim OTP.' });
    } finally {
      setOtpLoading(false);
    }
  }

  async function verifyOtp() {
    setOtpLoading(true);
    try {
      await apiFetch('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ phone: phone().trim(), code: otpCode().trim(), purpose: 'adaptive' }),
      });
      setOtpRequired(false);
      setOtpMessage(null);
      await refreshCaptcha();
      setError({ message: 'Nomor sudah diverifikasi. Tekan "Buat pesanan" untuk melanjutkan.' });
    } catch (err) {
      setError({ message: err instanceof ClientError ? err.message : 'Kode OTP salah.' });
    } finally {
      setOtpLoading(false);
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting()) return;
    const current = cart();
    if (!current) return;

    if (!consent()) {
      setError({ message: 'Setujui penggunaan data pribadi untuk melanjutkan.' });
      return;
    }
    if (closed()) {
      setError({ message: 'Tanggal ini sudah ditutup. Pilih tanggal lain di halaman menu.' });
      return;
    }
    if (!challenge()) {
      await refreshCaptcha();
    }
    const activeChallenge = challenge();
    if (!activeChallenge) {
      setError({ message: 'CAPTCHA belum siap. Muat ulang halaman.' });
      return;
    }

    setSubmitting(true);
    setError(null);

    const key = retryKey || newIdempotencyKey();
    try {
      await apiFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify({
          name: name().trim(),
          phone: phone().trim(),
          ...(email().trim() ? { email: email().trim() } : {}),
          consent: true,
          location: { address: line().trim(), district: district().trim() },
        }),
      });

      const created = await apiFetch<CreatedOrder>('/orders', {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify({
          serviceDate: current.date,
          items: current.items.map((item) => ({ menuItemId: item.menuItemId, portions: item.portions })),
          delivery: {
            ...(windowId() ? { windowId: windowId() } : {}),
            address: { line: line().trim(), district: district().trim() },
            recipientName: name().trim(),
            recipientPhone: phone().trim(),
          },
          paymentMethod: method(),
          captchaToken: `${activeChallenge.challengeId}.${captchaAnswer().trim()}`,
          ...(notes().trim() ? { notes: notes().trim() } : {}),
          consent: true,
        }),
      });

      retryKey = '';
      clearCart();
      window.location.href = created.statusUrl;
    } catch (err) {
      if (err instanceof ClientError) {
        if (err.code === 'OTP_REQUIRED') setOtpRequired(true);
        if (err.code === 'CAPTCHA_REQUIRED') void refreshCaptcha();
        retryKey = err.status >= 500 || err.status === 0 ? key : '';
        setError({
          message: err.message,
          ...(err.code ? { code: err.code } : {}),
          ...(err.hint ? { hint: err.hint } : {}),
        });
      } else {
        setError({ message: 'Terjadi kesalahan tak terduga.' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Show when={ready()}>
      <Show
        when={cart()}
        fallback={
          <div class="panel empty">
            <h3>Keranjang masih kosong</h3>
            <p class="muted">Pilih hidangan dan tanggal layanan terlebih dahulu.</p>
            <a class="btn btn-primary" href="/menu">
              Lihat menu
            </a>
          </div>
        }
      >
        {(current) => (
          <form class="checkout-grid" onSubmit={submit}>
            <div class="card">
              <section class="form-section">
                <h3>
                  <span class="step-badge" aria-hidden="true">
                    1
                  </span>
                  Identitas
                </h3>
                <p class="muted">Kami pakai nomor HP untuk konfirmasi pesanan.</p>
                <div class="field-row">
                  <div class="field">
                    <label for="name">Nama lengkap</label>
                    <input
                      id="name"
                      class="input"
                      required
                      minLength={2}
                      value={name()}
                      onInput={(event) => setName(event.currentTarget.value)}
                      placeholder="Nama penerima"
                    />
                  </div>
                  <div class="field">
                    <label for="phone">Nomor HP / WhatsApp</label>
                    <input
                      id="phone"
                      class="input"
                      required
                      inputMode="tel"
                      pattern="^(?:\+62|62|0)8[1-9][0-9]{6,11}$"
                      value={phone()}
                      onInput={(event) => setPhone(event.currentTarget.value)}
                      placeholder="0812xxxxxxx"
                    />
                  </div>
                </div>
                <div class="field">
                  <label for="email">Email (opsional)</label>
                  <input
                    id="email"
                    class="input"
                    type="email"
                    value={email()}
                    onInput={(event) => setEmail(event.currentTarget.value)}
                    placeholder="untuk kwitansi"
                  />
                </div>
              </section>

              <section class="form-section">
                <h3>
                  <span class="step-badge" aria-hidden="true">
                    2
                  </span>
                  Pengantaran
                </h3>
                <p class="muted">Area layanan saat ini: Pontianak (ongkir gratis).</p>
                <div class="field">
                  <label for="line">Alamat lengkap</label>
                  <textarea
                    id="line"
                    class="textarea"
                    rows={3}
                    required
                    minLength={5}
                    value={line()}
                    onInput={(event) => setLine(event.currentTarget.value)}
                    placeholder="Nama gedung/jalan, nomor, patokan"
                  />
                </div>
                <div class="field-row">
                  <div class="field">
                    <label for="district">Kecamatan</label>
                    <input
                      id="district"
                      class="input"
                      value={district()}
                      onInput={(event) => setDistrict(event.currentTarget.value)}
                      placeholder="Pontianak Kota"
                    />
                  </div>
                  <div class="field">
                    <label for="window">Jendela antar (opsional)</label>
                    <select
                      id="window"
                      class="select"
                      value={windowId()}
                      onChange={(event) => setWindowId(event.currentTarget.value)}
                    >
                      <option value="">Admin akan mengatur jam antar</option>
                      <For each={windows()}>
                        {(window) => (
                          <option value={window.id}>
                            {window.label} · sisa {window.remainingStops} stop
                          </option>
                        )}
                      </For>
                    </select>
                    <span class="hint">Pilih bila ingin jam antar tertentu.</span>
                  </div>
                </div>
                <div class="field">
                  <label for="notes">Catatan untuk dapur (opsional)</label>
                  <textarea
                    id="notes"
                    class="textarea"
                    rows={2}
                    value={notes()}
                    onInput={(event) => setNotes(event.currentTarget.value)}
                    placeholder="Contoh: sambal dipisah, tanpa lada"
                  />
                </div>
              </section>

              <section class="form-section">
                <h3>
                  <span class="step-badge" aria-hidden="true">
                    3
                  </span>
                  Pembayaran
                </h3>
                <div class="radio-group">
                  <label class="radio-card">
                    <input
                      type="radio"
                      name="method"
                      checked={method() === 'qris'}
                      onChange={() => setMethod('qris')}
                    />
                    <span>
                      <strong>QRIS</strong>
                      <small>Pindai dari aplikasi bank atau e-wallet apa pun.</small>
                    </span>
                  </label>
                  <label class="radio-card">
                    <input
                      type="radio"
                      name="method"
                      checked={method() === 'va'}
                      onChange={() => setMethod('va')}
                    />
                    <span>
                      <strong>Virtual Account</strong>
                      <small>Nomor VA untuk transfer bank.</small>
                    </span>
                  </label>
                </div>
                <p class="tiny" style="margin-top: 0.8rem">
                  Slot ditahan 10 menit sampai pembayaran diterima; setelah itu otomatis dilepas.
                </p>
              </section>

              <section class="form-section">
                <h3>
                  <span class="step-badge" aria-hidden="true">
                    4
                  </span>
                  Konfirmasi
                </h3>
                <div class="field">
                  <label for="captcha">Verifikasi manusia — {challenge()?.question ?? 'memuat…'}</label>
                  <input
                    id="captcha"
                    class="input"
                    required
                    value={captchaAnswer()}
                    onInput={(event) => setCaptchaAnswer(event.currentTarget.value)}
                    placeholder="Jawaban"
                    style="max-width: 200px"
                  />
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    onClick={() => void refreshCaptcha()}
                    disabled={captchaLoading()}
                  >
                    Ganti soal
                  </button>
                </div>

                <label class="consent">
                  <input
                    type="checkbox"
                    checked={consent()}
                    onChange={(event) => setConsent(event.currentTarget.checked)}
                  />
                  <span>
                    Saya setuju nama, nomor HP, dan alamat dipakai untuk memproses pesanan ini sesuai
                    kebijakan data pribadi (UU PDP).
                  </span>
                </label>

                <Show when={otpRequired()}>
                  <div class="alert alert-warn" style="margin-top: 1rem">
                    <strong>Verifikasi nomor HP</strong>
                    <p style="margin: 0.35rem 0 0.6rem">
                      Kami perlu memastikan ini Anda. Kode dikirim ke WhatsApp/SMS.
                    </p>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap">
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        onClick={() => void requestOtp()}
                        disabled={otpLoading()}
                      >
                        Kirim kode
                      </button>
                      <input
                        class="input"
                        style="max-width: 140px"
                        inputMode="numeric"
                        placeholder="6 digit"
                        value={otpCode()}
                        onInput={(event) => setOtpCode(event.currentTarget.value)}
                      />
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        onClick={() => void verifyOtp()}
                        disabled={otpLoading()}
                      >
                        Verifikasi
                      </button>
                    </div>
                    <Show when={otpMessage()}>
                      <p class="tiny" style="margin: 0.5rem 0 0">
                        {otpMessage()}
                      </p>
                    </Show>
                  </div>
                </Show>

                <Show when={error()}>
                  <div class="alert alert-error" style="margin-top: 1rem" role="alert">
                    <strong>{error()!.message}</strong>
                    <Show when={error()!.hint}>
                      <p style="margin: 0.3rem 0 0">{error()!.hint}</p>
                    </Show>
                  </div>
                </Show>

                <button
                  type="submit"
                  class="btn btn-amber"
                  style="width: 100%; margin-top: 1rem"
                  disabled={submitting() || closed()}
                >
                  {submitting() ? 'Memproses…' : `Buat pesanan · ${rp(total())}`}
                </button>
                <Show when={closed()}>
                  <p class="tiny" style="margin-top: 0.6rem">
                    Tanggal ini sudah melewati cut-off. Kembali ke menu untuk memilih tanggal lain.
                  </p>
                </Show>
              </section>
            </div>

            <aside class="card summary-card">
              <div class="panel" style="border: 0">
                <div class="badge badge-amber">{formatDate(current().date)}</div>
                <h3 style="margin-top: 0.7rem">Ringkasan</h3>
                <Show when={day()}>
                  <p class="tiny" style="margin-top: -0.4rem">
                    Sisa {day()!.remainingRegular} porsi pada tanggal ini
                  </p>
                </Show>
                <For each={current().items}>
                  {(item) => (
                    <div class="cart-item">
                      <span>
                        {item.name} <span class="tiny">· {item.portions} porsi</span>
                      </span>
                      <span>{rp(item.price * item.portions)}</span>
                    </div>
                  )}
                </For>
                <div class="summary-line" style="margin-top: 0.6rem">
                  <span>Subtotal</span>
                  <span>{rp(subtotal())}</span>
                </div>
                <div class="summary-line">
                  <span>Ongkir</span>
                  <span>{props.deliveryFee === 0 ? 'Gratis' : rp(props.deliveryFee)}</span>
                </div>
                <div class="summary-line summary-total">
                  <span>Total</span>
                  <span>{rp(total())}</span>
                </div>
                <p class="tiny" style="margin-top: 1rem">
                  Hold berlaku 10 menit setelah pesanan dibuat. Jika pembayaran lewat, slot dilepas otomatis
                  dan dana dikembalikan sesuai kebijakan.
                </p>
                <a href="/menu" class="btn btn-ghost btn-sm" style="margin-top: 0.5rem">
                  Ubah pesanan
                </a>
              </div>
            </aside>
          </form>
        )}
      </Show>
    </Show>
  );
}

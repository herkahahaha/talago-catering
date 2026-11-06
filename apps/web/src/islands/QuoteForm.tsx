import { Show, createSignal } from 'solid-js';
import { apiFetch, ClientError } from '../lib/client';

export default function QuoteForm(props: { maxPortions?: number }) {
  const maxPortions = () => props.maxPortions ?? 200;
  const [name, setName] = createSignal('');
  const [phone, setPhone] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [company, setCompany] = createSignal('');
  const [serviceDate, setServiceDate] = createSignal('');
  const [portions, setPortions] = createSignal(201);
  const [notes, setNotes] = createSignal('');
  const [consent, setConsent] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [error, setError] = createSignal<{ message: string; hint?: string } | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/quotes', {
        method: 'POST',
        body: JSON.stringify({
          name: name().trim(),
          phone: phone().trim(),
          ...(email().trim() ? { email: email().trim() } : {}),
          ...(company().trim() ? { company: company().trim() } : {}),
          serviceDate: serviceDate(),
          portions: portions(),
          ...(notes().trim() ? { notes: notes().trim() } : {}),
          consent: true,
        }),
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ClientError) {
        setError({ message: err.message, ...(err.hint ? { hint: err.hint } : {}) });
      } else {
        setError({ message: 'Gagal mengirim permintaan.' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Show
      when={!done()}
      fallback={
        <div class="alert alert-info">
          <strong>Permintaan terkirim.</strong>
          <p style="margin: 0.4rem 0 0">
            Tim kami akan menghubungi Anda dalam 1×24 jam kerja untuk menyepakati menu, harga, dan jadwal.
          </p>
        </div>
      }
    >
      <form onSubmit={submit} class="panel">
        <div class="field-row">
          <div class="field">
            <label for="q-name">Nama</label>
            <input
              id="q-name"
              class="input"
              required
              minLength={2}
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </div>
          <div class="field">
            <label for="q-phone">Nomor HP</label>
            <input
              id="q-phone"
              class="input"
              required
              inputMode="tel"
              pattern="^(?:\+62|62|0)8[1-9][0-9]{6,11}$"
              value={phone()}
              onInput={(e) => setPhone(e.currentTarget.value)}
              placeholder="0812xxxxxxx"
            />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="q-email">Email (opsional)</label>
            <input
              id="q-email"
              class="input"
              type="email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
            />
          </div>
          <div class="field">
            <label for="q-company">Instansi / perusahaan (opsional)</label>
            <input
              id="q-company"
              class="input"
              value={company()}
              onInput={(e) => setCompany(e.currentTarget.value)}
            />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="q-date">Tanggal layanan</label>
            <input
              id="q-date"
              class="input"
              type="date"
              required
              value={serviceDate()}
              onInput={(e) => setServiceDate(e.currentTarget.value)}
            />
          </div>
          <div class="field">
            <label for="q-portions">Jumlah porsi</label>
            <input
              id="q-portions"
              class="input"
              type="number"
              min={maxPortions() + 1}
              max={2000}
              required
              value={portions()}
              onInput={(e) => setPortions(Number(e.currentTarget.value))}
            />
            <span class="hint">Di atas {maxPortions()} porsi, harga bisa dinegosiasikan.</span>
          </div>
        </div>
        <div class="field">
          <label for="q-notes">Kebutuhan acara</label>
          <textarea
            id="q-notes"
            class="textarea"
            rows={3}
            value={notes()}
            onInput={(e) => setNotes(e.currentTarget.value)}
            placeholder="Jenis acara, menu yang diinginkan, jam pengantaran"
          />
        </div>
        <label class="consent">
          <input type="checkbox" checked={consent()} onChange={(e) => setConsent(e.currentTarget.checked)} />
          <span>Saya setuju data ini dipakai untuk menindaklanjuti permintaan penawaran.</span>
        </label>
        <Show when={error()}>
          <div class="alert alert-error" style="margin-top: 0.9rem" role="alert">
            <strong>{error()!.message}</strong>
            <Show when={error()!.hint}>
              <p style="margin: 0.3rem 0 0">{error()!.hint}</p>
            </Show>
          </div>
        </Show>
        <button
          class="btn btn-amber"
          type="submit"
          style="margin-top: 1rem"
          disabled={submitting() || !consent()}
        >
          {submitting() ? 'Mengirim…' : 'Kirim permintaan'}
        </button>
      </form>
    </Show>
  );
}

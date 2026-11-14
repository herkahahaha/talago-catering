import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import type { MenuItemDto } from '@catering/contracts';
import { apiFetch, ClientError } from '../lib/client';
import { cartPortions, cartSubtotal, clearCart, loadCart, saveCart, type CartItem } from '../lib/cart';
import { rp } from '../lib/format';

interface DayProp {
  date: string;
  remainingRegular: number;
  isOpen: boolean;
  cutoffPassed: boolean;
}

interface Props {
  initialDate: string;
  initialItems: MenuItemDto[];
  days: DayProp[];
  minPortions: number;
  maxPortions: number;
}

const dayLabel = new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: 'Asia/Jakarta' });
const dateLabel = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Jakarta',
});
const longDateLabel = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

function labelFor(dateIso: string) {
  const date = new Date(`${dateIso}T12:00:00+07:00`);
  return { weekday: dayLabel.format(date), date: dateLabel.format(date) };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export default function MenuBrowser(props: Props) {
  const openDays = () => props.days.filter((day) => !day.cutoffPassed && day.isOpen);
  const [date, setDate] = createSignal(props.initialDate);
  const [items, setItems] = createSignal<MenuItemDto[]>(props.initialItems);
  const [cart, setCart] = createSignal<CartItem[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  onMount(() => {
    const saved = loadCart();
    if (saved && saved.date === date()) setCart(saved.items);
    else if (saved && saved.items.length > 0) clearCart();
  });

  const totalPortions = createMemo(() => cartPortions(cart()));
  const subtotal = createMemo(() => cartSubtotal(cart()));
  const maxReached = createMemo(() => totalPortions() >= props.maxPortions);
  const canCheckout = createMemo(
    () => totalPortions() >= props.minPortions && totalPortions() <= props.maxPortions,
  );
  const portionsOf = (id: string) => cart().find((item) => item.menuItemId === id)?.portions ?? 0;
  const selectedLabel = () => longDateLabel.format(new Date(`${date()}T12:00:00+07:00`));

  async function pickDay(next: string) {
    if (next === date() || loading()) return;
    const currentItems = cart();
    if (currentItems.length > 0) {
      const ok = window.confirm(
        'Keranjang terikat satu tanggal. Mengganti tanggal akan mengosongkan keranjang. Lanjutkan?',
      );
      if (!ok) return;
      setCart([]);
      clearCart();
    }
    setDate(next);
    const url = new URL(window.location.href);
    url.searchParams.set('date', next);
    window.history.replaceState({}, '', url);
    setLoading(true);
    setError(null);
    try {
      const day = await apiFetch<{ items: MenuItemDto[] }>(`/menu?date=${encodeURIComponent(next)}`);
      setItems(day.items);
    } catch (err) {
      setError(err instanceof ClientError ? err.message : 'Gagal memuat menu.');
    } finally {
      setLoading(false);
    }
  }

  function updateQty(item: MenuItemDto, nextQty: number) {
    const otherPortions = cart()
      .filter((entry) => entry.menuItemId !== item.id)
      .reduce((sum, entry) => sum + entry.portions, 0);
    const maxForItem = Math.max(0, props.maxPortions - otherPortions);
    const portions = Math.max(0, Math.min(nextQty, maxForItem));
    const next = cart().filter((entry) => entry.menuItemId !== item.id);
    if (portions > 0) {
      next.push({
        menuItemId: item.id,
        slug: item.slug,
        name: item.name,
        price: item.price,
        portions,
      });
    }
    setCart(next);
    saveCart({ date: date(), items: next, updatedAt: Date.now() });
  }

  return (
    <div class="menu-layout">
      <div>
        <p class="tiny" style="margin: 0 0 0.65rem">
          Tanggal dipilih: <strong>{selectedLabel()}</strong> · cut-off H-1 pukul 18.00 WIB · minimal{' '}
          {props.minPortions} porsi
        </p>
        <div class="date-strip" role="group" aria-label="Pilih tanggal layanan">
          <For each={openDays()}>
            {(day) => (
              <button
                type="button"
                class="date-chip"
                classList={{ 'is-active': day.date === date() }}
                onClick={() => void pickDay(day.date)}
                aria-pressed={day.date === date()}
              >
                <span>{labelFor(day.date).weekday}</span>
                <strong>{labelFor(day.date).date}</strong>
                <span>{day.remainingRegular} porsi</span>
              </button>
            )}
          </For>
        </div>

        <Show when={error()}>
          <div class="alert alert-error" style="margin-top: 1rem" role="alert">
            {error()}
          </div>
        </Show>

        <Show
          when={items().length > 0}
          fallback={
            <div class="panel empty" style="margin-top: 1.2rem">
              <p>Belum ada menu yang dijadwalkan untuk tanggal ini.</p>
              <p class="tiny">Pilih tanggal lain, atau hubungi dapur lewat WhatsApp.</p>
            </div>
          }
        >
          <div class="menu-grid menu-grid--list" style="margin-top: 1.4rem">
            <For each={items()}>
              {(item) => {
                const qty = () => portionsOf(item.id);
                return (
                  <article class="dish">
                    <div class="dish-media" data-category={item.category} aria-hidden="true">
                      <Show
                        when={item.imageUrl}
                        fallback={<span class="dish-glyph">{initials(item.name)}</span>}
                      >
                        <img src={item.imageUrl!} alt="" loading="lazy" />
                      </Show>
                    </div>
                    <div class="dish-body">
                      <div class="dish-title">
                        <h3>{item.name}</h3>
                      </div>
                      <p class="dish-desc">{item.description}</p>
                      <div class="dish-actions">
                        <span class="dish-price">
                          {rp(item.price)}
                          <span class="sr-only"> per porsi</span>
                        </span>
                        <div class="qty">
                          <button
                            type="button"
                            aria-label={`Kurangi porsi ${item.name}`}
                            disabled={qty() === 0}
                            onClick={() => updateQty(item, qty() - 5)}
                          >
                            −
                          </button>
                          <input
                            class="qty-input"
                            type="number"
                            min={0}
                            max={props.maxPortions}
                            aria-label={`Jumlah porsi ${item.name}`}
                            value={qty()}
                            onInput={(event) => updateQty(item, Number(event.currentTarget.value) || 0)}
                          />
                          <button
                            type="button"
                            aria-label={`Tambah porsi ${item.name}`}
                            disabled={maxReached()}
                            onClick={() => updateQty(item, qty() + 5)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              }}
            </For>
          </div>
        </Show>
      </div>

      <div class="cart-bar">
        <div class="cart-bar-inner">
          <span class="cart-title">Keranjang pesanan</span>
          <Show when={cart().length > 0}>
            <div class="cart-lines">
              <For each={cart()}>
                {(entry) => (
                  <div class="cart-item">
                    <span>
                      {entry.name} <span class="tiny">· {entry.portions} porsi</span>
                    </span>
                    <span>{rp(entry.price * entry.portions)}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <div>
            <strong>{totalPortions()} porsi</strong>
            <small>
              {totalPortions() === 0
                ? `Minimal ${props.minPortions} porsi per pesanan`
                : totalPortions() < props.minPortions
                  ? `Kurang ${props.minPortions - totalPortions()} porsi lagi`
                  : totalPortions() > props.maxPortions
                    ? `Maksimal ${props.maxPortions} porsi per order`
                    : `${rp(subtotal())} · tanggal ${date()}`}
            </small>
          </div>
          <Show
            when={canCheckout()}
            fallback={<span class="btn btn-ghost btn-sm cart-hint">Pilih menu dulu</span>}
          >
            <a class="btn btn-amber" href="/checkout">
              Lanjut ke checkout
            </a>
          </Show>
        </div>
      </div>
    </div>
  );
}

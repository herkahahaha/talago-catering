export interface CartItem {
  menuItemId: string;
  slug: string;
  name: string;
  price: number;
  portions: number;
}

export interface Cart {
  date: string;
  items: CartItem[];
  updatedAt: number;
}

const KEY = 'catering_cart_v1';

export function loadCart(): Cart | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cart;
    if (!parsed?.date || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCart(cart: Cart): void {
  localStorage.setItem(KEY, JSON.stringify({ ...cart, updatedAt: Date.now() }));
}

export function clearCart(): void {
  localStorage.removeItem(KEY);
}

export function cartPortions(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.portions, 0);
}

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.portions * item.price, 0);
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

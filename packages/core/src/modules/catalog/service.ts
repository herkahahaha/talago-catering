import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type {
  AdminMenuCreateInput,
  AdminMenuUpdateInput,
  AdminMenuItemDto,
  MenuAvailabilityItemDto,
  MenuItemDto,
} from '@catering/contracts';
import { menuItems, menuSchedule } from './schema';
import type { Executor } from '../../db/client';
import { recordAudit } from '../audit/index';
import { AppError, slugify } from '../../lib/ids';
import { addDays, todayWib } from '../../lib/time';
import { getSetting } from '../settings/index';

export interface CatalogItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: MenuItemDto['category'];
  unitLabel: string;
  price: number;
  imageUrl: string | null;
  isActive: boolean;
}

export async function listMenuForDate(
  exec: Executor,
  date: string,
  portionsRemaining: number | null = null,
): Promise<MenuItemDto[]> {
  const rows = await exec
    .select({
      id: menuItems.id,
      slug: menuItems.slug,
      name: menuItems.name,
      description: menuItems.description,
      category: menuItems.category,
      unitLabel: menuItems.unitLabel,
      price: menuItems.price,
      imageUrl: menuItems.imageUrl,
      isActive: menuItems.isActive,
      scheduleAvailable: menuSchedule.isAvailable,
    })
    .from(menuSchedule)
    .innerJoin(menuItems, eq(menuItems.id, menuSchedule.menuItemId))
    .where(and(eq(menuSchedule.serviceDate, date), eq(menuItems.isActive, true)))
    .orderBy(menuItems.category, menuItems.name);

  const categoryRank: Record<string, number> = {
    package: 0,
    main: 1,
    side: 2,
    drink: 3,
    dessert: 4,
  };

  return rows
    .filter((row) => row.scheduleAvailable)
    .sort((a, b) => {
      const rank = (categoryRank[a.category] ?? 9) - (categoryRank[b.category] ?? 9);
      return rank !== 0 ? rank : a.name.localeCompare(b.name);
    })
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: row.category as MenuItemDto['category'],
      unitLabel: row.unitLabel,
      price: row.price,
      imageUrl: row.imageUrl,
      isAvailable: row.isActive && row.scheduleAvailable,
      portionsRemaining,
    }));
}

/** Dipakai modul order untuk memvalidasi & mengambil harga dari sumbernya. */
export async function getMenuItemsByIds(exec: Executor, ids: string[]): Promise<CatalogItem[]> {
  if (ids.length === 0) return [];
  const rows = await exec.select().from(menuItems).where(inArray(menuItems.id, ids));
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category as MenuItemDto['category'],
    unitLabel: row.unitLabel,
    price: row.price,
    imageUrl: row.imageUrl,
    isActive: row.isActive,
  }));
}

/** Item yang dijadwalkan tersedia pada tanggal tertentu. */
export async function getScheduledMenuIds(exec: Executor, date: string): Promise<Set<string>> {
  const rows = await exec
    .select({ menuItemId: menuSchedule.menuItemId, isAvailable: menuSchedule.isAvailable })
    .from(menuSchedule)
    .where(eq(menuSchedule.serviceDate, date));
  return new Set(rows.filter((r) => r.isAvailable).map((r) => r.menuItemId));
}

export async function scheduleMenuForDate(
  exec: Executor,
  date: string,
  menuItemIds: string[],
): Promise<void> {
  if (menuItemIds.length === 0) return;
  await exec
    .insert(menuSchedule)
    .values(menuItemIds.map((menuItemId) => ({ menuItemId, serviceDate: date, isAvailable: true })))
    .onConflictDoNothing();
}

export async function listAllMenuItems(exec: Executor): Promise<CatalogItem[]> {
  const rows = await exec.select().from(menuItems).orderBy(menuItems.category, menuItems.name);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category as MenuItemDto['category'],
    unitLabel: row.unitLabel,
    price: row.price,
    imageUrl: row.imageUrl,
    isActive: row.isActive,
  }));
}

/** Item yang aktif tetapi belum punya jadwal untuk tanggal tersebut. */
export async function missingScheduleItemIds(exec: Executor, date: string): Promise<string[]> {
  const scheduled = await getScheduledMenuIds(exec, date);
  const all = await listAllMenuItems(exec);
  return all.filter((item) => item.isActive && !scheduled.has(item.id)).map((item) => item.id);
}

const CATEGORY_RANK: Record<string, number> = { package: 0, main: 1, side: 2, drink: 3, dessert: 4 };

/** Daftar semua hidangan aktif + status jadwal pada tanggal (untuk admin). */
export async function getMenuAvailabilityForDate(
  exec: Executor,
  date: string,
): Promise<MenuAvailabilityItemDto[]> {
  const items = await exec.select().from(menuItems).where(eq(menuItems.isActive, true));
  const schedule = await exec.select().from(menuSchedule).where(eq(menuSchedule.serviceDate, date));
  const byItem = new Map(schedule.map((row) => [row.menuItemId, row]));

  return items
    .sort((a, b) => {
      const rank = (CATEGORY_RANK[a.category] ?? 9) - (CATEGORY_RANK[b.category] ?? 9);
      return rank !== 0 ? rank : a.name.localeCompare(b.name);
    })
    .map((item) => {
      const row = byItem.get(item.id);
      return {
        id: item.id,
        slug: item.slug,
        name: item.name,
        description: item.description,
        category: item.category as MenuItemDto['category'],
        unitLabel: item.unitLabel,
        price: item.price,
        imageUrl: item.imageUrl,
        isAvailable: row?.isAvailable ?? false,
        isScheduled: Boolean(row),
        portionsRemaining: null,
      };
    });
}

export async function setMenuAvailabilityForDate(
  exec: Executor,
  date: string,
  updates: Array<{ menuItemId: string; isAvailable: boolean }>,
  actor: { id?: string | null; label: string },
): Promise<MenuAvailabilityItemDto[]> {
  const uniqueIds = [...new Set(updates.map((update) => update.menuItemId))];
  const known = await getMenuItemsByIds(exec, uniqueIds);
  if (known.length !== uniqueIds.length) {
    throw new AppError('VALIDATION_ERROR', 'Ada hidangan yang tidak dikenal pada permintaan menu.');
  }

  for (const update of updates) {
    await exec
      .insert(menuSchedule)
      .values({ menuItemId: update.menuItemId, serviceDate: date, isAvailable: update.isAvailable })
      .onConflictDoUpdate({
        target: [menuSchedule.menuItemId, menuSchedule.serviceDate],
        set: { isAvailable: update.isAvailable },
      });
  }

  await recordAudit(exec, {
    actor: { type: 'staff', id: actor.id ?? null, label: actor.label },
    entity: 'menu_schedule',
    entityId: date,
    action: 'menu_availability_updated',
    after: { date, items: updates },
  });

  return getMenuAvailabilityForDate(exec, date);
}

/* ── CRUD katalog untuk dashboard ────────────────────────────────────── */

function toAdminMenuDto(row: typeof menuItems.$inferSelect, scheduleCount: number): AdminMenuItemDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category as MenuItemDto['category'],
    unitLabel: row.unitLabel,
    price: row.price,
    imageUrl: row.imageUrl,
    isAvailable: row.isActive,
    isActive: row.isActive,
    scheduleCount,
    portionsRemaining: null,
  };
}

async function scheduleCountFor(exec: Executor, menuItemId: string): Promise<number> {
  const result = await exec.execute(sql`
    SELECT count(*)::int AS count
    FROM menu_schedule
    WHERE menu_item_id = ${menuItemId} AND service_date >= ${todayWib()}
  `);
  return Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
}

async function uniqueMenuSlug(exec: Executor, name: string): Promise<string> {
  const base = slugify(name) || 'menu';
  let candidate = base;
  let suffix = 1;
  while (true) {
    const [existing] = await exec
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(eq(menuItems.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

/**
 * Menu baru otomatis dijadwalkan untuk N hari ke depan (default 14) agar
 * langsung tampil di storefront. Admin tetap bisa mematikan per tanggal
 * lewat "Pengaturan hari".
 */
async function scheduleUpcomingDates(exec: Executor, menuItemId: string): Promise<void> {
  const configured = Number(await getSetting(exec, 'catalog.days_ahead'));
  const daysAhead = Number.isFinite(configured) && configured > 0 ? configured : 14;
  const start = todayWib();
  const dates = Array.from({ length: daysAhead }, (_, index) => addDays(start, index));
  await exec
    .insert(menuSchedule)
    .values(dates.map((serviceDate) => ({ menuItemId, serviceDate, isAvailable: true })))
    .onConflictDoNothing();
}

export async function listAdminMenuItems(exec: Executor): Promise<AdminMenuItemDto[]> {
  const rows = await exec.select().from(menuItems).orderBy(menuItems.name);
  const counts = await exec
    .select({ menuItemId: menuSchedule.menuItemId, count: sql<number>`count(*)::int` })
    .from(menuSchedule)
    .where(gte(menuSchedule.serviceDate, todayWib()))
    .groupBy(menuSchedule.menuItemId);
  const countById = new Map(counts.map((row) => [row.menuItemId, Number(row.count)]));

  return rows
    .map((row) => toAdminMenuDto(row, countById.get(row.id) ?? 0))
    .sort((a, b) => {
      const rank = (CATEGORY_RANK[a.category] ?? 9) - (CATEGORY_RANK[b.category] ?? 9);
      return rank !== 0 ? rank : a.name.localeCompare(b.name);
    });
}

export async function createMenuItem(
  exec: Executor,
  input: AdminMenuCreateInput,
  actor: { id?: string | null; label: string },
): Promise<AdminMenuItemDto> {
  const slug = await uniqueMenuSlug(exec, input.name);
  const [row] = await exec
    .insert(menuItems)
    .values({
      slug,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      category: input.category,
      unitLabel: input.unitLabel?.trim() || 'porsi',
      price: input.price,
      imageUrl: input.imageUrl?.trim() ? input.imageUrl.trim() : null,
      isActive: input.isActive,
    })
    .returning();

  if (!row) throw new AppError('INTERNAL_ERROR', 'Gagal menyimpan hidangan.');
  if (row.isActive) await scheduleUpcomingDates(exec, row.id);

  await recordAudit(exec, {
    actor: { type: 'staff', id: actor.id ?? null, label: actor.label },
    entity: 'menu_item',
    entityId: row.id,
    action: 'menu_created',
    after: { name: row.name, category: row.category, price: row.price, isActive: row.isActive },
  });

  return toAdminMenuDto(row, await scheduleCountFor(exec, row.id));
}

export async function updateMenuItem(
  exec: Executor,
  id: string,
  patch: AdminMenuUpdateInput,
  actor: { id?: string | null; label: string },
): Promise<AdminMenuItemDto> {
  const [before] = await exec.select().from(menuItems).where(eq(menuItems.id, id)).limit(1);
  if (!before) throw new AppError('NOT_FOUND', 'Hidangan tidak ditemukan.');

  const values: Partial<typeof menuItems.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.description !== undefined) values.description = patch.description.trim();
  if (patch.category !== undefined) values.category = patch.category;
  if (patch.unitLabel !== undefined) values.unitLabel = patch.unitLabel.trim() || 'porsi';
  if (patch.price !== undefined) values.price = patch.price;
  if (patch.imageUrl !== undefined) values.imageUrl = patch.imageUrl.trim() ? patch.imageUrl.trim() : null;
  if (patch.isActive !== undefined) values.isActive = patch.isActive;

  const [row] = await exec.update(menuItems).set(values).where(eq(menuItems.id, id)).returning();
  if (!row) throw new AppError('INTERNAL_ERROR', 'Gagal memperbarui hidangan.');

  const reactivated = before.isActive === false && row.isActive === true;
  if (reactivated) await scheduleUpcomingDates(exec, row.id);

  await recordAudit(exec, {
    actor: { type: 'staff', id: actor.id ?? null, label: actor.label },
    entity: 'menu_item',
    entityId: row.id,
    action: 'menu_updated',
    before: {
      name: before.name,
      description: before.description,
      category: before.category,
      price: before.price,
      imageUrl: before.imageUrl,
      isActive: before.isActive,
    },
    after: {
      name: row.name,
      description: row.description,
      category: row.category,
      price: row.price,
      imageUrl: row.imageUrl,
      isActive: row.isActive,
    },
  });

  return toAdminMenuDto(row, await scheduleCountFor(exec, row.id));
}

/** Soft delete: order lama menyimpan snapshot nama/harga, jadi aman. */
export async function archiveMenuItem(
  exec: Executor,
  id: string,
  actor: { id?: string | null; label: string },
): Promise<AdminMenuItemDto> {
  return updateMenuItem(exec, id, { isActive: false }, actor);
}

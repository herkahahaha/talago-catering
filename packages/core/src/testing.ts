import { createDatabase, type Database, type DbHandle } from './db/client';
import { resetDatabase } from './db/reset';
import { ensureDefaultSettings } from './modules/settings/index';
import { createStaffUser } from './modules/auth/index';
import { menuItems, menuSchedule, serviceZones } from './db/schema';
import { ensureDays } from './modules/capacity/index';
import { replaceWindows } from './modules/delivery/index';
import { addDays, todayWib } from './lib/time';

export interface TestContext {
  handle: DbHandle;
  db: Database;
  date: string;
  dayAfter: string;
  menu: { ayam: { id: string; price: number }; nasi: { id: string; price: number } };
  adminId: string;
}

const TEST_MENU = [
  { slug: 'ayam-bakar-test', name: 'Ayam Bakar Test', category: 'main', price: 25_000 },
  { slug: 'nasi-test', name: 'Nasi Test', category: 'side', price: 8_000 },
];

/** Database tes bersih + fixture minimal. Aman dijalankan berulang. */
export async function setupTestDatabase(connectionString?: string): Promise<TestContext> {
  const url =
    connectionString ??
    process.env.DATABASE_URL_TEST ??
    process.env.DATABASE_URL ??
    'postgres://catering:catering_dev_pw@127.0.0.1:5432/catering_test';

  await resetDatabase(url);
  const handle = createDatabase(url, { max: 30 });
  const db = handle.db;

  await ensureDefaultSettings(db);

  const admin = await createStaffUser(db, {
    name: 'Admin Test',
    email: 'admin-test@catering.local',
    password: 'admin-test-password',
    role: 'admin',
  });

  await db.insert(serviceZones).values({
    name: 'Pontianak Test',
    city: 'Pontianak',
    fee: 0,
    freeDelivery: true,
    centerLat: -0.0263,
    centerLng: 109.3425,
    radiusKm: 20,
    districts: ['Pontianak Kota', 'Pontianak Selatan'],
  });

  for (const item of TEST_MENU) {
    await db
      .insert(menuItems)
      .values({ ...item, description: 'Menu tes' })
      .onConflictDoNothing();
  }

  const items = await db.select().from(menuItems);
  const ayam = items.find((item) => item.slug === 'ayam-bakar-test');
  const nasi = items.find((item) => item.slug === 'nasi-test');
  if (!ayam || !nasi) throw new Error('Fixture menu tes gagal dibuat.');

  const date = addDays(todayWib(), 5);
  const dayAfter = addDays(todayWib(), 6);
  await ensureDays(db, [date, dayAfter]);

  for (const day of [date, dayAfter]) {
    await db
      .insert(menuSchedule)
      .values([ayam.id, nasi.id].map((menuItemId) => ({ menuItemId, serviceDate: day, isAvailable: true })))
      .onConflictDoNothing();
    await replaceWindows(db, day, [
      { label: 'Siang (11.00–13.00)', startTime: '11:00', endTime: '13:00', maxStops: 4 },
    ]);
  }

  return {
    handle,
    db,
    date,
    dayAfter,
    menu: {
      ayam: { id: ayam.id, price: ayam.price },
      nasi: { id: nasi.id, price: nasi.price },
    },
    adminId: admin.id,
  };
}

export async function teardownTestDatabase(ctx: TestContext): Promise<void> {
  await ctx.handle.close();
}

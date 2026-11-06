import { count } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import { getEnv } from './env';
import { closeDatabase, createDatabase, withTransaction } from './db/client';
import { menuItems, orders, serviceZones } from './db/schema';
import { ensureDefaultSettings } from './modules/settings/index';
import { createStaffUser } from './modules/auth/index';
import { ensureDays } from './modules/capacity/index';
import { replaceWindows } from './modules/delivery/index';
import { getScheduledMenuIds, getMenuItemsByIds, scheduleMenuForDate } from './modules/catalog/index';
import { ensureCustomer } from './modules/customers/index';
import { createPendingOrder, updateOrderStatusAdmin } from './modules/orders/index';
import { createPaymentForOrder } from './modules/payments/index';
import { settleMockPayment } from './modules/checkout/index';
import { addDays, dateRange, todayWib } from './lib/time';
import { randomToken } from './lib/ids';

interface SeedMenuItem {
  slug: string;
  name: string;
  description: string;
  category: 'main' | 'side' | 'drink' | 'dessert' | 'package';
  price: number;
}

const MENU: SeedMenuItem[] = [
  {
    slug: 'ayam-bakar-madu',
    name: 'Ayam Bakar Madu',
    description: 'Ayam kampung dibakar dengan bumbu madu dan rempah, disajikan hangat.',
    category: 'main',
    price: 25_000,
  },
  {
    slug: 'rendang-daging-sapi',
    name: 'Rendang Daging Sapi',
    description: 'Rendang dimasak perlahan enam jam dengan santan dan rempah pilihan.',
    category: 'main',
    price: 32_000,
  },
  {
    slug: 'sate-ayam',
    name: 'Sate Ayam',
    description: 'Sepuluh tusuk sate ayam dengan bumbu kacang khas Pontianak.',
    category: 'main',
    price: 28_000,
  },
  {
    slug: 'nasi-kuning',
    name: 'Nasi Kuning',
    description: 'Nasi kuning gurih dengan santan, serundeng, dan bawang goreng.',
    category: 'side',
    price: 8_000,
  },
  {
    slug: 'gado-gado',
    name: 'Gado-Gado',
    description: 'Sayuran segar dengan saus kacang dan kerupuk.',
    category: 'side',
    price: 18_000,
  },
  {
    slug: 'es-teh-manis',
    name: 'Es Teh Manis',
    description: 'Teh tubruk dingin, manisnya bisa disesuaikan.',
    category: 'drink',
    price: 5_000,
  },
  {
    slug: 'pisang-goreng-keju',
    name: 'Pisang Goreng Keju',
    description: 'Pisang raja goreng dengan taburan keju dan susu kental manis.',
    category: 'dessert',
    price: 12_000,
  },
  {
    slug: 'paket-syukuran',
    name: 'Paket Syukuran',
    description: 'Nasi kuning, ayam bakar, rendang, dan es teh untuk satu porsi.',
    category: 'package',
    price: 55_000,
  },
];

export async function seed(): Promise<void> {
  const env = getEnv();
  const handle = createDatabase();
  const db = handle.db;
  const today = todayWib();
  const dates = dateRange(addDays(today, 1), 14);

  try {
    await ensureDefaultSettings(db);

    const admin = await createStaffUser(db, {
      name: 'Admin Dapur',
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
      role: 'admin',
    });
    await createStaffUser(db, {
      name: 'Kepala Dapur',
      email: 'dapur@catering.local',
      password: 'dapur12345',
      role: 'kitchen',
    });
    await createStaffUser(db, {
      name: 'Kurir Satu',
      email: 'kurir@catering.local',
      password: 'kurir12345',
      role: 'courier',
    });

    const [zoneCount] = await db.select({ value: count() }).from(serviceZones);
    if (Number(zoneCount?.value ?? 0) === 0) {
      await db.insert(serviceZones).values({
        name: 'Pontianak Kota',
        city: 'Pontianak',
        fee: 0,
        freeDelivery: true,
        etaNote: 'Pengantaran hari yang sama untuk area kota.',
        centerLat: -0.0263,
        centerLng: 109.3425,
        radiusKm: 20,
        districts: [
          'Pontianak Kota',
          'Pontianak Selatan',
          'Pontianak Barat',
          'Pontianak Utara',
          'Pontianak Timur',
          'Sungai Raya',
          'Kubu Raya',
        ],
      });
    }

    for (const item of MENU) {
      await db.insert(menuItems).values(item).onConflictDoNothing({ target: menuItems.slug });
    }
    const allItems = await db.select().from(menuItems);
    if (allItems.length === 0) throw new Error('Seed menu gagal: katalog kosong.');

    for (const date of dates) {
      await scheduleMenuForDate(
        db,
        date,
        allItems.map((item) => item.id),
      );
      await replaceWindows(db, date, [
        { label: 'Siang (11.00–13.00)', startTime: '11:00', endTime: '13:00', maxStops: 10 },
        { label: 'Sore (15.00–17.00)', startTime: '15:00', endTime: '17:00', maxStops: 10 },
        { label: 'Malam (18.00–20.00)', startTime: '18:00', endTime: '20:00', maxStops: 8 },
      ]);
    }
    await ensureDays(db, dates);

    const [existingOrders] = await db.select({ value: count() }).from(orders);
    if (Number(existingOrders?.value ?? 0) > 0) {
      console.log('Seed data demo dilewati: sudah ada order.');
      return;
    }

    const demoDate = dates[2] ?? dates[0]!;
    const menu = await getMenuItemsByIds(
      db,
      allItems.map((item) => item.id),
    );
    const scheduled = await getScheduledMenuIds(db, demoDate);
    const sellable = menu.filter((item) => scheduled.has(item.id));
    const ayam = sellable.find((item) => item.slug === 'ayam-bakar-madu');
    const rendang = sellable.find((item) => item.slug === 'rendang-daging-sapi');
    const nasi = sellable.find((item) => item.slug === 'nasi-kuning');
    if (!ayam || !rendang || !nasi) throw new Error('Seed demo: menu wajib tidak lengkap.');

    const customerA = await ensureCustomer(db, {
      name: 'Ibu Rina',
      phone: '081234567890',
      email: 'rina@example.com',
    });
    const customerB = await ensureCustomer(db, {
      name: 'Pak Budi',
      phone: '081298765432',
    });

    const line = (product: typeof ayam, portions: number) => ({
      menuItemId: product.id,
      nameSnapshot: product.name,
      unitPrice: product.price,
      portions,
      lineTotal: product.price * portions,
    });

    const baseOrder = (
      customerId: string,
      recipientName: string,
      recipientPhone: string,
      items: Array<ReturnType<typeof line> & { menuItemId: string }>,
      notes: string | null,
    ) => {
      const portions = items.reduce((sum, item) => sum + item.portions, 0);
      const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
      return {
        customerId,
        serviceDate: demoDate,
        source: 'web' as const,
        statusToken: randomToken(32),
        items,
        portions,
        subtotal,
        deliveryFee: 0,
        total: subtotal,
        deliveryWindowId: null,
        addressLine: 'Jl. Gajah Mada No. 12, Pontianak Kota',
        district: 'Pontianak Kota',
        recipientName,
        recipientPhone,
        notes,
        consentAt: new Date(),
        createdIp: '127.0.0.1',
        hold: true,
        partition: 'regular' as const,
        holdMinutes: 60,
      };
    };

    // Dibuat berurutan agar plafon hold (50% max_regular) tidak terlampaui
    // sebelum pembayaran pertama diselesaikan.
    const paidOrder = await withTransaction(db, (tx) =>
      createPendingOrder(
        tx,
        baseOrder(customerB.id, 'Pak Budi', '+6281298765432', [line(ayam, 30), line(nasi, 30)], null),
      ),
    );
    const paidPayment = await createPaymentForOrder(db, paidOrder, { method: 'qris' });
    await settleMockPayment(db, paidPayment.payment.gatewayRef);

    const productionOrder = await withTransaction(db, (tx) =>
      createPendingOrder(
        tx,
        baseOrder(
          customerA.id,
          'Ibu Rina',
          '+6281234567890',
          [line(rendang, 40), line(nasi, 40)],
          'Pesanan kantor.',
        ),
      ),
    );
    const productionPayment = await createPaymentForOrder(db, productionOrder, { method: 'va' });
    await settleMockPayment(db, productionPayment.payment.gatewayRef);
    await updateOrderStatusAdmin(db, {
      orderId: productionOrder.id,
      status: 'in_production',
      note: 'Dapur mulai menyiapkan.',
      actor: { id: admin.id, label: 'Seed', role: 'admin' },
    });

    const pendingOrder = await withTransaction(db, (tx) =>
      createPendingOrder(
        tx,
        baseOrder(
          customerA.id,
          'Ibu Rina',
          '+6281234567890',
          [line(ayam, 25), line(rendang, 15), line(nasi, 10)],
          'Sambal dipisah, tanpa lada.',
        ),
      ),
    );
    await createPaymentForOrder(db, pendingOrder, { method: 'qris' });

    console.log('Seed selesai.');
    console.log(`  Admin : ${env.ADMIN_EMAIL} / ${env.ADMIN_PASSWORD}`);
    console.log('  Dapur : dapur@catering.local / dapur12345');
    console.log('  Kurir : kurir@catering.local / kurir12345');
    console.log(`  Tanggal demo: ${demoDate}`);
  } finally {
    await closeDatabase();
  }
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectRun) {
  seed()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Seed gagal:', error);
      process.exit(1);
    });
}

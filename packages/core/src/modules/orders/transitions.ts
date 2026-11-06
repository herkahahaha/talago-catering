import { eq } from 'drizzle-orm';
import type { OrderStatus, StaffRole } from '@catering/contracts';
import { orders } from './schema';
import type { Database, Executor } from '../../db/client';
import { AppError } from '../../lib/ids';
import { assertForwardTransition } from './state';
import { getDayRow } from '../capacity/index';
import { setDeliveryStatus } from '../delivery/index';
import { recordAudit } from '../audit/index';

const ROLE_BY_STATUS: Partial<Record<OrderStatus, StaffRole[]>> = {
  in_production: ['admin', 'kitchen'],
  out_for_delivery: ['admin', 'courier'],
  delivered: ['admin', 'courier'],
};

export interface StatusUpdateActor {
  id: string;
  label: string;
  role: StaffRole;
}

/**
 * Perpindahan status maju satu arah (PRD §4.1). Koreksi mundur hanya
 * lewat admin dan tercatat di audit_log; pembatalan memakai jalur cancel.
 */
export async function updateOrderStatusAdmin(
  exec: Database,
  input: {
    orderId: string;
    status: OrderStatus;
    note?: string;
    actor: StatusUpdateActor;
    requestId?: string | null;
  },
): Promise<typeof orders.$inferSelect> {
  return exec.transaction(async (tx) => {
    const [row] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!row) throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');

    const allowedRoles = ROLE_BY_STATUS[input.status];
    if (allowedRoles && !allowedRoles.includes(input.actor.role)) {
      throw new AppError('FORBIDDEN', 'Peran Anda tidak boleh memindahkan status ini.', {
        details: { status: input.status, role: input.actor.role },
      });
    }

    assertForwardTransition(row.status, input.status);

    const day = await getDayRow(tx, row.serviceDate);
    const cutoffPassed = day ? day.cutOffAt.getTime() <= Date.now() : false;
    if (cutoffPassed && input.actor.role !== 'admin') {
      throw new AppError('CUTOFF_PASSED', 'Cut-off sudah lewat. Perubahan status hanya oleh admin.', {
        hint: 'Minta admin menandai status setelah produksi dikunci.',
      });
    }

    const patch: Partial<typeof orders.$inferInsert> = { status: input.status, updatedAt: new Date() };
    if (input.status === 'delivered') patch.updatedAt = new Date();

    const [updated] = await tx.update(orders).set(patch).where(eq(orders.id, row.id)).returning();
    if (!updated) throw new AppError('INTERNAL_ERROR', 'Gagal memperbarui status order.');

    if (input.status === 'out_for_delivery' || input.status === 'delivered') {
      await setDeliveryStatus(tx, row.id, input.status);
    }

    await recordAudit(tx, {
      actor: { type: 'staff', id: input.actor.id, label: input.actor.label },
      entity: 'order',
      entityId: row.id,
      action: 'status_changed',
      before: { status: row.status },
      after: { status: input.status, orderNo: row.orderNo, note: input.note ?? null },
      requestId: input.requestId ?? null,
    });

    return updated;
  });
}

/** Admin boleh membatalkan setelah cut-off; UI menampilkan konfirmasi + alasan. */
export async function requireAdmin(role: StaffRole): Promise<void> {
  if (role !== 'admin') throw new AppError('FORBIDDEN', 'Aksi ini hanya untuk admin.');
}

export async function getOrderRowWithCustomer(exec: Executor, orderId: string) {
  const [row] = await exec.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!row) throw new AppError('NOT_FOUND', 'Order tidak ditemukan.');
  return row;
}

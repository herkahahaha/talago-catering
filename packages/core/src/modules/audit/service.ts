import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { AuditEntryDto } from '@catering/contracts';
import { auditLog } from './schema';
import type { Executor } from '../../db/client';

export interface AuditActor {
  type: 'staff' | 'customer' | 'system' | 'webhook';
  id?: string | null;
  label: string;
}

export interface AuditInput {
  actor: AuditActor;
  entity: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestId?: string | null;
}

export async function recordAudit(exec: Executor, input: AuditInput): Promise<void> {
  await exec.insert(auditLog).values({
    actorType: input.actor.type,
    actorId: input.actor.id ?? null,
    actorLabel: input.actor.label,
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
    requestId: input.requestId ?? null,
  });
}

export interface AuditFilter {
  entity?: string;
  entityId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}

export async function listAudit(exec: Executor, filter: AuditFilter = {}): Promise<AuditEntryDto[]> {
  const conditions = [];
  if (filter.entity) conditions.push(eq(auditLog.entity, filter.entity));
  if (filter.entityId) conditions.push(eq(auditLog.entityId, filter.entityId));
  if (filter.fromDate) conditions.push(gte(auditLog.at, filter.fromDate));
  if (filter.toDate) conditions.push(lte(auditLog.at, filter.toDate));

  const rows = await exec
    .select()
    .from(auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.at))
    .limit(filter.limit ?? 100);

  return rows.map((row) => ({
    id: row.id,
    at: row.at.toISOString(),
    actorType: row.actorType,
    actorLabel: row.actorLabel,
    entity: row.entity,
    entityId: row.entityId,
    action: row.action,
    before: row.before ?? null,
    after: row.after ?? null,
    orderNo: typeof row.after?.orderNo === 'string' ? row.after.orderNo : null,
  }));
}

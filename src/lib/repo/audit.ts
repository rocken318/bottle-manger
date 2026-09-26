import type { Db } from '../db/types';

export interface AuditEntry {
  staffId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details?: Record<string, unknown>;
}

export interface AuditLog {
  id: string;
  staffName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
}

export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_logs (staff_id, action, target_type, target_id, details)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [entry.staffId, entry.action, entry.targetType, entry.targetId, JSON.stringify(entry.details ?? {})],
  );
}

export async function listAuditLogs(db: Db, limit: number): Promise<AuditLog[]> {
  return db.query<AuditLog>(
    `select a.id, s.name as "staffName", a.action, a.target_type as "targetType",
            a.target_id as "targetId", a.details, a.created_at as "createdAt"
       from audit_logs a
       left join staff s on s.id = a.staff_id
      order by a.created_at desc, a.id
      limit $1`,
    [limit],
  );
}

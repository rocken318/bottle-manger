import type { NextRequest } from 'next/server';
import { MONTHLY_HEADER, monthlyCsvRows } from '@/lib/costs/csvRows';
import { loadMonthlyReport } from '@/lib/repo/costs';
import { getCostSettings } from '@/lib/repo/settings';
import { costCsvResponse } from '../shared';

export function GET(request: NextRequest) {
  return costCsvResponse(request, 'monthly', async (db, filter) => {
    const settings = await getCostSettings(db);
    const report = await loadMonthlyReport(db, filter, settings.taxRate);
    return { header: MONTHLY_HEADER, rows: monthlyCsvRows(report.rows) };
  });
}

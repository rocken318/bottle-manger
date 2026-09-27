import type { NextRequest } from 'next/server';
import { PURCHASE_HEADER, purchaseCsvRows } from '@/lib/costs/csvRows';
import { listPurchaseDetails } from '@/lib/repo/costs';
import { getCostSettings } from '@/lib/repo/settings';
import { costCsvResponse } from '../shared';

export function GET(request: NextRequest) {
  return costCsvResponse(request, 'purchases', async (db, filter) => {
    const [settings, details] = await Promise.all([getCostSettings(db), listPurchaseDetails(db, filter)]);
    return { header: PURCHASE_HEADER, rows: purchaseCsvRows(details, settings.taxRate) };
  });
}

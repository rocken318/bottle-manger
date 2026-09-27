import type { NextRequest } from 'next/server';
import { CLOSING_STOCK_HEADER, closingStockCsvRows } from '@/lib/costs/csvRows';
import { getMonthLines } from '@/lib/repo/costs';
import { listDrinks } from '@/lib/repo/drinks';
import { listLocations } from '@/lib/repo/locations';
import { costCsvResponse } from '../shared';

export function GET(request: NextRequest) {
  return costCsvResponse(request, 'closing-stock', async (db, filter) => {
    const [lines, locations, drinks] = await Promise.all([
      getMonthLines(db, filter),
      listLocations(db, { includeInactive: true }),
      listDrinks(db, { includeInactive: true }),
    ]);
    return { header: CLOSING_STOCK_HEADER, rows: closingStockCsvRows(lines, locations, drinks) };
  });
}

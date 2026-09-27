import type { NextRequest } from 'next/server';
import { DISPOSE_HEADER, disposeCsvRows } from '@/lib/costs/csvRows';
import { listDisposeDetails } from '@/lib/repo/costs';
import { costCsvResponse } from '../shared';

export function GET(request: NextRequest) {
  return costCsvResponse(request, 'dispose', async (db, filter) => ({
    header: DISPOSE_HEADER,
    rows: disposeCsvRows(await listDisposeDetails(db, filter)),
  }));
}

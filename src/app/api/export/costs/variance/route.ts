import type { NextRequest } from 'next/server';
import { VARIANCE_HEADER, varianceCsvRows } from '@/lib/costs/csvRows';
import { listVarianceDetails } from '@/lib/repo/costs';
import { costCsvResponse } from '../shared';

export function GET(request: NextRequest) {
  return costCsvResponse(request, 'variance', async (db, filter) => ({
    header: VARIANCE_HEADER,
    rows: varianceCsvRows(await listVarianceDetails(db, filter)),
  }));
}

import { Inject, Injectable } from '@nestjs/common';
import { QueryError } from '@oss-scp/platform-db';
import type { AnyListRecordsResult, QueryRecord, RecordQuery } from '@oss-scp/platform-db';

export const RECORD_QUERY = Symbol('RECORD_QUERY');

@Injectable()
export class RecordQueryService {
  constructor(@Inject(RECORD_QUERY) private readonly query: RecordQuery) {}
  list(pluginId: string | undefined, sourceId: string | undefined, dataType: string | undefined, rawLimit: string | undefined, cursor: string | undefined, rawPage?: string): Promise<AnyListRecordsResult> {
    if (rawPage !== undefined && (typeof rawPage !== 'string' || !/^\d+$/.test(rawPage))) throw new QueryError('INVALID_QUERY');
    const page = rawPage === undefined ? undefined : Number(rawPage);
    const limit = rawLimit === undefined ? undefined : /^\d+$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
    return this.query.listRecords({ pluginId: pluginId ?? '', sourceId: sourceId ?? '', dataType: dataType ?? '', ...(limit === undefined ? {} : { limit }), ...(cursor === undefined ? {} : { cursor }), ...(page === undefined ? {} : { page }) });
  }
  get(id: string): Promise<QueryRecord | null> { return this.query.getRecord(id); }
}

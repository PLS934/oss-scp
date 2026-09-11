import { Inject, Injectable } from '@nestjs/common';
import type { ListRecordsResult, QueryRecord, RecordQuery } from '@oss-scp/platform-db';

export const RECORD_QUERY = Symbol('RECORD_QUERY');

@Injectable()
export class RecordQueryService {
  constructor(@Inject(RECORD_QUERY) private readonly query: RecordQuery) {}
  list(pluginId: string | undefined, sourceId: string | undefined, dataType: string | undefined, rawLimit: string | undefined): Promise<ListRecordsResult> {
    const limit = rawLimit === undefined ? undefined : /^\d+$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
    return this.query.listRecords({ pluginId: pluginId ?? '', sourceId: sourceId ?? '', dataType: dataType ?? '', ...(limit === undefined ? {} : { limit }) });
  }
  get(id: string): Promise<QueryRecord | null> { return this.query.getRecord(id); }
}

import { BadRequestException, Controller, Get, HttpException, Param, Query, ServiceUnavailableException } from '@nestjs/common';
import { QueryError } from '@oss-scp/platform-db';
import { RecordQueryService } from './record-query.service';

const errors = {
  INVALID_QUERY: { statusCode: 400, code: 'INVALID_QUERY', message: '조회 입력을 확인하세요.' },
  INVALID_CURSOR: { statusCode: 400, code: 'INVALID_CURSOR', message: '목록 cursor를 확인하세요.' },
  RECORD_NOT_FOUND: { statusCode: 404, code: 'RECORD_NOT_FOUND', message: '저장 레코드를 찾을 수 없습니다.' },
  QUERY_FAILED: { statusCode: 503, code: 'QUERY_FAILED', message: '플랫폼 데이터 조회에 실패했습니다.' },
} as const;

function mapError(error: unknown): never {
  if (error instanceof QueryError && error.code === 'INVALID_QUERY') throw new BadRequestException(errors.INVALID_QUERY);
  if (error instanceof QueryError && error.code === 'INVALID_CURSOR') throw new BadRequestException(errors.INVALID_CURSOR);
  throw new ServiceUnavailableException(errors.QUERY_FAILED);
}

@Controller('api/v1/records')
export class RecordQueryController {
  constructor(private readonly records: RecordQueryService) {}
  @Get()
  async list(@Query('pluginId') pluginId?: string, @Query('sourceId') sourceId?: string, @Query('dataType') dataType?: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string, @Query('page') page?: string) {
    try { return await this.records.list(pluginId, sourceId, dataType, limit, cursor, page); } catch (error) { mapError(error); }
  }
  @Get(':id')
  async detail(@Param('id') id: string) {
    try {
      const found = await this.records.get(id);
      if (!found) throw new HttpException(errors.RECORD_NOT_FOUND, 404);
      return found;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      mapError(error);
    }
  }
}

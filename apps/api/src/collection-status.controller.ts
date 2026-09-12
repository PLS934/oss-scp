import { Controller, Get } from '@nestjs/common';
import { CollectionStatusService } from './collection-status.service';

@Controller('api/v1/collection-status')
export class CollectionStatusController {
  constructor(private readonly service: CollectionStatusService) {}
  @Get() list() { return this.service.list(); }
}

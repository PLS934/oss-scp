import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('api/v1')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  getHealth(): { status: string } {
    return this.healthService.getStatus();
  }

  @Get('ready')
  async getReadiness(): Promise<{ status: string }> {
    const result = await this.healthService.getReadiness();
    if (result.status !== 'ready') throw new ServiceUnavailableException(result);
    return result;
  }
}

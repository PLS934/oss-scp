import { Inject, Injectable } from '@nestjs/common';
import type { PlatformDbConnection } from '@oss-scp/platform-db';

export const PLATFORM_DB_CONNECTION = Symbol('PLATFORM_DB_CONNECTION');

@Injectable()
export class HealthService {
  constructor(@Inject(PLATFORM_DB_CONNECTION) private readonly connection: PlatformDbConnection) {}

  getStatus(): { status: string } {
    return { status: 'ok' };
  }

  async getReadiness(): Promise<{ status: string }> {
    return { status: await this.connection.checkReady() ? 'ready' : 'not_ready' };
  }
}

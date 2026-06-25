import { Controller, Get } from '@nestjs/common';

/** Liveness probe used by local dev, CI, and orchestrators. */
@Controller()
export class HealthController {
  @Get('healthz')
  healthz(): { status: 'ok'; service: 'api' } {
    return { status: 'ok', service: 'api' };
  }
}

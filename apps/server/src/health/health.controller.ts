import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';

interface HealthStatus {
  status: 'ok';
  service: string;
  ts: string;
}

/** Unversioned liveness probe at `/api/healthz` (canon §10 observability). */
@Controller({ path: 'healthz', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'cowatch-server',
      ts: new Date().toISOString(),
    };
  }
}

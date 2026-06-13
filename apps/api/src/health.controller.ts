import { Controller, Get } from '@nestjs/common';

/**
 * Health check — liveness / readiness for orchestrators (Docker, K8s).
 * Returns 200 if the process is up; deep checks live in the metrics lib.
 */
@Controller('health')
export class HealthController {
  @Get()
  liveness() {
    return { status: 'ok', at: new Date().toISOString() };
  }

  @Get('ready')
  readiness() {
    return { status: 'ready', at: new Date().toISOString() };
  }
}

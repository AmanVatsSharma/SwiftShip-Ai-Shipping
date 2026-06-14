/**
 * DI token for the shared ioredis client used by the rate-cache and
 * circuit-breaker services.
 *
 * `libs/platform/queues/` already instantiates an `IORedis` client
 * internally for BullMQ but does not export it. To keep the queue lib
 * single-purpose and avoid cross-platform coupling, we instantiate our
 * own client here off `REDIS_URL` and rely on ioredis' built-in
 * connection pool. Multiple clients to the same Redis are fine.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

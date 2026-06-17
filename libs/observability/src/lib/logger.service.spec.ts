import { StructuredLogger } from './logger.service';
import { runWithCorrelation, getCorrelationContext } from './correlation/context';

describe('StructuredLogger (SS-028)', () => {
  let logSpy: jest.SpyInstance;
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('emits JSON with the canonical field set', () => {
    const logger = new StructuredLogger();
    logger.log('hello');

    expect(logSpy).toHaveBeenCalled();
    const payload = JSON.parse(logSpy.mock.calls[0][0]);
    expect(payload.level).toBe('log');
    expect(payload.msg).toBe('hello');
    expect(typeof payload.ts).toBe('string');
    expect(payload.pid).toBe(process.pid);
    expect(payload.context).toBe('app');
  });

  it('propagates correlation / trace ids from AsyncLocalStorage', () => {
    const logger = new StructuredLogger();
    runWithCorrelation(
      { correlationId: 'corr-1', traceId: 'trace-1', spanId: 'span-1', tenantId: 42 },
      () => {
        logger.log('inside ALS');
      },
    );
    const payload = JSON.parse(logSpy.mock.calls[0][0]);
    expect(payload.correlationId).toBe('corr-1');
    expect(payload.traceId).toBe('trace-1');
    expect(payload.spanId).toBe('span-1');
    expect(payload.tenantId).toBe(42);
  });

  it('falls back to no fields outside ALS context', () => {
    const logger = new StructuredLogger();
    logger.log('outside');
    const payload = JSON.parse(logSpy.mock.calls[0][0]);
    expect(payload.correlationId).toBeUndefined();
    expect(payload.traceId).toBeUndefined();
  });

  it('withCorrelationId helper sets the ALS slot for the callback', () => {
    const logger = new StructuredLogger();
    expect(getCorrelationContext()).toBeUndefined();
    logger.withCorrelationId('x-1', () => {
      const ctx = getCorrelationContext();
      expect(ctx?.correlationId).toBe('x-1');
      logger.log('inside');
    });
    const payload = JSON.parse(logSpy.mock.calls[0][0]);
    expect(payload.correlationId).toBe('x-1');
  });

  it('error level writes to console.error', () => {
    const logger = new StructuredLogger();
    logger.error('boom', 'stack-trace');
    expect(errSpy).toHaveBeenCalled();
    const payload = JSON.parse(errSpy.mock.calls[0][0]);
    expect(payload.level).toBe('error');
    expect(payload.msg).toBe('boom');
    expect(payload.trace).toBe('stack-trace');
  });
});
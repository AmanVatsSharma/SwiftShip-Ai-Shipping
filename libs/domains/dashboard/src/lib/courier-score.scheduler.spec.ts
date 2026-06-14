import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { CourierScoreScheduler } from './courier-score.scheduler';
import { CourierScoreService } from './courier-score.service';

/**
 * SS-012 — `CourierScoreScheduler` unit tests.
 *
 * We mock `CourierScoreService.recomputeAll` (the only method the scheduler
 * calls) and verify the cron wires the right window, logs start/complete,
 * and swallows errors so a transient DB failure doesn't kill the host.
 */
describe('CourierScoreScheduler', () => {
  let scheduler: CourierScoreScheduler;
  let courierScore: jest.Mocked<CourierScoreService>;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourierScoreScheduler,
        {
          provide: CourierScoreService,
          useValue: {
            recomputeAll: jest.fn().mockResolvedValue({
              windowDays: 30,
              carriersProcessed: 5,
              carriersFailed: 0,
            }),
          },
        },
      ],
    }).compile();

    scheduler = module.get<CourierScoreScheduler>(CourierScoreScheduler);
    courierScore = module.get(CourierScoreService);

    // Spy on the Logger to verify the start/complete/error messages.
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  it('declares a daily 20:00 UTC cron expression', () => {
    expect(CourierScoreScheduler.CRON_EXPR).toBe('0 20 * * *');
    expect(CourierScoreScheduler.CRON_NAME).toBe('refresh-courier-scores');
    expect(CourierScoreScheduler.DEFAULT_WINDOW).toBe(30);
  });

  it('refreshDaily calls recomputeAll with a 30-day window', async () => {
    await scheduler.refreshDaily();
    expect(courierScore.recomputeAll).toHaveBeenCalledTimes(1);
    expect(courierScore.recomputeAll).toHaveBeenCalledWith(30);
  });

  it('refreshDaily logs a start message and a complete message on success', async () => {
    await scheduler.refreshDaily();
    const messages = logSpy.mock.calls.map((c) => c[0] as string);
    // Start message
    expect(messages.some((m) => m.includes('Starting daily courier score refresh'))).toBe(true);
    // Complete message (carries the count)
    expect(
      messages.some(
        (m) =>
          m.includes('Courier score refresh complete') &&
          m.includes('30d window') &&
          m.includes('processed=5'),
      ),
    ).toBe(true);
  });

  it('refreshDaily catches and logs errors (does not throw)', async () => {
    const errSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    courierScore.recomputeAll.mockRejectedValueOnce(new Error('db down'));

    // The whole point of the catch in the cron — this must not throw.
    await expect(scheduler.refreshDaily()).resolves.toBeUndefined();

    // The error was logged.
    const errMessages = errSpy.mock.calls.map((c) => c[0] as string);
    expect(
      errMessages.some(
        (m) => m.includes('Courier score refresh failed') && m.includes('db down'),
      ),
    ).toBe(true);
  });

  it('refreshDaily on success does not log an error', async () => {
    const errSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await scheduler.refreshDaily();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('refreshDaily invokes recomputeAll exactly once per cron tick', async () => {
    await scheduler.refreshDaily();
    await scheduler.refreshDaily();
    expect(courierScore.recomputeAll).toHaveBeenCalledTimes(2);
  });
});

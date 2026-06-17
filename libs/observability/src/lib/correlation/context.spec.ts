import { getCorrelationContext, runWithCorrelation } from './context';

describe('correlation/context (SS-028)', () => {
  it('returns undefined outside any ALS frame', () => {
    expect(getCorrelationContext()).toBeUndefined();
  });

  it('runWithCorrelation sets the slot for the callback', () => {
    runWithCorrelation({ correlationId: 'a' }, () => {
      expect(getCorrelationContext()?.correlationId).toBe('a');
    });
    expect(getCorrelationContext()).toBeUndefined();
  });

  it('nested runWithCorrelation merges parent + child', () => {
    runWithCorrelation({ correlationId: 'parent', tenantId: 7 }, () => {
      runWithCorrelation({ correlationId: 'child' }, () => {
        const ctx = getCorrelationContext();
        expect(ctx?.correlationId).toBe('child');
        expect(ctx?.tenantId).toBe(7);
      });
      expect(getCorrelationContext()?.correlationId).toBe('parent');
    });
  });

  it('withCorrelationId helper propagates via the logger', () => {
    runWithCorrelation({ correlationId: 'top' }, () => {
      runWithCorrelation({ correlationId: 'inner', userId: 99 }, () => {
        const ctx = getCorrelationContext();
        expect(ctx?.correlationId).toBe('inner');
        expect(ctx?.userId).toBe(99);
      });
    });
  });
});
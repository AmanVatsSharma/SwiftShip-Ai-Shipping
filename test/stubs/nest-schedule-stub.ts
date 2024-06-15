// Test-only stub for @nestjs/schedule.
// The real package is a host-app dep; in lib unit tests we just
// need a no-op decorator that doesn't blow up module resolution.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Cron = (_expr?: string): MethodDecorator => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  return () => {};
};

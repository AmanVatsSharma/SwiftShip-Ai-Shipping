/**
 * Minimal type stubs for the k6 built-in modules. k6 the binary
 * (https://github.com/grafana/k6) ships its own Go-runtime types
 * that aren't on npm, so we provide the minimum surface used by
 * the scenarios in this folder.
 *
 * The scenarios themselves don't need these declarations to run
 * (the k6 binary resolves `import 'k6/http'` at runtime) — they
 * exist so `npx tsc --noEmit -p loadtest/tsconfig.json` succeeds
 * in CI.
 */
declare module 'k6/http' {
  export interface Response {
    status: number;
    body: string | null;
    timings: {
      duration: number;
      waiting: number;
      sending: number;
      receiving: number;
      blocked: number;
    };
  }
  export function post(
    url: string,
    body: string | null,
    params?: Record<string, unknown>,
  ): Response;
  export function get(url: string, params?: Record<string, unknown>): Response;
}

declare module 'k6' {
  export const options: unknown;
  export function check(
    response: unknown,
    checks: Record<string, (arg: unknown) => boolean>,
    tags?: Record<string, string>,
  ): boolean;
  export default function (): void;
}

// k6 built-in globals — these are injected by the k6 runtime into the
// scope of every script, not exported by any module. They live in the
// global namespace, not on the `k6` module.
declare const __VU: number;
declare const __ITER: number;
declare const __ENV: Record<string, string | undefined>;

declare module 'k6/metrics' {
  export class Trend {
    constructor(name: string, isTime?: boolean);
    add(value: number): void;
  }
  export class Rate {
    constructor(name: string);
    add(value: boolean): void;
  }
  export class Counter {
    constructor(name: string);
    add(value: number): void;
  }
}

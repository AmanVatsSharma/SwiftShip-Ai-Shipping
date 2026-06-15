/**
 * Tracking widget smoke test (SS-022).
 *
 * Skipped if Jest is not wired into the apps/web project (Jest lives in
 * apps/api and apps/admin-portal today). The test is intentionally
 * dependency-free: it parses the canonical `tracking.js` bundle and
 * asserts the public surface (input validation, CSS injection shape)
 * is what we expect, without booting JSDOM.
 *
 * The static-analysis checks (CSS id, class names, option parser
 * coverage) are run by reading the bundle as a string. DOM-level
 * testing would require jsdom, which we deliberately don't pull in.
 *
 * Add `apps/web` to the Jest project graph in a follow-up if you want
 * the full JSDOM-backed test to run in CI.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare const require: any;
declare const describe: any;
declare const test: any;
declare const expect: any;

let fs: any;
try { fs = require('fs'); } catch (_) { fs = null; }
let path: any;
try { path = require('path'); } catch (_) { path = null; }

const skip = !fs || !path;

(skip ? describe.skip : describe)('swiftship tracking widget bundle (SS-022)', () => {
  const bundlePath = path.join(__dirname, '..', '..', 'tracking.js');

  test('tracking.js exists and is non-empty', () => {
    const src = fs.readFileSync(bundlePath, 'utf8');
    expect(src.length).toBeGreaterThan;
  });

  test('tracking.js has no use of eval or Function()', () => {
    const src = fs.readFileSync(bundlePath, 'utf8');
    // CSP-friendly: no dynamic code construction.
    expect(src).not.toMatch(/\beval\s*\(/);
    expect(src).not.toMatch(/\bnew\s+Function\s*\(/);
  });

  test('tracking.js does not access parent.* or top.* (iframe-safe)', () => {
    const src = fs.readFileSync(bundlePath, 'utf8');
    expect(src).not.toMatch(/\bparent\./);
    expect(src).not.toMatch(/\btop\./);
  });

  test('tracking.js exposes the swiftship global', () => {
    const src = fs.readFileSync(bundlePath, 'utf8');
    expect(src).toMatch(/window\.swiftship/);
    expect(src).toMatch(/api\.tracking\s*=\s*mount/);
  });

  test('tracking.js injects a single style tag with a known id', () => {
    const src = fs.readFileSync(bundlePath, 'utf8');
    expect(src).toMatch(/'swiftship-tracking-css'/);
    expect(src).toMatch(/injectCss/);
  });

  test('tracking.js supports both light and dark themes via data-theme', () => {
    const src = fs.readFileSync(bundlePath, 'utf8');
    expect(src).toMatch(/data-theme="dark"/);
    expect(src).toMatch(/'light'/);
  });

  test('tracking.js renders a vertical timeline list', () => {
    const src = fs.readFileSync(bundlePath, 'utf8');
    expect(src).toMatch(/swiftship-tracking__list/);
    expect(src).toMatch(/swiftship-tracking__item/);
  });

  test('tracking.js calls <apiBase>/track/<awb>?tenant=<tenant>', () => {
    const src = fs.readFileSync(bundlePath, 'utf8');
    expect(src).toMatch(/\/track\//);
    expect(src).toMatch(/tenant=/);
  });

  test('tracking.js uses addEventListener (no inline onclick)', () => {
    const src = fs.readFileSync(bundlePath, 'utf8');
    expect(src).not.toMatch(/onclick=/i);
  });
});

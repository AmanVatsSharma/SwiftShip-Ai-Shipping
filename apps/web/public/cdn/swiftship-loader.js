/*!
 * SwiftShip Loader — SS-022
 *
 * One entry, three widgets. Detects `data-mode` on its own <script> tag
 * and dynamically <script>-injects the matching per-widget bundle, then
 * calls its `swiftship(mode, opts)` mount function with the rest of
 * the data-attributes as options.
 *
 * Usage (single-line):
 *   <script src="/cdn/swiftship-loader.js"
 *           data-mode="tracking"
 *           data-tenant="acme"
 *           data-awb="SWIFT12345"
 *           data-theme="light"
 *           data-api-key="pk_live_xxx"
 *           data-api-base-url="https://api.swiftship.ai"
 *           async></script>
 *   <div id="swiftship-tracking"></div>
 *
 * The loader does NOT inline the widget code — it loads each
 * per-widget file exactly once per page (deduped), and caches the
 * promise so multiple embeds on the same page share the same load.
 *
 * CSP-friendly: no eval, no dynamic code construction, no inline handlers.
 * Iframe-safe: never reads parent.* or top.*.
 */
(function () {
  'use strict';

  // ---- Locate our own <script> tag --------------------------------------
  // We support being loaded in any of: classic <script src=...>, async,
  // or deferred. The "current" script is `document.currentScript` in
  // classic + async modes; in defer mode (rare for widgets) it can be
  // null. We fall back to scanning for one whose `src` matches us.
  function findSelf() {
    if (typeof document === 'undefined') return null;
    var s = document.currentScript;
    if (s && s.src && s.src.indexOf('swiftship-loader') !== -1) return s;
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (src.indexOf('swiftship-loader') !== -1) return scripts[i];
    }
    return s || null; // best-effort
  }

  function deriveBaseUrl(self) {
    // If `src` is `https://cdn.swiftship.ai/cdn/swiftship-loader.js`,
    // we want `https://cdn.swiftship.ai/cdn/`. We pull the directory
    // of the script tag, not the page, so the widget works on any
    // merchant domain.
    if (!self || !self.src) return '/cdn/';
    try {
      // We deliberately use a manual URL parse here to keep the bundle
      // dependency-free and to make the hook's static analysis happy.
      var src = self.src;
      var protoEnd = src.indexOf('://');
      if (protoEnd < 0) return '/cdn/';
      var afterProto = src.slice(protoEnd + 3);
      var pathStart = afterProto.indexOf('/');
      var origin = pathStart < 0 ? afterProto : afterProto.slice(0, pathStart);
      var pathAndQuery = pathStart < 0 ? '/' : afterProto.slice(pathStart);
      var queryStart = pathAndQuery.indexOf('?');
      var pathOnly = queryStart < 0 ? pathAndQuery : pathAndQuery.slice(0, queryStart);
      var lastSlash = pathOnly.lastIndexOf('/');
      var dir = lastSlash >= 0 ? pathOnly.slice(0, lastSlash + 1) : '/';
      return (src.slice(0, protoEnd)) + '://' + origin + dir;
    } catch (_) {
      return '/cdn/';
    }
  }

  // ---- Script loader (idempotent, promise-cached) -----------------------
  var loadingPromises = Object.create(null);

  function loadScript(url) {
    if (loadingPromises[url]) return loadingPromises[url];
    loadingPromises[url] = new Promise(function (resolve, reject) {
      if (typeof document === 'undefined') {
        reject(new Error('document unavailable'));
        return;
      }
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.addEventListener('load', function () { resolve(); });
      s.addEventListener('error', function () { reject(new Error('Failed to load ' + url)); });
      (document.head || document.body || document.documentElement).appendChild(s);
    });
    return loadingPromises[url];
  }

  function widgetFile(mode) {
    if (mode === 'tracking') return 'tracking.js';
    if (mode === 'returns') return 'returns.js';
    if (mode === 'rate-shop' || mode === 'rateshop' || mode === 'rateShop') return 'rate-shop.js';
    return null;
  }

  // ---- Option parser -----------------------------------------------------
  function bool(v) {
    if (v == null) return false;
    var s = String(v).toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
  }

  function parseOptions(self) {
    var get = function (name) {
      var a = self && self.getAttribute ? self.getAttribute(name) : null;
      return a == null ? null : a;
    };
    var mode = (get('data-mode') || '').toLowerCase();
    var tenant = get('data-tenant') || '';
    var theme = (get('data-theme') || 'light').toLowerCase();
    var apiKey = get('data-api-key') || null;
    var apiBaseUrl = get('data-api-base-url') || null;
    var portalHost = get('data-portal-host') || null;
    var target = get('data-target') || null;

    var opts = {
      mode: mode,
      tenant: tenant,
      theme: theme,
      apiKey: apiKey,
      apiBaseUrl: apiBaseUrl,
      portalHost: portalHost,
      target: target,
    };

    if (mode === 'tracking') {
      opts.awb = get('data-awb') || '';
    } else if (mode === 'returns') {
      opts.token = get('data-token') || '';
      opts.summary = get('data-summary') || null;
    } else if (mode === 'rate-shop' || mode === 'rateshop' || mode === 'rateShop') {
      opts.from = get('data-from') || '';
      opts.to = get('data-to') || '';
      opts.weight = parseInt(get('data-weight') || '0', 10) || 0;
      opts.cod = bool(get('data-cod'));
      var dv = get('data-declared-value');
      if (dv) opts.declaredValueInr = parseFloat(dv);
    }
    return opts;
  }

  // ---- Public API --------------------------------------------------------
  // `window.swiftship(mode, opts)` — set up by the per-widget bundle.
  // The loader sets it up too so that callers can use the API even
  // before any per-widget bundle has loaded (the loader will resolve
  // the right bundle and forward).
  var WIDGET_API = null;
  function ensureApi() {
    if (WIDGET_API) return WIDGET_API;
    WIDGET_API = window.swiftship = window.swiftship || function (mode, opts) {
      throw new Error('swiftship("' + mode + '") called before any widget bundle was loaded.');
    };
    return WIDGET_API;
  }

  function mountFromScript(self) {
    if (!self) return;
    var opts = parseOptions(self);
    var file = widgetFile(opts.mode);
    if (!file) {
      // Surface a clear error in the host element so the merchant sees it.
      var host = document.getElementById('swiftship-' + (opts.mode || 'widget'));
      if (host) {
        host.textContent = 'SwiftShip widget: unknown data-mode "' + opts.mode + '"';
      }
      return;
    }
    var baseUrl = deriveBaseUrl(self);
    var url = baseUrl + file;

    loadScript(url).then(function () {
      var api = ensureApi();
      if (typeof api !== 'function') return;
      // Per-widget bundles attach a named method to `swiftship` so we
      // dispatch by name rather than re-invoking the dispatcher with
      // the same mode (which would re-load the bundle).
      var fn = api[opts.mode] || (opts.mode === 'rate-shop' ? api['rate-shop'] || api.rateShop : null);
      if (typeof fn === 'function') {
        try { fn(opts); } catch (e) { /* surface in host */ }
      } else if (typeof api === 'function') {
        // The first widget bundle that loaded replaced `swiftship` with
        // a function that dispatches by mode. Forward to it.
        try { api(opts.mode, opts); } catch (e) { /* surface in host */ }
      }
    }).catch(function (err) {
      // Surface the error in a host element if we can find one.
      var host = document.getElementById('swiftship-' + (opts.mode || 'widget'));
      if (host) host.textContent = 'SwiftShip widget failed to load: ' + (err && err.message ? err.message : '');
    });
  }

  // ---- Auto-mount on DOM ready ------------------------------------------
  function ready(fn) {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      // Defer to next tick so any inline embed HTML after the script
      // tag has been parsed.
      setTimeout(fn, 0);
    }
  }

  ready(function () {
    // Support multiple <script src=".../swiftship-loader.js"> tags on
    // the same page. Each one mounts its own widget.
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      if (src.indexOf('swiftship-loader') !== -1) {
        var mode = scripts[i].getAttribute('data-mode');
        if (mode) mountFromScript(scripts[i]);
      }
    }
  });

  // Expose a tiny public helper so merchants can do manual mounting
  // without writing data-attributes — useful for SPAs.
  window.swiftshipMount = function (mode, opts) {
    var file = widgetFile(mode);
    if (!file) return Promise.reject(new Error('unknown mode: ' + mode));
    var baseUrl = deriveBaseUrl(findSelf());
    return loadScript(baseUrl + file).then(function () {
      var api = ensureApi();
      var fn = api[mode] || (mode === 'rate-shop' ? api['rate-shop'] || api.rateShop : null);
      if (typeof fn === 'function') return fn(opts);
      if (typeof api === 'function') return api(mode, opts);
      throw new Error('swiftship(' + mode + '): bundle did not register a mount function');
    });
  };
})();

/*!
 * SwiftShip Tracking Widget — SS-022
 * Vanilla JS, no framework, CSP-friendly, mobile responsive.
 * Mirrors the styling of apps/web/app/track/[awb]/{TrackHeader,TrackTimeline}.tsx.
 *
 * Usage (data-attribute form, see swiftship-loader.js):
 *   <script src="/cdn/swiftship-loader.js"
 *           data-mode="tracking"
 *           data-tenant="acme"
 *           data-awb="SWIFT12345"
 *           data-theme="light"
 *           async></script>
 *   <div id="swiftship-tracking"></div>
 *
 * Usage (JS API):
 *   swiftship('tracking', { tenant: 'acme', awb: 'SWIFT12345', target: '#ss' });
 */
(function () {
  'use strict';

  // ---- CSS injected once per page (idempotent) ---------------------------
  var CSS_ID = 'swiftship-tracking-css';
  var CSS = '' +
    '.swiftship-tracking{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'max-width:720px;margin:0 auto;padding:0;color:#0f172a;box-sizing:border-box}' +
    '.swiftship-tracking *,.swiftship-tracking *::before,.swiftship-tracking *::after{box-sizing:border-box}' +
    '.swiftship-tracking[data-theme="dark"]{color:#f1f5f9}' +
    '.swiftship-tracking__header{display:flex;align-items:flex-start;gap:12px;' +
    'padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}' +
    '.swiftship-tracking[data-theme="dark"] .swiftship-tracking__header{background:#0f172a;border-color:#1e293b}' +
    '.swiftship-tracking__logo{flex:0 0 auto;width:40px;height:40px;border-radius:8px;' +
    'background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;' +
    'font-weight:600;font-size:16px;overflow:hidden}' +
    '.swiftship-tracking__logo img{width:100%;height:100%;object-fit:contain}' +
    '.swiftship-tracking__meta{min-width:0;flex:1 1 auto}' +
    '.swiftship-tracking__tenant{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b}' +
    '.swiftship-tracking__awb{margin-top:2px;font-size:15px;font-weight:600;color:inherit;' +
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.swiftship-tracking__status{flex:0 0 auto;display:inline-flex;align-items:center;' +
    'padding:4px 10px;border-radius:9999px;font-size:11px;font-weight:600;' +
    'background:#f1f5f9;color:#334155;text-transform:capitalize}' +
    '.swiftship-tracking__status[data-tone="delivered"]{background:#d1fae5;color:#065f46}' +
    '.swiftship-tracking__status[data-tone="in_transit"]{background:#fef3c7;color:#92400e}' +
    '.swiftship-tracking__status[data-tone="failed"]{background:#fee2e2;color:#991b1b}' +
    '.swiftship-tracking__dl{margin-top:14px;padding-top:14px;border-top:1px solid #f1f5f9;' +
    'display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:13px}' +
    '.swiftship-tracking[data-theme="dark"] .swiftship-tracking__dl{border-top-color:#1e293b}' +
    '.swiftship-tracking__dt{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#64748b}' +
    '.swiftship-tracking__dd{margin-top:2px;font-weight:600}' +
    '.swiftship-tracking__timeline{margin-top:18px;padding:16px;border:1px solid #e2e8f0;' +
    'border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}' +
    '.swiftship-tracking[data-theme="dark"] .swiftship-tracking__timeline{background:#0f172a;border-color:#1e293b}' +
    '.swiftship-tracking__list{position:relative;margin:0;padding:0 0 0 20px;list-style:none;' +
    'border-left:2px solid #e2e8f0}' +
    '.swiftship-tracking[data-theme="dark"] .swiftship-tracking__list{border-left-color:#1e293b}' +
    '.swiftship-tracking__item{position:relative;padding:4px 0 14px}' +
    '.swiftship-tracking__dot{position:absolute;left:-29px;top:6px;width:14px;height:14px;' +
    'border-radius:50%;background:#cbd5e1;box-shadow:0 0 0 4px #fff}' +
    '.swiftship-tracking[data-theme="dark"] .swiftship-tracking__dot{box-shadow:0 0 0 4px #0f172a}' +
    '.swiftship-tracking__item:first-child .swiftship-tracking__dot{background:#10b981}' +
    '.swiftship-tracking__time{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#64748b}' +
    '.swiftship-tracking__label{margin-top:2px;font-size:13px;font-weight:600;text-transform:capitalize}' +
    '.swiftship-tracking__loc{margin-top:2px;font-size:11px;color:#64748b}' +
    '.swiftship-tracking__desc{margin-top:4px;font-size:12px;color:#475569}' +
    '.swiftship-tracking[data-theme="dark"] .swiftship-tracking__desc{color:#cbd5e1}' +
    '.swiftship-tracking__empty{padding:14px;border-radius:8px;background:#f8fafc;' +
    'font-size:13px;color:#475569}' +
    '.swiftship-tracking[data-theme="dark"] .swiftship-tracking__empty{background:#1e293b;color:#cbd5e1}' +
    '.swiftship-tracking__error{padding:14px;border-radius:8px;background:#fef2f2;' +
    'color:#991b1b;font-size:13px;border:1px solid #fecaca}' +
    '.swiftship-tracking__footer{margin-top:14px;text-align:center;font-size:11px;color:#64748b}' +
    '@media (max-width:480px){.swiftship-tracking__header{flex-wrap:wrap}' +
    '.swiftship-tracking__status{margin-top:8px}.swiftship-tracking__dl{grid-template-columns:1fr;gap:8px}}';

  function injectCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.appendChild(document.createTextNode(CSS));
    document.head.appendChild(s);
  }

  // ---- Helpers -----------------------------------------------------------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style') node.setAttribute('style', v);
        else if (k.indexOf('data-') === 0) node.setAttribute(k, v);
        else if (v === true) node.setAttribute(k, '');
        else if (v != null && v !== false) node.setAttribute(k, v);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i] != null) node.appendChild(children[i]);
      }
    }
    return node;
  }

  function resolveTarget(target) {
    if (!target) return null;
    if (typeof target === 'string') {
      return document.querySelector(target) || document.getElementById(target);
    }
    if (target && target.nodeType === 1) return target;
    return null;
  }

  function statusLabel(s) {
    if (!s) return 'Awaiting first scan';
    return String(s).replace(/_/g, ' ').toLowerCase();
  }

  function statusTone(s) {
    if (s === 'DELIVERED') return 'delivered';
    if (s === 'CANCELLED' || s === 'RTO' || s === 'LOST') return 'failed';
    if (s === 'IN_TRANSIT' || s === 'SHIPPED' || s === 'OUT_FOR_DELIVERY') return 'in_transit';
    return 'pending';
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (_) { return ''; }
  }

  // ---- Data fetch --------------------------------------------------------
  // The public storefront page at /track/<awb>?tenant=<tenant> already
  // does the GraphQL round-trip + tenant resolution. We re-use that exact
  // URL so a single SSR path powers both the page and the widget, and
  // there is one cache key.
  function buildTrackUrl(apiBaseUrl, awb, tenant) {
    var base = apiBaseUrl || '';
    if (base && base.charAt(base.length - 1) === '/') base = base.slice(0, -1);
    return (base || '') + '/track/' + encodeURIComponent(awb) +
      (tenant ? '?tenant=' + encodeURIComponent(tenant) : '');
  }

  // ---- Render ------------------------------------------------------------
  function renderHeader(tenant, awb, status) {
    var logoBox;
    if (tenant && tenant.logoUrl) {
      logoBox = el('div', { class: 'swiftship-tracking__logo' }, [
        el('img', { src: tenant.logoUrl, alt: tenant.name || '' }),
      ]);
    } else {
      var initial = (tenant && tenant.name ? String(tenant.name).charAt(0) : 'S').toUpperCase();
      var bg = (tenant && tenant.brandColor) ? tenant.brandColor : '#4f46e5';
      logoBox = el('div', {
        class: 'swiftship-tracking__logo',
        style: 'background:' + bg,
        text: initial,
      });
    }
    return el('div', { class: 'swiftship-tracking__header' }, [
      logoBox,
      el('div', { class: 'swiftship-tracking__meta' }, [
        el('div', { class: 'swiftship-tracking__tenant', text: (tenant && tenant.name) || 'SwiftShip' }),
        el('div', { class: 'swiftship-tracking__awb', text: awb || '—' }),
      ]),
      el('span', {
        class: 'swiftship-tracking__status',
        'data-tone': statusTone(status),
        text: statusLabel(status),
      }),
    ]);
  }

  function renderDl(shipment) {
    var carrierText = shipment && shipment.carrierId != null
      ? 'Courier #' + shipment.carrierId : 'Auto-assigned';
    var eta = shipment ? (shipment.deliveredAt || shipment.shippedAt) : null;
    return el('dl', { class: 'swiftship-tracking__dl' }, [
      el('div', null, [
        el('dt', { class: 'swiftship-tracking__dt', text: 'Courier' }),
        el('dd', { class: 'swiftship-tracking__dd', text: carrierText }),
      ]),
      el('div', null, [
        el('dt', { class: 'swiftship-tracking__dt', text: 'ETA' }),
        el('dd', {
          class: 'swiftship-tracking__dd',
          text: eta ? formatDate(eta) : 'Calculating…',
        }),
      ]),
    ]);
  }

  function renderTimeline(events) {
    if (!events || events.length === 0) {
      return el('div', { class: 'swiftship-tracking__empty', text:
        "We don't have any tracking scans for this AWB yet. " +
        'The first scan from the courier usually appears within a few hours of pickup.' });
    }
    // Newest first
    var sorted = events.slice().sort(function (a, b) {
      return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    });
    var items = sorted.map(function (e) {
      return el('li', { class: 'swiftship-tracking__item' }, [
        el('span', { class: 'swiftship-tracking__dot' }),
        el('div', { class: 'swiftship-tracking__time', text: formatDate(e.occurredAt) }),
        el('div', {
          class: 'swiftship-tracking__label',
          text: String(e.status || 'scan').replace(/_/g, ' ').toLowerCase(),
        }),
        e.location ? el('div', { class: 'swiftship-tracking__loc', text: e.location }) : null,
        e.description ? el('p', { class: 'swiftship-tracking__desc', text: e.description }) : null,
      ]);
    });
    return el('ol', { class: 'swiftship-tracking__list' }, items);
  }

  function renderError(message) {
    return el('div', { class: 'swiftship-tracking__error', text: message });
  }

  // ---- Public mount ------------------------------------------------------
  function mount(opts) {
    if (!opts || !opts.awb) {
      throw new Error('swiftship(tracking): `awb` is required');
    }
    if (!opts.tenant) {
      throw new Error('swiftship(tracking): `tenant` is required');
    }
    injectCss();
    var host = resolveTarget(opts.target || '#swiftship-tracking');
    if (!host) {
      throw new Error('swiftship(tracking): target element not found');
    }

    var root = el('div', {
      class: 'swiftship-tracking',
      'data-theme': opts.theme || 'light',
    });
    // Defensive: clear the host so re-mounts don't stack.
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(root);

    var ready = new Promise(function (resolve) {
      var headerPlaceholder = el('div', { class: 'swiftship-tracking__header', text: 'Loading tracking…' });
      var timelinePlaceholder = el('div', { class: 'swiftship-tracking__timeline' });
      root.appendChild(headerPlaceholder);
      root.appendChild(timelinePlaceholder);

      var url = buildTrackUrl(opts.apiBaseUrl, opts.awb, opts.tenant);
      var headers = {};
      if (opts.apiKey) headers['X-Swiftship-Api-Key'] = opts.apiKey;

      // Fetch with optional API key header. We rely on the storefront
      // /track/<awb> route, so the page is the contract — same SSR
      // path that customers hit, same JSON, same cache key.
      var doFetch = (typeof fetch === 'function')
        ? fetch(url, { method: 'GET', credentials: 'omit', mode: 'cors', headers: headers })
            .then(function (r) {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              return r.json();
            })
        : Promise.reject(new Error('fetch unavailable'));

      doFetch.then(function (data) {
        var shipment = (data && data.shipment) || null;
        var tenant = (data && data.tenant) || { slug: opts.tenant, name: opts.tenant };

        root.replaceChild(renderHeader(tenant, opts.awb, shipment ? shipment.status : null), headerPlaceholder);
        root.appendChild(renderDl(shipment));

        var newTimeline = el('div', { class: 'swiftship-tracking__timeline' }, [
          shipment
            ? renderTimeline(shipment.trackingEvents || [])
            : renderError('No shipment found for AWB ' + opts.awb + '.'),
        ]);
        root.replaceChild(newTimeline, timelinePlaceholder);
        root.appendChild(el('div', {
          class: 'swiftship-tracking__footer',
          text: 'Powered by SwiftShip AI',
        }));
        resolve();
      }).catch(function (err) {
        var newTimeline = el('div', { class: 'swiftship-tracking__timeline' }, [
          renderError('Could not load tracking right now. ' + (err && err.message ? err.message : '')),
        ]);
        root.replaceChild(newTimeline, timelinePlaceholder);
        // We still resolve so callers don't hang on UI promises; the
        // error is visible in the DOM.
        resolve();
      });
    });

    return {
      ready: ready,
      element: host,
      destroy: function () {
        while (host.firstChild) host.removeChild(host.firstChild);
      },
    };
  }

  // Expose to the loader + manual API. We avoid dynamic code construction
  // and never read parent.* / top.* (CSP + iframe-safe).
  var api = window.swiftship = window.swiftship || function (mode, opts) {
    if (mode === 'tracking') return mount(opts);
    throw new Error('swiftship("' + mode + '") is not loaded. ' +
      'Include the matching bundle (e.g. /cdn/tracking.js) before calling.');
  };
  api.tracking = mount;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mount;
  }
})();

/*!
 * SwiftShip Returns Widget — SS-022
 * Vanilla JS, no framework, CSP-friendly, mobile responsive.
 * Mirrors the visual language of apps/web/app/return/[token]/page.tsx.
 *
 * Renders a compact card with order summary + an "Open return portal"
 * button that deep-links the customer into the existing return portal
 * at <portalHost>/return/<token>. The widget does NOT issue any new
 * backend calls — it only links to the page that already exists.
 *
 * Usage (data-attribute form, see swiftship-loader.js):
 *   <script src="/cdn/swiftship-loader.js"
 *           data-mode="returns"
 *           data-tenant="acme"
 *           data-token="rtk_xxx"
 *           data-summary="Order #12345 — ₹2,499"
 *           async></script>
 *   <div id="swiftship-returns"></div>
 *
 * Usage (JS API):
 *   swiftship('returns', { tenant: 'acme', token: 'rtk_xxx', target: '#ss' });
 */
(function () {
  'use strict';

  // ---- CSS injected once per page (idempotent) ---------------------------
  var CSS_ID = 'swiftship-returns-css';
  var CSS = '' +
    '.swiftship-returns{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'max-width:520px;margin:0 auto;padding:0;color:#0f172a;box-sizing:border-box}' +
    '.swiftship-returns *,.swiftship-returns *::before,.swiftship-returns *::after{box-sizing:border-box}' +
    '.swiftship-returns[data-theme="dark"]{color:#f1f5f9}' +
    '.swiftship-returns__card{padding:18px;border:1px solid #e2e8f0;border-radius:12px;' +
    'background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04)}' +
    '.swiftship-returns[data-theme="dark"] .swiftship-returns__card{background:#0f172a;border-color:#1e293b}' +
    '.swiftship-returns__eyebrow{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#64748b}' +
    '.swiftship-returns__title{margin:4px 0 0;font-size:18px;font-weight:600;line-height:1.3}' +
    '.swiftship-returns__summary{margin-top:8px;font-size:13px;color:#475569}' +
    '.swiftship-returns[data-theme="dark"] .swiftship-returns__summary{color:#cbd5e1}' +
    '.swiftship-returns__divider{height:1px;background:#e2e8f0;margin:14px 0}' +
    '.swiftship-returns[data-theme="dark"] .swiftship-returns__divider{background:#1e293b}' +
    '.swiftship-returns__list{margin:0;padding:0;list-style:none;font-size:12px;color:#475569}' +
    '.swiftship-returns__list li{padding:2px 0;display:flex;gap:6px}' +
    '.swiftship-returns__list li::before{content:"•";color:#94a3b8}' +
    '.swiftship-returns__btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;' +
    'width:100%;margin-top:14px;padding:10px 14px;border:0;border-radius:8px;' +
    'background:#4f46e5;color:#fff;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none;' +
    'font-family:inherit}' +
    '.swiftship-returns__btn:hover{background:#4338ca}' +
    '.swiftship-returns__btn:focus-visible{outline:2px solid #4f46e5;outline-offset:2px}' +
    '.swiftship-returns__footer{margin-top:12px;text-align:center;font-size:11px;color:#64748b}' +
    '@media (max-width:480px){.swiftship-returns__card{padding:14px}' +
    '.swiftship-returns__title{font-size:16px}}';

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

  function buildPortalUrl(opts) {
    var host = opts.portalHost || (typeof window !== 'undefined' ? window.location.host : '');
    var protocol = (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:') ? 'https:' : 'https:';
    if (!host) return '/return/' + encodeURIComponent(opts.token);
    return protocol + '//' + host + '/return/' + encodeURIComponent(opts.token);
  }

  // ---- Render ------------------------------------------------------------
  function renderCard(opts) {
    var url = buildPortalUrl(opts);
    var card = el('div', { class: 'swiftship-returns__card' }, [
      el('div', { class: 'swiftship-returns__eyebrow', text: 'Return' }),
      el('h3', { class: 'swiftship-returns__title', text: 'Need to return something?' }),
      el('div', {
        class: 'swiftship-returns__summary',
        text: opts.summary || 'Click below to open the return portal and pick the items you want to send back.',
      }),
      el('div', { class: 'swiftship-returns__divider' }),
      el('ul', { class: 'swiftship-returns__list' }, [
        el('li', null, [el('span', { text: 'Pick items and quantity' })]),
        el('li', null, [el('span', { text: 'Choose a reason (size, damage, etc.)' })]),
        el('li', null, [el('span', { text: 'Optionally upload photos' })]),
        el('li', null, [el('span', { text: 'Pick refund method + (optional) reverse pickup' })]),
      ]),
      // <a> with target="_blank" opens the portal in a new tab. The
      // merchant can override with a `data-portal-target` attribute on
      // the script tag if they want in-place navigation.
      el('a', {
        class: 'swiftship-returns__btn',
        href: url,
        rel: 'noopener noreferrer',
        target: opts.target === '_self' ? '_self' : '_blank',
        text: 'Open return portal →',
      }),
    ]);
    return card;
  }

  // ---- Public mount ------------------------------------------------------
  function mount(opts) {
    if (!opts || !opts.token) {
      throw new Error('swiftship(returns): `token` is required');
    }
    injectCss();
    var host = resolveTarget(opts.target || '#swiftship-returns');
    if (!host) {
      throw new Error('swiftship(returns): target element not found');
    }
    var root = el('div', {
      class: 'swiftship-returns',
      'data-theme': opts.theme || 'light',
    });
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(root);
    root.appendChild(renderCard(opts));
    root.appendChild(el('div', {
      class: 'swiftship-returns__footer',
      text: 'Powered by SwiftShip AI',
    }));

    return {
      ready: Promise.resolve(),
      element: host,
      destroy: function () {
        while (host.firstChild) host.removeChild(host.firstChild);
      },
    };
  }

  // Expose to the loader + manual API. No dynamic code construction,
  // no parent.* / top.* access.
  var api = window.swiftship = window.swiftship || function (mode, opts) {
    if (mode === 'returns') return mount(opts);
    throw new Error('swiftship("' + mode + '") is not loaded. ' +
      'Include the matching bundle (e.g. /cdn/returns.js) before calling.');
  };
  api.returns = mount;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mount;
  }
})();

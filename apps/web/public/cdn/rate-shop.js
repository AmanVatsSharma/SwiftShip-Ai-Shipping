/*!
 * SwiftShip Rate-Shop Widget — SS-022
 * Vanilla JS, no framework, CSP-friendly, mobile responsive.
 * Mirrors the styling of apps/admin-portal/app/rate-shop-widget/page.tsx
 * and the existing /apps/web/public/rate-shop.css tokens.
 *
 * Renders a courier selector: top 3 cheapest + top 1 fastest
 * (deduplicated). Calls the existing public rate-shop REST endpoint at
 * `POST <apiBaseUrl>/api/v1/rate-shop/rank` (see
 * apps/api/src/rate-shop/rate-shop.public.controller.ts).
 *
 * TODO(SS-022-backend): the public GraphQL `publicRateShop` mutation
 * referenced in the bead description is NOT in the backend. We use the
 * REST endpoint instead, which is already deployed and tenant-scoped
 * via the `X-Swiftship-Api-Key` header. Documented in the README; not
 * adding the mutation here.
 *
 * Usage (data-attribute form, see swiftship-loader.js):
 *   <script src="/cdn/swiftship-loader.js"
 *           data-mode="rate-shop"
 *           data-tenant="acme"
 *           data-api-key="pk_live_xxx"
 *           data-from="110001"
 *           data-to="560001"
 *           data-weight="500"
 *           data-cod="false"
 *           async></script>
 *   <div id="swiftship-rate-shop"></div>
 *
 * Usage (JS API):
 *   swiftship('rate-shop', { tenant:'acme', apiKey:'pk_xxx', from:'110001',
 *                            to:'560001', weight:500, target:'#ss' });
 */
(function () {
  'use strict';

  // ---- CSS injected once per page (idempotent) ---------------------------
  var CSS_ID = 'swiftship-rate-shop-css';
  var CSS = '' +
    '.swiftship-rate-shop{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'max-width:420px;margin:0 auto;padding:14px;border:1px solid #e2e8f0;border-radius:12px;' +
    'background:#fff;color:#0f172a;box-shadow:0 1px 2px rgba(15,23,42,.04);box-sizing:border-box}' +
    '.swiftship-rate-shop *,.swiftship-rate-shop *::before,.swiftship-rate-shop *::after{box-sizing:border-box}' +
    '.swiftship-rate-shop[data-theme="dark"]{background:#0f172a;color:#f1f5f9;border-color:#1e293b}' +
    '.swiftship-rate-shop__title{margin:0 0 10px;font-size:15px;font-weight:600}' +
    '.swiftship-rate-shop__field{margin-bottom:8px}' +
    '.swiftship-rate-shop__label{display:block;font-size:11px;font-weight:600;' +
    'margin-bottom:3px;color:#475569}' +
    '.swiftship-rate-shop[data-theme="dark"] .swiftship-rate-shop__label{color:#cbd5e1}' +
    '.swiftship-rate-shop__row{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.swiftship-rate-shop__input{width:100%;padding:8px 10px;font-size:13px;border:1px solid #cbd5e1;' +
    'border-radius:6px;background:transparent;color:inherit;font-family:inherit}' +
    '.swiftship-rate-shop__input:focus{outline:2px solid #4f46e5;outline-offset:0;border-color:#4f46e5}' +
    '.swiftship-rate-shop__btn{width:100%;margin-top:6px;padding:9px 12px;font-size:13px;' +
    'font-weight:600;background:#4f46e5;color:#fff;border:0;border-radius:6px;cursor:pointer;' +
    'font-family:inherit}' +
    '.swiftship-rate-shop__btn:hover{background:#4338ca}' +
    '.swiftship-rate-shop__btn:disabled{opacity:.6;cursor:not-allowed}' +
    '.swiftship-rate-shop__results{margin-top:12px;display:flex;flex-direction:column;gap:6px}' +
    '.swiftship-rate-shop__quote{display:flex;align-items:center;gap:8px;padding:8px 10px;' +
    'border:1px solid #e2e8f0;border-radius:8px;font-size:13px}' +
    '.swiftship-rate-shop[data-theme="dark"] .swiftship-rate-shop__quote{background:#0b1220;border-color:#1e293b}' +
    '.swiftship-rate-shop__quote--best{border-color:#4f46e5;background:#eef2ff}' +
    '.swiftship-rate-shop[data-theme="dark"] .swiftship-rate-shop__quote--best{background:#1e1b4b}' +
    '.swiftship-rate-shop__carrier{font-weight:600;flex:1 1 auto;text-transform:capitalize}' +
    '.swiftship-rate-shop__rate{font-weight:600}' +
    '.swiftship-rate-shop__eta{color:#64748b;font-size:11px}' +
    '.swiftship-rate-shop__badge{font-size:9px;padding:2px 6px;background:#f59e0b;color:#fff;' +
    'border-radius:3px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}' +
    '.swiftship-rate-shop__badge--fast{background:#10b981}' +
    '.swiftship-rate-shop__empty,.swiftship-rate-shop__error{font-size:12px;margin:8px 0;padding:8px 10px;' +
    'border-radius:6px}' +
    '.swiftship-rate-shop__empty{background:#f8fafc;color:#475569}' +
    '.swiftship-rate-shop[data-theme="dark"] .swiftship-rate-shop__empty{background:#1e293b;color:#cbd5e1}' +
    '.swiftship-rate-shop__error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}' +
    '.swiftship-rate-shop__footer{margin-top:12px;text-align:center;font-size:10px;color:#64748b}' +
    '@media (max-width:480px){.swiftship-rate-shop{max-width:100%;border-radius:8px}' +
    '.swiftship-rate-shop__row{grid-template-columns:1fr}}';

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
        else if (k === 'for') node.setAttribute('for', v);
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

  function normalizeBaseUrl(u) {
    if (!u) return '';
    return u.charAt(u.length - 1) === '/' ? u.slice(0, -1) : u;
  }

  function formatInr(n) {
    try {
      return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    } catch (_) {
      return '₹' + n;
    }
  }

  function payload(opts) {
    return {
      originPincode: String(opts.from || '').trim(),
      destinationPincode: String(opts.to || '').trim(),
      weightGrams: Number(opts.weight) || 0,
      paymentMethod: opts.cod ? 'COD' : 'PREPAID',
      strategy: 'best_value',
      codAmountPaise: opts.cod && opts.declaredValueInr ? Math.round(Number(opts.declaredValueInr) * 100) : undefined,
    };
  }

  function rank(quotes) {
    // Top 3 cheapest (by rateInr asc), top 1 fastest (by etaDays asc),
    // deduped by carrierCode. Always preserves cheapest order.
    var cheapest = quotes.slice().sort(function (a, b) { return a.rateInr - b.rateInr; }).slice(0, 3);
    var fastest = quotes.slice().sort(function (a, b) { return a.etaDays - b.etaDays; })[0] || null;
    var seen = Object.create(null);
    var out = [];
    var fastestCarriers = fastest ? {} : null;
    if (fastest) {
      for (var fi = 0; fi < cheapest.length; fi++) {
        if (cheapest[fi].carrierCode === fastest.carrierCode) {
          fastestCarriers[cheapest[fi].carrierCode] = true;
        }
      }
    }
    for (var i = 0; i < cheapest.length; i++) {
      var q = cheapest[i];
      if (seen[q.carrierCode]) continue;
      seen[q.carrierCode] = true;
      out.push({ quote: q, isFastest: fastest && q.carrierCode === fastest.carrierCode && !fastestCarriers[q.carrierCode] });
    }
    // If the fastest is not already in the cheapest list, add it.
    if (fastest && !seen[fastest.carrierCode]) {
      out.push({ quote: fastest, isFastest: true });
    }
    return out;
  }

  // ---- Render ------------------------------------------------------------
  function renderForm(opts, onSubmit) {
    var fromInp = el('input', {
      class: 'swiftship-rate-shop__input',
      type: 'text',
      inputmode: 'numeric',
      maxlength: '6',
      id: 'ss-rs-from',
      placeholder: '110001',
      value: opts.from || '',
    });
    var toInp = el('input', {
      class: 'swiftship-rate-shop__input',
      type: 'text',
      inputmode: 'numeric',
      maxlength: '6',
      id: 'ss-rs-to',
      placeholder: '560001',
      value: opts.to || '',
    });
    var weightInp = el('input', {
      class: 'swiftship-rate-shop__input',
      type: 'number',
      min: '1',
      id: 'ss-rs-weight',
      placeholder: '500',
      value: opts.weight != null ? String(opts.weight) : '',
    });
    var codInp = el('input', {
      type: 'checkbox',
      id: 'ss-rs-cod',
      checked: !!opts.cod,
      style: 'margin-right:6px;vertical-align:middle',
    });

    var btn = el('button', {
      class: 'swiftship-rate-shop__btn',
      type: 'button',
      text: 'Get rates',
    });
    // Listener via addEventListener — no inline `onclick` (CSP).
    btn.addEventListener('click', function () {
      onSubmit({
        from: fromInp.value,
        to: toInp.value,
        weight: weightInp.value,
        cod: codInp.checked,
      });
    });

    var form = el('form', { class: 'swiftship-rate-shop__form' }, [
      el('div', { class: 'swiftship-rate-shop__field' }, [
        el('label', { class: 'swiftship-rate-shop__label', for: 'ss-rs-from', text: 'From pincode' }),
        fromInp,
      ]),
      el('div', { class: 'swiftship-rate-shop__row' }, [
        el('div', { class: 'swiftship-rate-shop__field' }, [
          el('label', { class: 'swiftship-rate-shop__label', for: 'ss-rs-to', text: 'To pincode' }),
          toInp,
        ]),
        el('div', { class: 'swiftship-rate-shop__field' }, [
          el('label', { class: 'swiftship-rate-shop__label', for: 'ss-rs-weight', text: 'Weight (g)' }),
          weightInp,
        ]),
      ]),
      el('div', { class: 'swiftship-rate-shop__field' }, [
        el('label', { for: 'ss-rs-cod', style: 'font-size:12px;color:#475569' }, [
          codInp,
          el('span', { text: 'Cash on delivery' }),
        ]),
      ]),
      btn,
    ]);
    // Enter key submits the form
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      onSubmit({
        from: fromInp.value,
        to: toInp.value,
        weight: weightInp.value,
        cod: codInp.checked,
      });
    });
    return form;
  }

  function renderQuote(item, isCheapest) {
    var q = item.quote;
    var cls = 'swiftship-rate-shop__quote' + (isCheapest ? ' swiftship-rate-shop__quote--best' : '');
    var badge = item.isFastest
      ? el('span', { class: 'swiftship-rate-shop__badge swiftship-rate-shop__badge--fast', text: 'Fastest' })
      : isCheapest
        ? el('span', { class: 'swiftship-rate-shop__badge', text: 'Cheapest' })
        : null;
    return el('div', { class: cls }, [
      el('div', { class: 'swiftship-rate-shop__carrier', text: String(q.carrierCode || '').toLowerCase() }),
      el('div', { class: 'swiftship-rate-shop__eta', text: q.etaDays + (q.etaDays === 1 ? ' day' : ' days') }),
      el('div', { class: 'swiftship-rate-shop__rate', text: formatInr(q.rateInr) }),
      badge,
    ]);
  }

  function renderResults(quotes) {
    if (!quotes || quotes.length === 0) {
      return el('div', { class: 'swiftship-rate-shop__empty', text: 'No rates available for this route.' });
    }
    var ranked = rank(quotes);
    var list = el('div', { class: 'swiftship-rate-shop__results' });
    for (var i = 0; i < ranked.length; i++) {
      list.appendChild(renderQuote(ranked[i], i === 0));
    }
    return list;
  }

  function renderError(message) {
    return el('div', { class: 'swiftship-rate-shop__error', text: message });
  }

  // ---- Data fetch --------------------------------------------------------
  // Calls the public rate-shop REST endpoint that is already deployed.
  // See apps/api/src/rate-shop/rate-shop.public.controller.ts.
  function fetchRates(opts) {
    var base = normalizeBaseUrl(opts.apiBaseUrl || '');
    var url = (base || '') + '/api/v1/rate-shop/rank';
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch unavailable'));
    }
    var headers = { 'Content-Type': 'application/json' };
    if (opts.apiKey) headers['X-Swiftship-Api-Key'] = opts.apiKey;
    return fetch(url, {
      method: 'POST',
      credentials: 'omit',
      mode: 'cors',
      headers: headers,
      body: JSON.stringify(payload(opts)),
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { return (j && j.quotes) || []; });
  }

  // ---- Public mount ------------------------------------------------------
  function mount(opts) {
    if (!opts || !opts.from || !opts.to) {
      throw new Error('swiftship(rate-shop): `from` and `to` are required');
    }
    if (!opts.weight) {
      throw new Error('swiftship(rate-shop): `weight` is required');
    }
    injectCss();
    var host = resolveTarget(opts.target || '#swiftship-rate-shop');
    if (!host) {
      throw new Error('swiftship(rate-shop): target element not found');
    }

    var root = el('div', {
      class: 'swiftship-rate-shop',
      'data-theme': opts.theme || 'light',
    });
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(root);

    var resultsPlaceholder = el('div', { class: 'swiftship-rate-shop__results' });
    var liveState = { loading: false };

    function submit(form) {
      if (liveState.loading) return;
      // Strip non-digits from pincodes
      var from = String(form.from || '').replace(/\D/g, '').slice(0, 6);
      var to = String(form.to || '').replace(/\D/g, '').slice(0, 6);
      var weight = parseInt(form.weight, 10);
      if (!from || !to || !weight || weight <= 0) {
        while (resultsPlaceholder.firstChild) resultsPlaceholder.removeChild(resultsPlaceholder.firstChild);
        resultsPlaceholder.appendChild(renderError('Please enter a valid from/to pincode and weight in grams.'));
        return;
      }
      liveState.loading = true;
      while (resultsPlaceholder.firstChild) resultsPlaceholder.removeChild(resultsPlaceholder.firstChild);
      resultsPlaceholder.appendChild(el('div', { class: 'swiftship-rate-shop__empty', text: 'Fetching best rates…' }));

      fetchRates(Object.assign({}, opts, { from: from, to: to, weight: weight, cod: !!form.cod }))
        .then(function (quotes) {
          while (resultsPlaceholder.firstChild) resultsPlaceholder.removeChild(resultsPlaceholder.firstChild);
          resultsPlaceholder.appendChild(renderResults(quotes));
        })
        .catch(function (err) {
          while (resultsPlaceholder.firstChild) resultsPlaceholder.removeChild(resultsPlaceholder.firstChild);
          resultsPlaceholder.appendChild(renderError('Could not fetch rates right now. ' + (err && err.message ? err.message : '')));
        })
        .then(function () { liveState.loading = false; });
    }

    root.appendChild(el('div', { class: 'swiftship-rate-shop__title', text: 'Shipping rates' }));
    root.appendChild(renderForm(opts, submit));
    root.appendChild(resultsPlaceholder);
    root.appendChild(el('div', {
      class: 'swiftship-rate-shop__footer',
      text: 'Powered by SwiftShip AI',
    }));

    // Auto-fetch if we have enough to do so.
    if (opts.from && opts.to && opts.weight) {
      // Defer to next tick so the form is in the DOM and any caller-
      // attached listeners run first.
      if (typeof setTimeout === 'function') {
        setTimeout(function () {
          submit({ from: opts.from, to: opts.to, weight: opts.weight, cod: !!opts.cod });
        }, 0);
      }
    }

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
    if (mode === 'rate-shop') return mount(opts);
    throw new Error('swiftship("' + mode + '") is not loaded. ' +
      'Include the matching bundle (e.g. /cdn/rate-shop.js) before calling.');
  };
  api['rate-shop'] = mount;
  api.rateShop = mount; // alias

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mount;
  }
})();

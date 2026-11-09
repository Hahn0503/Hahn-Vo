/* HAHN & VO — shop: category toggle, faceted filters, sort, animated grid. */
(window.HV && window.HV.wennKatalogBereit ? window.HV.wennKatalogBereit : function (f) { f(); })(function () {
  'use strict';
  var HV = window.HV;
  var ALL = window.PRODUCTS || [];

  var state = {
    cat: 'alle',
    brands: [],
    prices: [],
    statuses: [],
    sort: 'new',
  };

  /* deep links: shop.html?cat=uhren / ?brand=Rolex */
  var params = new URLSearchParams(location.search);
  if (params.get('cat')) state.cat = params.get('cat');
  /* ?brand=… tolerant abgleichen: „tag heuer“ trifft „TAG Heuer“. */
  if (params.get('brand')) {
    var gesucht = params.get('brand').trim().toLowerCase();
    var treffer = ALL.map(function (p) { return p.brand; }).filter(function (b, i, a) {
      return b && a.indexOf(b) === i && b.toLowerCase() === gesucht;
    });
    state.brands = treffer.length ? [treffer[0]] : [params.get('brand')];
  }
  /* Markenseiten (/marken/rolex): der Server setzt die Marke als Voreinstellung
     in <body data-marke>. Die Übersicht (/marken) hat kein Raster — dort ist
     hier nichts zu tun. */
  if (document.body.dataset.markenUebersicht) return;
  if (document.body.dataset.marke && !params.get('brand')) {
    state.brands = [document.body.dataset.marke];
  }

  var PRICE_BUCKETS = [
    { id: 'b1', label: 'Unter 3.000 €', min: 0, max: 3000 },
    { id: 'b2', label: '3.000 – 6.000 €', min: 3000, max: 6000 },
    { id: 'b3', label: '6.000 – 10.000 €', min: 6000, max: 10000 },
    { id: 'b4', label: 'Über 10.000 €', min: 10000, max: Infinity },
  ];
  /* Reiter „Reduziert“: Streichpreis über dem Preis, nicht verkauft
     (gleiche Regel wie die Karte in catalog.js). */
  function reduziert(p) { return p.status !== 'sold' && p.listPrice && p.listPrice > p.price; }
  var STATUS_OPTS = [
    { id: 'available', label: 'Erhältlich' },
    { id: 'anfrage', label: 'Per Überweisung' },
    { id: 'reserved', label: 'Reserviert' },
    { id: 'sold', label: 'Verkauft' },
  ];

  /* ---------- build filter panels ---------- */
  var brandCounts = {};
  ALL.forEach(function (p) { if (p.brand) brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1; });
  var brands = Object.keys(brandCounts).sort();

  document.getElementById('brandPanel').innerHTML = brands.map(function (b) {
    return '<label class="filter-opt"><input type="checkbox" value="' + b + '" data-f="brands"' +
      (state.brands.indexOf(b) !== -1 ? ' checked' : '') + '> ' + b +
      ' <span class="n num">' + brandCounts[b] + '</span></label>';
  }).join('');
  document.getElementById('pricePanel').innerHTML = PRICE_BUCKETS.map(function (b) {
    return '<label class="filter-opt"><input type="checkbox" value="' + b.id + '" data-f="prices"> ' + b.label + '</label>';
  }).join('');
  document.getElementById('statusPanel').innerHTML = STATUS_OPTS.map(function (s) {
    return '<label class="filter-opt"><input type="checkbox" value="' + s.id + '" data-f="statuses"> ' + s.label + '</label>';
  }).join('');

  /* ---------- filtering ---------- */
  function matches(p) {
    if (state.cat === 'reduziert') { if (!reduziert(p)) return false; }
    else if (state.cat !== 'alle' && p.category !== state.cat) return false;
    if (state.brands.length && state.brands.indexOf(p.brand) === -1) return false;
    if (state.statuses.length && state.statuses.indexOf(p.status) === -1) return false;
    if (state.prices.length) {
      var ok = state.prices.some(function (id) {
        var b = PRICE_BUCKETS.find(function (x) { return x.id === id; });
        return p.price >= b.min && p.price < b.max;
      });
      if (!ok) return false;
    }
    return true;
  }
  function sortList(list) {
    var s = state.sort;
    var arr = list.slice();
    if (s === 'price-asc') arr.sort(function (a, b) { return a.price - b.price; });
    else if (s === 'price-desc') arr.sort(function (a, b) { return b.price - a.price; });
    else if (s === 'brand') arr.sort(function (a, b) { return (a.brand + a.name).localeCompare(b.brand + b.name, 'de'); });
    /* 'new' — nach Anlagedatum aus Shopify, neueste zuerst. Die Rangfolge
     * erhaeltlich → reserviert → verkauft bleibt dabei erhalten, sonst
     * draengten sich verkaufte Uhren vor den Bestand. */
    else {
      var RANG = { available: 0, reserved: 1, sold: 2 };
      arr.sort(function (a, b) {
        var r = (RANG[a.status] || 0) - (RANG[b.status] || 0);
        if (r) return r;
        return String(b.added || '').localeCompare(String(a.added || ''));
      });
    }
    return arr;
  }

  var grid = document.getElementById('shopGrid');
  var empty = document.getElementById('emptyResult');

  function render() {
    var list = sortList(ALL.filter(matches));
    grid.innerHTML = list.map(HV.renderCard).join('');
    empty.hidden = list.length !== 0;
    grid.style.display = list.length ? '' : 'none';
    document.getElementById('bandCount').textContent =
      list.length + ' von ' + ALL.length + ' Referenzen';
    renderChips();
    updateFilterCounts();
    if (window.gsap) {
      gsap.fromTo(grid.children, { opacity: 0, y: 22 },
        { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out', stagger: { each: 0.035, grid: 'auto' } });
    }
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  function renderChips() {
    var chips = [];
    state.brands.forEach(function (b) { chips.push({ f: 'brands', v: b, label: b }); });
    state.prices.forEach(function (id) {
      chips.push({ f: 'prices', v: id, label: PRICE_BUCKETS.find(function (x) { return x.id === id; }).label });
    });
    state.statuses.forEach(function (s) {
      chips.push({ f: 'statuses', v: s, label: STATUS_OPTS.find(function (x) { return x.id === s; }).label });
    });
    document.getElementById('activeChips').innerHTML = chips.map(function (c) {
      return '<button class="chip-x" data-cf="' + c.f + '" data-cv="' + c.v + '">' + c.label + ' ✕</button>';
    }).join('');
  }

  function updateFilterCounts() {
    document.querySelectorAll('.filter').forEach(function (f) {
      var key = f.dataset.filter === 'brand' ? 'brands' : f.dataset.filter === 'price' ? 'prices' : 'statuses';
      var n = state[key].length;
      var el = f.querySelector('.fcount');
      el.hidden = n === 0;
      el.textContent = n;
    });
  }

  /* ---------- events ---------- */
  document.querySelectorAll('.cat-toggle button').forEach(function (btn) {
    if (btn.dataset.cat === state.cat) {
      document.querySelectorAll('.cat-toggle button').forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
    }
    btn.addEventListener('click', function () {
      document.querySelectorAll('.cat-toggle button').forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      state.cat = btn.dataset.cat;
      document.getElementById('bandTitle').textContent =
        state.cat === 'uhren' ? 'Uhren' : state.cat === 'zubehoer' ? 'Zubehör' :
        state.cat === 'reduziert' ? 'Reduziert' : 'Shop';
      render();
    });
  });

  document.addEventListener('change', function (e) {
    var input = e.target.closest('.filter-panel input');
    if (!input) return;
    var key = input.dataset.f;
    if (input.checked) { if (state[key].indexOf(input.value) === -1) state[key].push(input.value); }
    else state[key] = state[key].filter(function (v) { return v !== input.value; });
    render();
  });

  document.getElementById('activeChips').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip-x');
    if (!chip) return;
    state[chip.dataset.cf] = state[chip.dataset.cf].filter(function (v) { return v !== chip.dataset.cv; });
    document.querySelectorAll('.filter-panel input[data-f="' + chip.dataset.cf + '"]').forEach(function (i) {
      if (i.value === chip.dataset.cv) i.checked = false;
    });
    render();
  });

  document.getElementById('clearAll').addEventListener('click', function () {
    state.brands = []; state.prices = []; state.statuses = [];
    document.querySelectorAll('.filter-panel input').forEach(function (i) { i.checked = false; });
    render();
  });

  document.getElementById('sortSelect').addEventListener('change', function (e) {
    state.sort = e.target.value;
    render();
  });

  /* dropdown open/close */
  document.querySelectorAll('.filter').forEach(function (f) {
    f.querySelector('.filter-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = f.classList.contains('is-open');
      document.querySelectorAll('.filter.is-open').forEach(function (o) { o.classList.remove('is-open'); });
      if (!wasOpen) f.classList.add('is-open');
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.filter')) {
      document.querySelectorAll('.filter.is-open').forEach(function (o) { o.classList.remove('is-open'); });
    }
  });

  render();
});

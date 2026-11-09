/* HAHN & VO — product card rendering shared by home, shop and product page. */
(function () {
  'use strict';
  var HV = (window.HV = window.HV || {});

  HV.byId = function (id) {
    return (window.PRODUCTS || []).find(function (p) { return p.id === id; });
  };

  HV.statusLabel = { available: 'Erhältlich', anfrage: 'Per Überweisung', reserved: 'Reserviert', sold: 'Verkauft' };

  /* Rabatt in ganzen Prozent, kaufmännisch gerundet (7,3 % → 7, 7,5 % → 8).
     Leer, wenn die Uhr nicht reduziert ist. */
  HV.rabattText = function (p) {
    if (!(p.status !== 'sold' && p.listPrice && p.listPrice > p.price)) return '';
    var pr = Math.round((p.listPrice - p.price) / p.listPrice * 100);
    return pr >= 1 ? ' \u2212' + pr + '\u202f%' : '';
  };

  HV.renderCard = function (p) {
    var imgA = p.images[0] || '';
    var imgB = p.images[1] || imgA;
    var soldCls = p.status === 'sold' ? ' is-sold' : '';
    /* listPrice ist der Vorher-Preis (Shopify: Vergleichspreis) — reduzierte
       Uhren zeigen ihn durchgestrichen neben dem neuen Preis. */
    var reduziert = p.status !== 'sold' && p.listPrice && p.listPrice > p.price;
    var priceHtml = p.status === 'sold'
      ? '<span class="sold-label num">' + HV.fmtEUR(p.price) + '</span>'
      : '<span class="num">' + HV.fmtEUR(p.price) + '</span>' +
        (reduziert ? '<span class="was num">' + HV.fmtEUR(p.listPrice) + '</span>' : '');
    var spec = [p.ref ? 'Ref. ' + p.ref : null, p.year, p.fullset, p.rating ? 'Zustand: ' + p.rating : null]
      .filter(Boolean).join(' · ');
    return '<article class="product-card' + soldCls + '" data-id="' + p.id + '">' +
      '<div class="pc-media">' +
        '<span class="pc-status status status-' + p.status + '">' + HV.statusLabel[p.status] + '</span>' +
        (reduziert ? '<span class="pc-sale">Reduziert' + HV.rabattText(p) + '</span>' : '') +
        '<img class="img-a" src="' + imgA + '" alt="' + p.brand + ' ' + p.name + '" loading="lazy">' +
        '<img class="img-b" src="' + imgB + '" alt="" loading="lazy" aria-hidden="true">' +
      '</div>' +
      '<div class="pc-body">' +
        '<span class="pc-brand">' + p.brand + '</span>' +
        '<div class="pc-title-zone">' +
          '<h2 class="pc-name">' + p.name + '</h2>' +
          '<span class="pc-specline">' + spec + '</span>' +
        '</div>' +
        '<div class="pc-price">' + priceHtml + '</div>' +
      '</div>' +
      '<a class="pc-link" href="/produkt?id=' + p.id + '" aria-label="' + p.brand + ' ' + p.name + '"></a>' +
    '</article>';
  };
})();

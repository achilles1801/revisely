// The one setting for revisely.app/donate/.
//
// PLACEHOLDER: DONATE_URL is the payment page the Donate button opens, for
// example a Stripe Payment Link ("https://buy.stripe.com/..."). While it is
// empty the page has no button and says donations open soon.
var DONATE_URL = '';

(function () {
  var box = document.querySelector('[data-donate]');
  if (!box) return;
  var open = /^https:\/\/[^\s"'<>]+$/.test(DONATE_URL);
  if (open) box.querySelector('a').href = DONATE_URL;
  box.setAttribute('data-state', open ? 'open' : 'soon');
})();

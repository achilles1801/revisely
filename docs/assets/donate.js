// The one setting for revisely.app/donate/.
//
// DONATE_URL is the payment page the Donate button opens: Revisely's Stripe
// Payment Link (customers choose the amount; one-time). Set it to '' to take
// the button down: the page then says donations open soon.
var DONATE_URL = 'https://donate.stripe.com/28E00k8FI27XalTdRi4gg00';

(function () {
  var box = document.querySelector('[data-donate]');
  if (!box) return;
  var open = /^https:\/\/[^\s"'<>]+$/.test(DONATE_URL);
  if (open) box.querySelector('a').href = DONATE_URL;
  box.setAttribute('data-state', open ? 'open' : 'soon');
})();

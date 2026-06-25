function safeNow(ctx) {
  return ctx?.currentTime ?? 0;
}

function makeClick(ctx) {
  const t0 = safeNow(ctx);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(900, t0);

  gain.gain.setValueAtTime(0.00001, t0);
  gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.00001, t0 + 0.060);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t0);
  osc.stop(t0 + 0.070);
}

function installTapSound({
  enabled = true,
  selector = 'button, .product-card, .filter, .cart-row, .customer-type-card, .detail-backdrop'
} = {}) {
  if (!enabled) return;

  let ctx = null;
  let lastAt = 0;

  document.addEventListener('pointerdown', (ev) => {
    try {
      if (ev && ev.button != null && ev.button !== 0) return;

      const target = ev.target;
      if (!target || !(target instanceof Element)) return;
      if (!target.closest(selector)) return;

      const now = performance.now();
      if (now - lastAt < 45) return;
      lastAt = now;

      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
      }

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      makeClick(ctx);

      if (navigator.vibrate) navigator.vibrate(8);
    } catch {
      // zvuk nesmí nikdy rozbít UI
    }
  }, { passive: true });
}
// Money you can see: coins and cash flying up into wherever your Salary is shown.

import coinArt from '../assets/art/coin.webp';
import cashArt from '../assets/art/cash.webp';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function centre(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Is this element actually on screen right now? */
export function onScreen(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

/**
 * Throws `coins` coins (and `bills` stacks of cash) from one element to another, arcing up
 * and over. Calls `landed` when the first one arrives so the target can hop.
 */
export function moneyBurst(from: Element, to: Element, coins: number, bills = 0, landed?: () => void) {
  if (reducedMotion()) return landed?.();
  const a = centre(from);
  const b = centre(to);
  const n = coins + bills;
  let first = true;
  for (let i = 0; i < n; i++) {
    const bill = i < bills;
    const img = document.createElement('img');
    img.src = bill ? cashArt : coinArt;
    img.alt = '';
    img.className = bill ? 'fly-money bill' : 'fly-money';
    const size = bill ? 46 : 24;
    img.style.width = `${size}px`;
    img.style.left = `${a.x - size / 2}px`;
    img.style.top = `${a.y - size / 2}px`;
    document.body.append(img);
    const spread = (Math.random() - 0.5) * 70;
    const lift = 70 + Math.random() * 60;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const anim = img.animate(
      [
        { transform: 'translate(0, 0) scale(0.6) rotate(0deg)', opacity: 0 },
        { transform: `translate(${spread}px, ${-lift * 0.6}px) scale(1.1) rotate(${spread}deg)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${dx * 0.55 + spread * 0.5}px, ${Math.min(dy, 0) - lift}px) scale(1) rotate(${spread * 2}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.5) rotate(${spread * 3}deg)`, opacity: 0.9 },
      ],
      { duration: 620 + Math.random() * 160, delay: i * 45, easing: 'cubic-bezier(.3,.1,.5,1)', fill: 'forwards' },
    );
    anim.finished
      .catch(() => undefined)
      .then(() => {
        img.remove();
        if (first) {
          first = false;
          landed?.();
        }
      });
  }
}

/** A big "+$90" that floats up from somewhere, with a line of explanation under it. */
export function bigFloater(at: Element, amount: string, note?: string) {
  const c = centre(at);
  const f = document.createElement('div');
  f.className = 'money-floater';
  f.innerHTML = `<b>${amount}</b>${note ? `<span>${note}</span>` : ''}`;
  f.style.left = `${c.x}px`;
  f.style.top = `${c.y}px`;
  document.body.append(f);
  setTimeout(() => f.remove(), reducedMotion() ? 1500 : 2200);
}

/** How many coins a payment is worth throwing. */
export function coinsFor(amount: number) {
  return Math.max(1, Math.min(7, Math.round(Math.log2(amount + 1))));
}

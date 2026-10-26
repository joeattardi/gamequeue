/**
 * Small animation helpers built on the Web Animations API. Every one of them does nothing when the
 * user prefers reduced motion.
 *
 * Script-driven rather than CSS keyframes on purpose: a CSS animation restarts whenever React moves
 * the element (a drag, a re-sort), while one started here plays once per element.
 */

export function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const revealed = new WeakSet<Element>();
/** Elements mounted this close together fade in as one staggered batch (a page, a "Load more"). */
const BATCH_MS = 100;
/** Stagger per item, and the most items it adds up over, so long lists don't take long to appear. */
const STAGGER_MS = 35;
const MAX_STAGGER = 14;
let batchAt = -Infinity;
let batchSize = 0;

/**
 * Fades a list item in as it mounts, staggered after the other items mounted with it. Use as a
 * callback ref (`ref={reveal}`); calling it again for the same element does nothing.
 */
export function reveal(el: Element | null) {
    if (!el || revealed.has(el)) return;
    revealed.add(el);
    if (prefersReducedMotion()) return;
    const now = performance.now();
    if (now - batchAt > BATCH_MS) {
        batchAt = now;
        batchSize = 0;
    }
    el.animate(
        [
            { opacity: 0, transform: 'translateY(8px) scale(0.98)' },
            { opacity: 1, transform: 'none' }
        ],
        {
            duration: 400,
            delay: Math.min(batchSize++, MAX_STAGGER) * STAGGER_MS,
            easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
            fill: 'backwards'
        }
    );
}

/** A quick swell, for a value that just changed in place (a status badge). */
export function pop(el: Element | null) {
    if (!el || prefersReducedMotion()) return;
    el.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
        { duration: 350, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }
    );
}

const CONFETTI_COLORS = [
    '--accent',
    '--status-good',
    '--status-mid',
    '--favorite',
    '--viz-3',
    '--viz-4'
];
const CONFETTI_PIECES = 48;
/** Downward pull in px/s², and how many points sample each piece's arc */
const GRAVITY = 1100;
const ARC_STEPS = 12;

/**
 * One burst of confetti from near the top of `from`, for finishing a game. Drawn in a fixed,
 * click-through layer on `body` that removes itself when the pieces have fallen.
 */
export function celebrate(from: Element | null) {
    if (!from || prefersReducedMotion()) return;
    const rect = from.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + Math.min(rect.height / 2, 80);

    const layer = document.createElement('div');
    layer.className = 'confetti';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);

    const falls = Array.from({ length: CONFETTI_PIECES }, (_, i) => {
        const piece = document.createElement('i');
        piece.style.left = `${x}px`;
        piece.style.top = `${y}px`;
        piece.style.background = `var(${CONFETTI_COLORS[i % CONFETTI_COLORS.length]})`;
        layer.append(piece);

        // Mostly upwards, fanned out about 80° either side
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
        const speed = 320 + Math.random() * 320;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const seconds = 1.1 + Math.random() * 0.5;
        const spin = (Math.random() - 0.5) * 1080;
        const frames = Array.from({ length: ARC_STEPS + 1 }, (_, step) => {
            const f = step / ARC_STEPS;
            const t = f * seconds;
            return {
                offset: f,
                transform: `translate(${vx * t}px, ${vy * t + (GRAVITY * t * t) / 2}px) rotate(${spin * f}deg)`,
                opacity: f < 0.7 ? 1 : (1 - f) / 0.3
            };
        });
        return piece.animate(frames, { duration: seconds * 1000, fill: 'forwards' }).finished;
    });
    Promise.allSettled(falls).then(() => layer.remove());
}

import { Dices, Gamepad2, Gift, ListOrdered, Sparkles } from 'lucide-react';

const POINTS = [
    { icon: Gamepad2, text: 'Slots for the few games you are really playing' },
    { icon: ListOrdered, text: 'A queue that remembers what is up next' },
    { icon: Dices, text: 'Random pick for when you cannot decide' },
    { icon: Gift, text: 'A wishlist with release dates and best prices' },
    { icon: Sparkles, text: 'Stats and a yearly recap of what you finished' }
];

/** Decorative brand panel beside the sign-in and sign-up forms. */
export function AuthShowcase() {
    return (
        <aside className="auth__showcase" aria-label="About GameQueue">
            <p className="auth__tagline">Stop scrolling your library. Start playing.</p>
            <ul className="auth__points">
                {POINTS.map(({ icon: Icon, text }) => (
                    <li key={text}>
                        <span className="auth__point-icon" aria-hidden="true">
                            <Icon />
                        </span>
                        {text}
                    </li>
                ))}
            </ul>
        </aside>
    );
}

import controller900 from '../assets/controller-900.webp';
import controller1600 from '../assets/controller-1600.webp';
import { Dices, Gamepad2, ListOrdered } from 'lucide-react';

const POINTS = [
    { icon: Gamepad2, text: 'Slots for the few games you are really playing' },
    { icon: ListOrdered, text: 'A queue that remembers what is up next' },
    { icon: Dices, text: 'Random pick for when you cannot decide' }
];

/** Decorative brand panel beside the sign-in and sign-up forms. */
export function AuthShowcase() {
    return (
        <aside className="auth__showcase" aria-label="About GameQueue">
            <img
                className="auth__photo"
                src={controller900}
                srcSet={`${controller900} 900w, ${controller1600} 1600w`}
                sizes="(min-width: 900px) 55vw, 0px"
                alt=""
                width={1600}
                height={1067}
                fetchPriority="high"
            />
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

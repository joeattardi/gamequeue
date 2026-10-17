import { Link } from 'react-router';
import { ArrowRight, Dices, ListChecks, SlidersHorizontal } from 'lucide-react';

const MODES = [
    {
        to: '/pick/criteria',
        icon: SlidersHorizontal,
        title: 'Pick by criteria',
        text: 'Let fate choose from your backlog, queue or a list, narrowed by platform, genre, tag or length.'
    },
    {
        to: '/pick/choose',
        icon: ListChecks,
        title: 'Choose between games',
        text: 'Hand-pick a few contenders, or load a list, and let fate choose the winner.'
    }
];

export function PickPage() {
    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>
                        <Dices aria-hidden="true" />
                        Random pick
                    </h1>
                    <p className="muted">Can't decide? Pick how you want fate to help.</p>
                </div>
            </div>
            <ul className="pick-modes">
                {MODES.map(({ to, icon: Icon, title, text }) => (
                    <li key={to}>
                        <Link className="pick-mode panel" to={to}>
                            <Icon className="pick-mode__icon" aria-hidden="true" />
                            <span className="pick-mode__title">{title}</span>
                            <span className="muted">{text}</span>
                            <ArrowRight className="pick-mode__go" aria-hidden="true" />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

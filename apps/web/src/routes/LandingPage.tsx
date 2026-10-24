import {
    ArrowRight,
    BarChart3,
    CalendarDays,
    Dices,
    Gamepad2,
    Gift,
    Globe,
    ListChecks,
    ListOrdered,
    Search,
    Layers
} from 'lucide-react';
import { coverSrcSet, coverUrl } from '@gamequeue/shared';
import { Link } from 'react-router';
import { useAuthConfig } from '../api/auth';
import { useShowcase } from '../api/showcase';
import { Footer } from '../components/Footer';
import { Logo } from '../components/Logo';
import { usePageTitle } from '../lib';

const FEATURES = [
    {
        icon: Gamepad2,
        title: 'Slots',
        text: 'Keep a handful of games in play at once. Put one in a slot to start it, finish it to free the slot.'
    },
    {
        icon: ListOrdered,
        title: 'Your queue',
        text: 'One ordered plan for what comes next. Drag to reorder; starting a game takes it off the queue.'
    },
    {
        icon: Dices,
        title: 'Random pick',
        text: 'Torn between forty unplayed games? Filter by platform, genre or time to beat and let fate choose.'
    },
    {
        icon: ListChecks,
        title: 'Lists and smart lists',
        text: 'Hand-made lists, plus rules like "under 10 hours, rated 80+ by critics" that keep themselves up to date.'
    },
    {
        icon: Gift,
        title: 'Wishlist',
        text: 'Track games you want, see when they release, and spot the best current price at well-known shops.'
    },
    {
        icon: Layers,
        title: 'Series',
        text: 'See every game in a series you own and queue the whole thing in one click.'
    },
    {
        icon: BarChart3,
        title: 'Stats',
        text: 'Finished per year, favourite platforms and genres, your top rated games and estimated play time.'
    },
    {
        icon: CalendarDays,
        title: 'Year in review',
        text: 'A shareable "Wrapped" for your gaming year, with its own link and preview card.'
    },
    {
        icon: Globe,
        title: 'Public profile',
        text: 'Show off what you are playing and what you have finished. Notes always stay private.'
    }
];

const STEPS = [
    {
        icon: Search,
        title: 'Add what you own',
        text: 'Search IGDB for a game, pick your platforms and it joins your collection with cover art and time to beat. Or import a library.'
    },
    {
        icon: ListOrdered,
        title: 'Line up what is next',
        text: 'Queue games in order, build lists, or let Random pick choose from your backlog.'
    },
    {
        icon: Gamepad2,
        title: 'Play and keep track',
        text: 'Start a game from a slot. Finishing it lands in your history, stats and yearly recap.'
    }
];

const MOCK_STATES = ['Playing', 'Playing', 'Paused'];
const MOCK_QUEUE = [18, 48, 330, 200, 25];

/** Home for logged-out visitors at `/`. */
export function LandingPage() {
    usePageTitle();
    const config = useAuthConfig();
    const showcase = useShowcase();
    const signups = config.data?.signupsEnabled !== false;

    return (
        <div className="landing">
            <header className="landing__bar">
                <Logo />
                <nav className="landing__nav" aria-label="Account">
                    <Link className="btn btn--ghost" to="/login">
                        Sign in
                    </Link>
                    {signups && (
                        <Link className="btn btn--primary" to="/register">
                            Get started
                        </Link>
                    )}
                </nav>
            </header>

            <main>
                <section className="landing__hero">
                    <div className="landing__hero-copy">
                        <p className="landing__eyebrow">Your collection, minus the guilt</p>
                        <h1>Know exactly what to play next.</h1>
                        <p className="landing__lead">
                            GameQueue keeps your whole game collection in one place and turns your
                            backlog into a plan: a few games in play, an ordered queue, and a random
                            pick when you would rather not choose.
                        </p>
                        <div className="landing__cta">
                            {signups ? (
                                <Link className="btn btn--primary btn--large" to="/register">
                                    Create your account
                                    <ArrowRight />
                                </Link>
                            ) : null}
                            <Link
                                className={`btn btn--large${signups ? '' : ' btn--primary'}`}
                                to="/login"
                            >
                                Sign in
                            </Link>
                        </div>
                    </div>

                    <div className="landing__mock" aria-hidden="true">
                        <div className="mock__slots">
                            {MOCK_STATES.map((state, i) => {
                                const g = showcase.data?.[i];
                                return (
                                    <div className="mock__slot" key={i}>
                                        {showcase.isPending ? (
                                            <>
                                                <span className="skeleton mock__cover" />
                                                <span className="skeleton skeleton--line" />
                                            </>
                                        ) : g ? (
                                            <>
                                                <img
                                                    className="mock__cover"
                                                    src={coverUrl(g.coverImageId, 'cover_big')}
                                                    srcSet={coverSrcSet(
                                                        g.coverImageId,
                                                        'cover_big'
                                                    )}
                                                    alt=""
                                                    width={264}
                                                    height={352}
                                                />
                                                <span className="mock__title">{g.name}</span>
                                            </>
                                        ) : (
                                            <div className="mock__cover mock__cover--empty">
                                                <Gamepad2 />
                                            </div>
                                        )}
                                        <span className="mock__label">
                                            Slot {i + 1} · {state}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mock__queue">
                            <span className="mock__label">Up next</span>
                            <div className="mock__queue-row">
                                {MOCK_QUEUE.map((h, i) => (
                                    <span
                                        key={h}
                                        className="mock__chip"
                                        style={{ '--h': h } as React.CSSProperties}
                                    >
                                        {i + 1}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="landing__section" aria-labelledby="how">
                    <h2 id="how">How it works</h2>
                    <ol className="landing__steps">
                        {STEPS.map(({ icon: Icon, title, text }, i) => (
                            <li key={title}>
                                <span className="landing__step-num" aria-hidden="true">
                                    {i + 1}
                                </span>
                                <h3>
                                    <Icon aria-hidden="true" />
                                    {title}
                                </h3>
                                <p className="muted">{text}</p>
                            </li>
                        ))}
                    </ol>
                </section>

                <section className="landing__section" aria-labelledby="features">
                    <h2 id="features">Everything a backlog needs</h2>
                    <ul className="landing__features">
                        {FEATURES.map(({ icon: Icon, title, text }) => (
                            <li key={title}>
                                <span className="landing__feature-icon" aria-hidden="true">
                                    <Icon />
                                </span>
                                <h3>{title}</h3>
                                <p className="muted">{text}</p>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="landing__final">
                    <h2>Your next game is already in your library.</h2>
                    <p>Let GameQueue help you find it.</p>
                    <div className="landing__cta landing__cta--center">
                        {signups && (
                            <Link className="btn btn--large landing__final-primary" to="/register">
                                Create your account
                                <ArrowRight />
                            </Link>
                        )}
                        <Link className="btn btn--large btn--on-dark" to="/login">
                            Sign in
                        </Link>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
}

import { Database, Gift, ListOrdered, Gamepad2, Search } from 'lucide-react';
import { Link } from 'react-router';
import { useFirstName } from '../api/auth';

/** Home page for a brand-new user: nothing collected or wishlisted yet, so point at ways to start. */
export function Welcome() {
    const firstName = useFirstName();
    return (
        <div className="home welcome">
            <h1>{firstName ? `Welcome to GameQueue, ${firstName}` : 'Welcome to GameQueue'}</h1>
            <p className="muted welcome__lead">
                Your games, and what to play next. Start by adding a few to your collection.
            </p>
            <div className="welcome__actions">
                <Link className="btn btn--primary" to="/search">
                    <Search />
                    Find your first game
                </Link>
                <Link className="btn" to="/data">
                    <Database />
                    Import a library
                </Link>
                <Link className="btn" to="/wishlist">
                    <Gift />
                    Start a wishlist
                </Link>
            </div>
            <ol className="welcome__steps">
                <li className="panel">
                    <span className="welcome__icon">
                        <Search aria-hidden="true" />
                    </span>
                    <h2>Add what you own</h2>
                    <p className="muted">
                        Search for a game, pick the platforms you have it on and it joins your
                        collection. Anything you haven't played yet is your backlog.
                    </p>
                </li>
                <li className="panel">
                    <span className="welcome__icon">
                        <ListOrdered aria-hidden="true" />
                    </span>
                    <h2>Line up what's next</h2>
                    <p className="muted">
                        Put games in your queue in the order you want to play them, or let Random
                        pick choose from your backlog.
                    </p>
                </li>
                <li className="panel">
                    <span className="welcome__icon">
                        <Gamepad2 aria-hidden="true" />
                    </span>
                    <h2>Play and keep track</h2>
                    <p className="muted">
                        Put a game in a slot to start it. Finish it and it goes into your history,
                        stats and yearly recap.
                    </p>
                </li>
            </ol>
        </div>
    );
}

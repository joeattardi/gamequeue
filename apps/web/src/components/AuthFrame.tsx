import { Link } from 'react-router';
import { LogoMark } from './Logo';

/** The centred card of the email-link pages (confirm, forgot and reset password); no showcase. */
export function AuthFrame({ children }: { children: React.ReactNode }) {
    return (
        <main className="auth auth--single">
            <div className="auth__panel">
                <div className="auth__card panel stack">
                    <Link className="auth__brand" to="/" aria-label="GameQueue home">
                        <span className="landing__mark auth__mark">
                            <LogoMark />
                        </span>
                        <span className="auth__brand-name" aria-hidden="true">
                            GameQueue
                        </span>
                    </Link>
                    {children}
                </div>
            </div>
        </main>
    );
}

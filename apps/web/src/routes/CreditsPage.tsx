import { AVATAR_ICONS, AVATAR_ICON_AUTHORS, type AvatarIconAuthor } from '@gamequeue/shared';
import { Footer } from '../components/Footer';
import { PublicHeader } from '../components/PublicHeader';
import { usePageTitle } from '../lib';

function External({ href, children }: { href: string; children: string }) {
    return (
        <a href={href} target="_blank" rel="noreferrer">
            {children}
        </a>
    );
}

const AUTHORS = Object.keys(AVATAR_ICON_AUTHORS) as AvatarIconAuthor[];

/** Attributions for the data, art and software GameQueue builds on. Public, so it has its own header and footer. */
export function CreditsPage() {
    usePageTitle('Credits');
    return (
        <>
            <PublicHeader />
            <main className="page credits">
                <h1>Credits</h1>
                <p className="muted">GameQueue stands on other people's work. Thank you.</p>

                <section aria-labelledby="credits-igdb">
                    <h2 id="credits-igdb">Game data</h2>
                    <p>
                        Game information, cover art, scores, release dates and time-to-beat
                        estimates come from{' '}
                        <External href="https://www.igdb.com">IGDB.com</External>, a Twitch company,
                        which is built from contributions by its community. Game titles, cover art
                        and trademarks belong to their respective owners.
                    </p>
                </section>

                <section aria-labelledby="credits-itad">
                    <h2 id="credits-itad">Prices</h2>
                    <p>
                        Wishlist and game page prices come from{' '}
                        <External href="https://isthereanydeal.com/">IsThereAnyDeal</External>, when
                        the server has an API key for it.
                    </p>
                </section>

                <section aria-labelledby="credits-icons">
                    <h2 id="credits-icons">Profile icons</h2>
                    <p>
                        The preset profile pictures are from{' '}
                        <External href="https://game-icons.net">Game-icons.net</External>, used
                        under the{' '}
                        <External href="https://creativecommons.org/licenses/by/3.0/">
                            Creative Commons Attribution 3.0
                        </External>{' '}
                        license. They are shown in white on a coloured background; the artwork
                        itself is unchanged. Icons made by{' '}
                        {AUTHORS.map((key, i) => (
                            <span key={key}>
                                {i > 0 && (i === AUTHORS.length - 1 ? ' and ' : ', ')}
                                <External href={AVATAR_ICON_AUTHORS[key].url}>
                                    {AVATAR_ICON_AUTHORS[key].name}
                                </External>
                            </span>
                        ))}
                        .
                    </p>
                    <dl className="credits__icons">
                        {AUTHORS.map((key) => (
                            <div key={key}>
                                <dt>{AVATAR_ICON_AUTHORS[key].name}</dt>
                                <dd>
                                    {AVATAR_ICONS.filter((i) => i.author === key)
                                        .map((i) => i.label)
                                        .join(', ')}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>

                <section aria-labelledby="credits-software">
                    <h2 id="credits-software">Fonts and software</h2>
                    <p>
                        Headings use{' '}
                        <External href="https://fonts.google.com/specimen/Bricolage+Grotesque">
                            Bricolage Grotesque
                        </External>{' '}
                        and text uses{' '}
                        <External href="https://fonts.google.com/specimen/Figtree">
                            Figtree
                        </External>
                        , both under the SIL Open Font License. Interface icons are from{' '}
                        <External href="https://lucide.dev">Lucide</External> (ISC license).
                    </p>
                    <p>
                        GameQueue is built with open-source software, including React, Vite,
                        TanStack Query, dnd kit, Hono, Drizzle ORM, SQLite, satori and sharp.
                    </p>
                </section>
            </main>
            <Footer />
        </>
    );
}

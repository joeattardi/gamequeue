import type { SlotDto } from '@gamequeue/shared';
import { useState } from 'react';
import { AssignDialog } from '../components/AssignDialog';
import { ManageSlotsDialog } from '../components/ManageSlotsDialog';
import { SlotSkeletons } from '../components/HomeSkeletons';
import { ReleasingSoon } from '../components/ReleasingSoon';
import { UpNext } from '../components/UpNext';
import { SlotBay } from '../components/SlotBay';
import { useSlots } from '../api/slots';
import { useStats } from '../api/stats';
import { useWishlistCount } from '../api/wishlist';
import { Welcome } from '../components/Welcome';
import { DismissiblePreviewNotice } from '../components/PreviewNotice';
import { LogoMark } from '../components/Logo';
import { Gamepad2, SlidersHorizontal } from 'lucide-react';
import { useFirstName } from '../api/auth';
import { greeting, usePageTitle } from '../lib';

export function Home() {
    usePageTitle('Now playing');
    const slots = useSlots();
    const firstName = useFirstName();
    const [assigning, setAssigning] = useState<SlotDto | null>(null);
    const [managing, setManaging] = useState(false);
    const stats = useStats();
    const wishlisted = useWishlistCount();

    // Nothing owned (so nothing queued, listed or slotted either) and nothing wishlisted
    if (stats.data?.overview.total === 0 && wishlisted.data === 0)
        return (
            <>
                <DismissiblePreviewNotice />
                <Welcome />
            </>
        );

    const overview = stats.data?.overview;
    const summary = overview
        ? `${overview.byStatus.playing} playing · ${overview.byStatus.paused} paused · ${overview.backlogCount} in the backlog`
        : '\u00a0';

    return (
        <div className="home">
            <DismissiblePreviewNotice />
            <header className="home-hero">
                <span className="home-hero__icon" aria-hidden="true">
                    <LogoMark />
                </span>
                <h1>{greeting(firstName)}</h1>
                <p className="home-hero__sub">{summary}</p>
            </header>
            <section aria-labelledby="playing-h" className="home-section home-section--first">
                <div className="page-head">
                    <div>
                        <h2 id="playing-h">
                            <Gamepad2 aria-hidden="true" />
                            Now playing
                        </h2>
                        <p className="muted">What's in each slot right now.</p>
                    </div>
                    <button className="btn" onClick={() => setManaging(true)}>
                        <SlidersHorizontal />
                        Edit slots
                    </button>
                </div>
                {slots.isError ? (
                    <p className="form-error" role="alert">
                        Couldn't load your slots.
                    </p>
                ) : slots.isPending ? (
                    <SlotSkeletons />
                ) : (
                    <ul className="bays" aria-busy={slots.isFetching}>
                        {slots.data?.map((slot) => (
                            <SlotBay key={slot.id} slot={slot} onChoose={setAssigning} />
                        ))}
                    </ul>
                )}
                {/* Re-read the slot from fresh data so the dialog never shows a stale occupant */}
                <AssignDialog
                    slot={
                        assigning ? (slots.data?.find((s) => s.id === assigning.id) ?? null) : null
                    }
                    onClose={() => setAssigning(null)}
                />
            </section>
            <UpNext />
            <ReleasingSoon />
            <ManageSlotsDialog open={managing} onClose={() => setManaging(false)} />
        </div>
    );
}

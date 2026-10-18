import type { SlotDto } from '@gamequeue/shared';
import { useState } from 'react';
import { AssignDialog } from '../components/AssignDialog';
import { ManageSlotsDialog } from '../components/ManageSlotsDialog';
import { SlotSkeletons } from '../components/HomeSkeletons';
import { UpNext } from '../components/UpNext';
import { SlotBay } from '../components/SlotBay';
import { useSlots } from '../api/slots';
import { House, SlidersHorizontal } from 'lucide-react';

export function Home() {
    const slots = useSlots();
    const [assigning, setAssigning] = useState<SlotDto | null>(null);
    const [managing, setManaging] = useState(false);

    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>
                        <House aria-hidden="true" />
                        Now playing
                    </h1>
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
                slot={assigning ? (slots.data?.find((s) => s.id === assigning.id) ?? null) : null}
                onClose={() => setAssigning(null)}
            />
            <UpNext />
            <ManageSlotsDialog open={managing} onClose={() => setManaging(false)} />
        </section>
    );
}

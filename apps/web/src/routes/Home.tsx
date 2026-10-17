import type { SlotDto } from '@gamequeue/shared';
import { useState } from 'react';
import { AssignDialog } from '../components/AssignDialog';
import { ManageSlotsDialog } from '../components/ManageSlotsDialog';
import { SlotBay } from '../components/SlotBay';
import { useSlots } from '../api/slots';

export function Home() {
    const slots = useSlots();
    const [assigning, setAssigning] = useState<SlotDto | null>(null);
    const [managing, setManaging] = useState(false);

    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>Now playing</h1>
                    <p className="muted">What's in each slot right now.</p>
                </div>
                <button className="btn" onClick={() => setManaging(true)}>
                    Edit slots
                </button>
            </div>
            {slots.isError ? (
                <p className="form-error" role="alert">
                    Couldn't load your slots.
                </p>
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
            <ManageSlotsDialog open={managing} onClose={() => setManaging(false)} />
        </section>
    );
}

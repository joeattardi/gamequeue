import { SlotEditSkeletons } from './PageSkeletons';
import { MAX_SLOTS, type SlotDto } from '@gamequeue/shared';
import { useState, type FormEvent } from 'react';
import { ApiRequestError } from '../api/client';
import {
    useCreateSlot,
    useDeleteSlot,
    useRenameSlot,
    useReorderSlots,
    useSlots
} from '../api/slots';
import { useConfirm } from './Confirm';
import { useModalDialog } from './useModalDialog';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

export function ManageSlotsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const ref = useModalDialog(open);
    return (
        <dialog
            ref={ref}
            className="dialog"
            onClose={onClose}
            aria-labelledby="slots-title"
            onClick={(e) => e.target === ref.current && onClose()}
        >
            {open && <Body onDone={onClose} />}
        </dialog>
    );
}

function Body({ onDone }: { onDone: () => void }) {
    const slots = useSlots();
    const create = useCreateSlot();
    const reorder = useReorderSlots();
    const [name, setName] = useState('');
    const [error, setError] = useState<string>();
    const list = slots.data ?? [];
    const fail = (e: unknown) =>
        setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');

    function move(index: number, by: -1 | 1) {
        const ids = list.map((s) => s.id);
        const [id] = ids.splice(index, 1);
        ids.splice(index + by, 0, id!);
        setError(undefined);
        reorder.mutate(ids, { onError: fail });
    }

    function add(e: FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;
        setError(undefined);
        create.mutate(name.trim(), { onSuccess: () => setName(''), onError: fail });
    }

    return (
        <div className="dialog__body">
            <div className="dialog__head">
                <h2 id="slots-title">Edit slots</h2>
                <button className="btn btn--ghost" onClick={onDone} aria-label="Close">
                    <X />
                </button>
            </div>
            {slots.isPending ? (
                <SlotEditSkeletons />
            ) : (
                <ul className="slot-edit">
                    {list.map((slot, i) => (
                        <SlotRow
                            key={slot.id}
                            slot={slot}
                            canUp={i > 0}
                            canDown={i < list.length - 1}
                            onMove={(by) => move(i, by)}
                            onError={fail}
                        />
                    ))}
                </ul>
            )}
            <form className="inline-form" onSubmit={add}>
                <label className="field field--grow">
                    <span>New slot</span>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={40}
                        placeholder="e.g. Couch co-op"
                        disabled={list.length >= MAX_SLOTS}
                    />
                </label>
                <button
                    className="btn"
                    type="submit"
                    disabled={create.isPending || list.length >= MAX_SLOTS}
                >
                    Add slot
                </button>
            </form>
            {list.length >= MAX_SLOTS && (
                <p className="muted">That's the maximum of {MAX_SLOTS} slots.</p>
            )}
            <p className="form-error" role="alert">
                {error}
            </p>
        </div>
    );
}

function SlotRow({
    slot,
    canUp,
    canDown,
    onMove,
    onError
}: {
    slot: SlotDto;
    canUp: boolean;
    canDown: boolean;
    onMove: (by: -1 | 1) => void;
    onError: (e: unknown) => void;
}) {
    const rename = useRenameSlot();
    const del = useDeleteSlot();
    const confirm = useConfirm();
    const [name, setName] = useState(slot.name);
    const commit = () => {
        const next = name.trim();
        if (!next) return setName(slot.name);
        if (next !== slot.name)
            rename.mutate({ slotId: slot.id, name: next }, { onError: onError });
    };
    return (
        <li className="slot-edit__row">
            <label className="field field--grow">
                <span className="sr-only">Slot name</span>
                <input
                    value={name}
                    maxLength={40}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) =>
                        e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())
                    }
                />
            </label>
            <div className="row">
                <button
                    className="btn btn--ghost"
                    disabled={!canUp}
                    onClick={() => onMove(-1)}
                    aria-label={`Move ${slot.name} up`}
                >
                    <ChevronUp />
                </button>
                <button
                    className="btn btn--ghost"
                    disabled={!canDown}
                    onClick={() => onMove(1)}
                    aria-label={`Move ${slot.name} down`}
                >
                    <ChevronDown />
                </button>
                <button
                    className="btn btn--ghost btn--danger"
                    disabled={del.isPending}
                    onClick={async () =>
                        (await confirm({
                            title: `Delete ${slot.name}?`,
                            message: slot.entry
                                ? `${slot.entry.game.name} will be paused, not removed from your collection.`
                                : 'The slot is empty, so nothing else changes.',
                            confirmLabel: 'Delete slot',
                            tone: 'danger'
                        })) && del.mutate(slot.id, { onError })
                    }
                >
                    Delete
                </button>
            </div>
        </li>
    );
}

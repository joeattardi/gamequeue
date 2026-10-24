import type { ProfileBadge as Badge } from '@gamequeue/shared';
import { Crown, ShieldCheck } from 'lucide-react';

const BADGES: Record<Badge, { label: string; title: string; icon: typeof Crown }> = {
    founder: { label: 'Founder', title: 'Founder of GameQueue', icon: Crown },
    staff: { label: 'Staff', title: 'GameQueue staff', icon: ShieldCheck }
};

/** A small pill beside a profile's name: the site's founder, or an admin ("staff"). */
export function ProfileBadge({ badge }: { badge: Badge }) {
    const { label, title, icon: Icon } = BADGES[badge];
    return (
        <span className={`profile-badge profile-badge--${badge}`} title={title}>
            <Icon aria-hidden="true" />
            {label}
        </span>
    );
}

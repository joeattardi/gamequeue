import type { GameDto } from '@gamequeue/shared';
import { formatMinutes } from '../lib';

/** IGDB's time to beat; renders nothing when IGDB has no data for the game. */
export function TimeToBeat({ ttb, id = 'ttb-h' }: { ttb: GameDto['ttb']; id?: string }) {
    if (!ttb) return null;
    return (
        <section aria-labelledby={id} className="panel">
            <h2 id={id}>Time to beat</h2>
            <dl className="ttb">
                <div>
                    <dt>Hasty</dt>
                    <dd>{formatMinutes(ttb.hastily)}</dd>
                </div>
                <div>
                    <dt>Normal</dt>
                    <dd>{formatMinutes(ttb.normally)}</dd>
                </div>
                <div>
                    <dt>Completionist</dt>
                    <dd>{formatMinutes(ttb.completely)}</dd>
                </div>
            </dl>
        </section>
    );
}

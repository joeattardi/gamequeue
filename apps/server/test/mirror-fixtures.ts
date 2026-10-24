import { Readable } from 'node:stream';
import type { DumpSource } from '../src/mirror/dumps.js';
import { MIRROR_ENDPOINTS } from '../src/mirror/run.js';

export const GAME_HEADER =
    'id,name,slug,summary,first_release_date,game_type,version_parent,cover,screenshots,total_rating,total_rating_count,similar_games,platforms,genres,themes,collections';

// Quoting on purpose: a comma, a quote and a newline inside the summary.
// 1 is in series 100 with 9 (a main game), 2 (DLC) and 3 (edition); its similar list has a DLC, an
// edition and an id the mirror doesn't know, none of which may show up.
export const GAMES = [
    GAME_HEADER,
    '1,Hades,hades,"Fight, ""out""\nof hell",2020-09-17 00:00:00,0,,10,"{1,2,3,4,5,6,7,8}",91.4,500,"{2,3,7,9,999,4}","{6,130}","{12}","{31}","{100}"',
    '2,Hades Soundtrack,hades-soundtrack,,2020-09-17 00:00:00,1,,,,,,,"{6}",,,"{100}"',
    '3,Hades (Deluxe),hades-deluxe,,,0,1,,,,,,,,,"{100}"',
    '4,Tunic,tunic,A fox.,2022-03-16 00:00:00,0,,11,"{9}",88.6,80,,"{6}","{12}",,',
    '5,Future Game,future,,2027-01-01 00:00:00,,,,,,,,,,,',
    '6,Café Dreams,cafe-dreams,,,13,,,,,,,,,,',
    '7,The Witcher 3: Wild Hunt,the-witcher-3,,2015-05-19 00:00:00,0,,12,,92.4,5000,,"{6}",,,',
    '8,Witcher Tales,witcher-tales,,,0,,,,,10,,,,,',
    '9,Hades II,hades-ii,,2025-05-06 00:00:00,0,,,,,100,,"{6}",,,"{100}"',
    '10,Baldur\'s Gate III,baldurs-gate-3,,2023-08-03 00:00:00,0,,,,,300,,"{6}",,,',
    '11,Final Fantasy VII,final-fantasy-vii,,1997-01-31 00:00:00,0,,,,,900,,"{6}",,,',
    '12,Final Fantasy VIII,final-fantasy-viii,,1999-02-11 00:00:00,0,,,,,800,,"{6}",,,',
    '13,Wild Witcher,wild-witcher,,,0,,,,,3000,,,,,',
    '14,Half-Life,half-life,,1998-11-19 00:00:00,0,,,,,50,,"{6}",,,',
    '15,Half-Life 2,half-life-2,,2004-11-16 00:00:00,0,,,,,400,,"{6}",,,'
].join('\n');

export const FIXTURES: Record<string, string> = {
    games: GAMES,
    covers: 'id,image_id\n10,co_hades\n11,co_tunic\n12,co_witcher',
    screenshots: 'id,image_id\n1,s1\n2,s2\n3,s3\n4,s4\n5,s5\n6,s6\n7,s7\n8,s8\n9,s9',
    game_time_to_beats:
        'id,game_id,hastily,normally,completely,count\n1,1,3600,7200,10800,12\n2,4,,,,0',
    // Hades: two platforms on the first date, one exact (0 = day) and one a quarter (3);
    // the later PC date must not count. Future Game is "TBD" (7) only.
    release_dates:
        'id,game,date,date_format\n1,1,2020-09-17 00:00:00,3\n2,1,2020-09-17 00:00:00,0\n3,1,2021-01-01 00:00:00,2\n4,4,2022-03-16 00:00:00,1\n5,5,2027-01-01 00:00:00,7',
    alternative_names:
        'id,name,comment,game,checksum\n1,FF7,,11,x\n2,FFVII,,11,x\n3,BG3,,10,x\n4,Tunica Fox,,4,x',
    platforms: 'id,name,abbreviation\n6,PC (Microsoft Windows),PC\n130,Nintendo Switch,',
    genres: 'id,name\n12,Role-playing (RPG)',
    themes: 'id,name\n31,Drama',
    collections: 'id,name\n100,Hades Series',
    game_types: 'id,type\n0,Main Game\n1,DLC\n13,Pack / Addon'
};

export function fakeSource(
    overrides: Partial<Record<string, string>> = {},
    dump = '1700000000_games.csv'
): DumpSource & { opened: string[] } {
    const files = { ...FIXTURES, ...overrides };
    const opened: string[] = [];
    return {
        opened,
        async list() {
            return MIRROR_ENDPOINTS.map((endpoint) => ({
                endpoint,
                fileName: endpoint === 'games' ? dump : `1700000000_${endpoint}.csv`,
                updatedAt: 1700000000
            }));
        },
        async open(endpoint) {
            opened.push(endpoint);
            return Readable.from([files[endpoint]!]);
        }
    };
}

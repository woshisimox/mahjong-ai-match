
export type Tile = string;
export type Wall = Tile[];

export interface Meld {
  type: 'CHI' | 'PENG' | 'GANG' | 'ANGANG' | 'BUGANG';
  tiles: Tile[];         // tiles forming the meld
  from?: number | null;  // seat index of provider (for open melds); null for concealed
}

export interface PlayerState {
  ai: string;
  hand: Tile[];
  discards: Tile[];
  melds: Meld[];
  score: number;
  isRiichi?: boolean; // reserved (not used in Sichuan)
  isWinner?: boolean; // for 血战到底 per hand
  isFolded?: boolean; // optional defensive flag
}

export interface TableSnapshot {
  wall: Wall;
  discards: Tile[];           // table-wide recent discards (optional aggregate)
  players: PlayerState[];
  turn: number;               // current seat index (0..3) whose turn to act
  dealer: number;             // dealer seat index (for 连庄 if needed later)
  lastDiscard?: { tile: Tile; from: number } | null; // last thrown tile on table (waiting for reactions)
  roundActive: boolean;
  winners: number[];          // seat indices who have won in this hand (血战)
  rule: 'SCZDXZ' | 'BASIC';   // 四川血战到底 = SCZDXZ
}

export type ActionType = 'DRAW' | 'DISCARD' | 'CHI' | 'PENG' | 'GANG' | 'ANGANG' | 'BUGANG' | 'HU' | 'PASS';

export interface Action {
  type: ActionType;
  seat: number;        // actor seat
  tile?: Tile;         // the tile involved (for DISCARD/GANG/BUGANG/PENG target tile)
  chiSeq?: Tile[];     // for CHI, the 3-tile sequence including the taken tile
}

export interface Reaction {
  seat: number;
  actions: ActionType[]; // possible actions this seat can take in response to last discard
}

export interface WinResult {
  win: boolean;
  fans: string[];
  scoreDelta: number; // base score delta, positive for winner (others should pay equally)
  huType: 'ZIMO' | 'RON';
}

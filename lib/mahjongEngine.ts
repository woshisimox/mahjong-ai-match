export type Tile = string;
export type PlayerHand = Tile[];
export type Wall = Tile[];

export type MeldType = 'chi' | 'pon' | 'kan';
export type KanType = 'ankan' | 'minkan' | 'kakan';
export interface Meld {
  type: MeldType;
  tiles: Tile[];   // 吃/碰/杠的牌组
  from: number;    // 来源玩家索引（暗杠时同为自己）
  kanType?: KanType;
}

export interface PlayerState {
  ai: string;
  hand: PlayerHand;
  discards: Tile[];
  melds: Meld[];
  score: number;
}

export interface WinResult {
  win: boolean;
  yaku: string[];
  fan: number;
}

/** 136 tiles: 1-9W/B/T (×4), 字牌1-7Z (东南西北中发白, ×4) */
export const generateWall = (): Wall => {
  const tiles: Tile[] = [];
  const suits = ['W','B','T'];
  for(const s of suits){
    for(let n=1;n<=9;n++){
      for(let k=0;k<4;k++) tiles.push(`${n}${s}`);
    }
  }
  for(let z=1;z<=7;z++){
    for(let k=0;k<4;k++) tiles.push(`${z}Z`);
  }
  return shuffle(tiles);
};

export const shuffle = <T,>(arr: T[]): T[] => {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
};

export const dealHands = (wall: Wall, players: string[], n = 13): PlayerState[] => {
  return players.map(ai => ({
    ai,
    hand: wall.splice(0, n),
    discards: [],
    melds: [],
    score: 1000,
  }));
};

export const drawTile = (wall: Wall): Tile | null => (wall.length ? wall.shift()! : null);

// ---------------- 胡牌基础判定（用于抢杠/荣和窗口快速判断） ----------------
function bySuitRank(a: Tile, b: Tile) {
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  const ra = parseInt(a[0], 10), rb = parseInt(b[0], 10);
  return ra - rb;
}
function cloneCounts(hand: Tile[]) {
  const c: Record<string, number> = {};
  for (const t of hand) c[t] = (c[t] || 0) + 1;
  return c;
}
function isSevenPairs(counts: Record<string, number>): boolean {
  return Object.values(counts).filter(v => v === 2).length === 7;
}
function isThirteenOrphans(hand: Tile[]): boolean {
  const req = new Set(['1W','9W','1B','9B','1T','9T','1Z','2Z','3Z','4Z','5Z','6Z','7Z']);
  const uniq = new Set(hand);
  const hasAll = [...req].every(t => uniq.has(t));
  if (!hasAll) return false;
  const counts = cloneCounts(hand);
  return [...counts.entries()].some(([k, v]) => req.has(k) && v >= 2);
}
function canFormMeldsFromCounts(counts: Record<string, number>): boolean {
  const c: Record<string, number> = { ...counts };
  const keys = Object.keys(c).filter(k => c[k] > 0).sort(bySuitRank as any);
  if (keys.length === 0) return true;

  const t = keys[0];
  // 刻
  if (c[t] >= 3) {
    c[t] -= 3;
    if (canFormMeldsFromCounts(c)) return true;
    c[t] += 3;
  }
  // 顺（字牌不可顺）
  const s = t[1];
  if (s === 'W' || s === 'B' || s === 'T') {
    const n = parseInt(t[0], 10);
    const t2 = `${n+1}${s}`, t3 = `${n+2}${s}`;
    if (c[t2] > 0 && c[t3] > 0) {
      c[t]--; c[t2]--; c[t3]--;
      if (canFormMeldsFromCounts(c)) return true;
      c[t]++; c[t2]++; c[t3]++;
    }
  }
  return false;
}
/** 仅判断是否能和（不计算番） */
export function checkWin(hand: Tile[]): boolean {
  if (hand.length % 3 !== 2) return false;
  const counts = cloneCounts(hand);
  if (isThirteenOrphans(hand)) return true;
  if (isSevenPairs(counts)) return true;
  for (const [tile, cnt] of Object.entries(counts)) {
    if (cnt >= 2) {
      const c = { ...counts };
      c[tile] -= 2;
      if (canFormMeldsFromCounts(c)) return true;
    }
  }
  return false;
}

// ---------------- 更严番种/番数（简化版） ----------------

function isPure(hand: Tile[]): boolean {
  // 清一色：只有一种花色（W/B/T），且没有字牌
  const suits = new Set<string>();
  for (const t of hand) {
    const s = t[1];
    if (s === 'Z') return false;
    suits.add(s);
  }
  return suits.size === 1;
}
function isHalfFlush(hand: Tile[]): boolean {
  // 混一色：只有一种花色 + 可含字牌
  const suits = new Set<string>();
  let hasSuit=false;
  for(const t of hand){
    const s=t[1];
    if(s==='Z') continue;
    hasSuit=true;
    suits.add(s);
  }
  return hasSuit && suits.size===1;
}
function isAllPungsPossible(hand: Tile[]): boolean {
  // 对对胡：尝试只用刻子组成（4刻1将）
  const counts = cloneCounts(hand);
  // 尝试移走一对将
  for (const [tile, cnt] of Object.entries(counts)) {
    if (cnt >= 2) {
      const c = { ...counts };
      c[tile] -= 2;
      // 只允许刻子
      if (canFormAllPungs(c)) return true;
    }
  }
  return false;
}
function canFormAllPungs(counts: Record<string,number>): boolean {
  const c: Record<string, number> = { ...counts };
  const keys = Object.keys(c).filter(k => c[k] > 0).sort(bySuitRank as any);
  if (keys.length===0) return true;
  const t = keys[0];
  if (c[t] >= 3){
    c[t] -= 3;
    if (canFormAllPungs(c)) return true;
    c[t] += 3;
  }
  return false;
}
function dragonCount(counts: Record<string,number>): {pungs:number; pair:boolean} {
  // 5Z=中, 6Z=发, 7Z=白
  const tiles = ['5Z','6Z','7Z'];
  let p=0; let pair=false;
  for(const t of tiles){
    const v = counts[t]||0;
    if(v>=3) p++;
    if(v===2) pair=true;
  }
  return {pungs:p, pair};
}

export interface ScoreContext {
  rinshan?: boolean; // 岭上开花（杠后摸牌自摸）
  robKong?: boolean; // 抢杠
  tsumo?: boolean;   // 自摸
}

export function scoreWin(hand: Tile[], ctx?: ScoreContext): WinResult {
  if (!checkWin(hand)) return { win:false, yaku:[], fan:0 };
  const yaku: string[] = [];
  let fan = 0;
  const counts = cloneCounts(hand);

  // 基本和型
  if (isThirteenOrphans(hand)) { yaku.push('十三幺'); fan += 16; return { win:true, yaku, fan }; }
  if (isSevenPairs(counts)) { yaku.push('七对'); fan += 12; } else {
    // 4面子1将的附加役
    if (isAllPungsPossible(hand)) { yaku.push('对对胡'); fan += 12; }
  }

  // 色系
  if (isPure(hand)) { yaku.push('清一色'); fan += 16; }
  else if (isHalfFlush(hand)) { yaku.push('混一色'); fan += 8; }

  // 三元
  const d = dragonCount(counts);
  if (d.pungs===3){ yaku.push('大三元'); fan += 48; }
  else if (d.pungs===2 && d.pair){ yaku.push('小三元'); fan += 24; }

  // 特殊番
  if (ctx?.rinshan) { yaku.push('岭上开花'); fan += 4; }
  if (ctx?.robKong) { yaku.push('抢杠'); fan += 8; }

  // 平胡兜底
  if (yaku.length===0) { yaku.push('平胡'); fan += 8; }

  return { win:true, yaku, fan };
}

// ---------------- 吃/碰/杠判定 ----------------

export function canPon(hand: Tile[], out: Tile): boolean {
  return hand.filter(t => t === out).length >= 2;
}
export function chiOptions(hand: Tile[], out: Tile): Tile[][] {
  const s = out[1];
  if (s !== 'W' && s !== 'B' && s !== 'T') return [];
  const n = parseInt(out[0], 10);
  const opts: Tile[][] = [];
  const have = (x: Tile) => hand.includes(x);

  if (n>=3) { const a=`${n-2}${s}`, b=`${n-1}${s}`; if(have(a)&&have(b)) opts.push([a,b]); }
  if (n>=2 && n<=8) { const a=`${n-1}${s}`, b=`${n+1}${s}`; if(have(a)&&have(b)) opts.push([a,b]); }
  if (n<=7) { const a=`${n+1}${s}`, b=`${n+2}${s}`; if(have(a)&&have(b)) opts.push([a,b]); }
  return opts;
}
export function pickChi(hand: Tile[], out: Tile): Tile[] | null {
  const opts = chiOptions(hand, out);
  if (opts.length === 0) return null;
  opts.sort((A,B)=> (A.join(',')).localeCompare(B.join(',')));
  return opts[0];
}
export function canMinkan(hand: Tile[], out: Tile): boolean {
  return hand.filter(t => t === out).length >= 3;
}
export function findAnkanTile(hand: Tile[]): Tile | null {
  const counts = cloneCounts(hand);
  for(const [t,c] of Object.entries(counts)){
    if(c>=4) return t;
  }
  return null;
}
export function findKakanTile(hand: Tile[], melds: Meld[]): {tile: Tile, meldIndex: number} | null {
  // 已有碰面子，再摸到第4张可以加杠
  for(let i=0;i<melds.length;i++){
    const m = melds[i];
    if(m.type==='pon'){
      const t = m.tiles[0];
      if (hand.includes(t)) return { tile: t, meldIndex: i };
    }
  }
  return null;
}
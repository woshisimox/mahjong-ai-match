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

export const GHOST_TILE = '5Z'; // 红中为鬼

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

// ---------------- 基础工具 ----------------
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
function withoutGhosts(hand: Tile[]): {pure: Tile[]; ghost: number} {
  const pure = hand.filter(t => t !== GHOST_TILE);
  const ghost = hand.length - pure.length;
  return { pure, ghost };
}

// ---------------- 役型（含鬼） ----------------
const orphanSet = new Set(['1W','9W','1B','9B','1T','9T','1Z','2Z','3Z','4Z','5Z','6Z','7Z']);

function isThirteenOrphansWithGhosts(hand: Tile[]): boolean {
  const { pure, ghost } = withoutGhosts(hand);
  const uniq = new Set(pure);
  const present = Array.from(orphanSet).filter(t => uniq.has(t)).length;
  const missing = 13 - present;
  if (ghost < missing) return false;
  // pair requirement among terminals/honors:
  // already have a duplicate among pure? if not, need one more ghost
  const counts = cloneCounts(pure);
  let hasDup = false;
  for (const k of orphanSet) { if ((counts[k]||0) >= 2) { hasDup = true; break; } }
  const leftover = ghost - missing;
  return hasDup || leftover >= 1;
}

function isSevenPairsWithGhosts(hand: Tile[]): boolean {
  const { pure, ghost } = withoutGhosts(hand);
  const counts = cloneCounts(pure);
  let pairs = 0, singles = 0;
  for (const v of Object.values(counts)) {
    pairs += Math.floor(v/2);
    if (v%2===1) singles++;
  }
  // 用鬼把单张补成对子
  if (ghost < singles) return false;
  const extra = ghost - singles;
  pairs += singles; // singles 被鬼补成对子
  pairs += Math.floor(extra/2); // 两鬼可再成一对
  return pairs >= 7;
}

function canFormMeldsWithGhosts(counts: Record<string,number>, ghosts: number): boolean {
  // 终止
  const keys = Object.keys(counts).filter(k => counts[k] > 0).sort(bySuitRank as any);
  if (keys.length === 0) return true;

  const t = keys[0];
  const c0 = counts[t];

  // 1) 尝试刻子（用鬼补）
  if (c0 >= 3) {
    counts[t] -= 3;
    if (canFormMeldsWithGhosts(counts, ghosts)) return true;
    counts[t] += 3;
  } else {
    const need = 3 - c0;
    if (need > 0 && ghosts >= need) {
      // 用鬼补齐刻子
      const bak = counts[t];
      counts[t] = 0;
      if (canFormMeldsWithGhosts(counts, ghosts - need)) return true;
      counts[t] = bak;
    }
  }

  // 2) 尝试顺子（字牌不可顺；用鬼补缺）
  const s = t[1];
  if (s === 'W' || s === 'B' || s === 'T') {
    const n = parseInt(t[0], 10);
    const t2 = `${n+1}${s}`, t3 = `${n+2}${s}`;
    const need2 = Math.max(0, 1 - (counts[t2]||0));
    const need3 = Math.max(0, 1 - (counts[t3]||0));
    const miss = need2 + need3;
    if (n <= 7 && ghosts >= miss) {
      // 扣除已有的两张
      const b1 = counts[t], b2 = counts[t2]||0, b3 = counts[t3]||0;
      counts[t] = b1 - 1;
      if (counts[t2]) counts[t2] = b2 - 1;
      if (counts[t3]) counts[t3] = b3 - 1;
      if (counts[t]===0) delete counts[t];
      if (counts[t2]===0) delete counts[t2];
      if (counts[t3]===0) delete counts[t3];
      if (canFormMeldsWithGhosts(counts, ghosts - miss)) return true;
      // 回溯
      counts[t] = b1;
      counts[t2] = b2;
      counts[t3] = b3;
    }
  }

  return false;
}

function standardWinWithGhosts(hand: Tile[]): boolean {
  const { pure, ghost } = withoutGhosts(hand);
  const counts = cloneCounts(pure);
  // 尝试将牌（用鬼补对）
  const tiles = Array.from(new Set(Object.keys(counts))).sort(bySuitRank as any);
  // 1) 现有对子
  for (const tile of tiles) {
    if ((counts[tile]||0) >= 2) {
      counts[tile] -= 2;
      if (canFormMeldsWithGhosts(counts, ghost)) return true;
      counts[tile] += 2;
    }
  }
  // 2) 单张 + 鬼 组成将
  if (ghost >= 1) {
    for (const tile of tiles) {
      if ((counts[tile]||0) === 1) {
        counts[tile] -= 1;
        if (canFormMeldsWithGhosts(counts, ghost - 1)) return true;
        counts[tile] += 1;
      }
    }
  }
  // 3) 两鬼作将
  if (ghost >= 2) {
    if (canFormMeldsWithGhosts(counts, ghost - 2)) return true;
  }
  return false;
}

// ---------------- 对外：是否能和、计番 ----------------
/** 是否能和（包含鬼） */
export function checkWin(hand: Tile[]): boolean {
  if (hand.length % 3 !== 2) return false;
  if (isThirteenOrphansWithGhosts(hand)) return true;
  if (isSevenPairsWithGhosts(hand)) return true;
  return standardWinWithGhosts(hand);
}

// ====== 计番（欢乐场提升番型命中率） ======
function isPure(hand: Tile[]): boolean {
  // 清一色：只有一种花色（W/B/T），且不计鬼（鬼忽略）
  const { pure } = withoutGhosts(hand);
  const suits = new Set<string>();
  for (const t of pure) {
    const s = t[1];
    if (s === 'Z') return false;
    suits.add(s);
  }
  return pure.length>0 && suits.size === 1;
}
function isHalfFlush(hand: Tile[]): boolean {
  const { pure } = withoutGhosts(hand);
  const suits = new Set<string>();
  let hasSuit=false;
  for(const t of pure){
    const s=t[1];
    if(s==='Z') continue;
    hasSuit=true;
    suits.add(s);
  }
  return hasSuit && suits.size===1;
}
function isAllPungsPossible(hand: Tile[]): boolean {
  // 对对胡：用鬼也允许凑刻
  const { pure, ghost } = withoutGhosts(hand);
  const counts = cloneCounts(pure);
  // 尝试移走一对将（可用鬼）
  const tiles = Array.from(new Set(Object.keys(counts)));
  // （1）现成对子
  for (const tile of tiles) {
    if ((counts[tile]||0) >= 2) {
      counts[tile] -= 2;
      if (canAllPungsWithGhosts(counts, ghost)) return true;
      counts[tile] += 2;
    }
  }
  // （2）单张+鬼作将
  if (ghost>=1){
    for (const tile of tiles) {
      if ((counts[tile]||0) === 1) {
        counts[tile] -= 1;
        if (canAllPungsWithGhosts(counts, ghost-1)) return true;
        counts[tile] += 1;
      }
    }
  }
  // （3）两鬼作将
  if (ghost>=2){
    if (canAllPungsWithGhosts(counts, ghost-2)) return true;
  }
  return false;
}
function canAllPungsWithGhosts(counts: Record<string,number>, ghost: number): boolean {
  const keys = Object.keys(counts).filter(k => counts[k]>0).sort(bySuitRank as any);
  if (keys.length===0) return true;
  const t = keys[0];
  const c = counts[t];
  if (c>=3){
    counts[t]-=3;
    if (canAllPungsWithGhosts(counts, ghost)) return true;
    counts[t]+=3;
  } else {
    const need = 3 - c;
    if (need<=ghost){
      const bak = counts[t];
      counts[t]=0;
      if (canAllPungsWithGhosts(counts, ghost-need)) return true;
      counts[t]=bak;
    }
  }
  return false;
}

export interface ScoreContext {
  rinshan?: boolean; // 岭上开花
  robKong?: boolean; // 抢杠
  tsumo?: boolean;   // 自摸
}

export function scoreWin(hand: Tile[], ctx?: ScoreContext): WinResult {
  if (!checkWin(hand)) return { win:false, yaku:[], fan:0 };
  const yaku: string[] = [];
  let fan = 0;

  const ghostCnt = hand.filter(t => t === GHOST_TILE).length;

  // 基本和型
  if (isThirteenOrphansWithGhosts(hand)) { yaku.push('十三幺'); fan += 16; }
  else if (isSevenPairsWithGhosts(hand)) { yaku.push('七对'); fan += 12; }
  else if (isAllPungsPossible(hand)) { yaku.push('对对胡'); fan += 12; }
  else { yaku.push('平胡'); fan += 8; }

  // 色系
  if (isPure(hand)) { yaku.push('清一色'); fan += 16; }
  else if (isHalfFlush(hand)) { yaku.push('混一色'); fan += 8; }

  // 三元（鬼当红中，但此处不以鬼计入三元刻）
  const { pure } = withoutGhosts(hand);
  const counts = cloneCounts(pure);
  const dTiles = ['5Z','6Z','7Z'];
  const pungs = dTiles.reduce((acc,t)=> acc + ((counts[t]||0)>=3?1:0), 0);
  const hasPair = dTiles.some(t => (counts[t]||0)===2);
  if (pungs===3){ yaku.push('大三元'); fan += 48; }
  else if (pungs===2 && hasPair){ yaku.push('小三元'); fan += 24; }

  // 特殊加成
  if (ctx?.rinshan) { yaku.push('岭上开花'); fan += 4; }
  if (ctx?.robKong) { yaku.push('抢杠'); fan += 8; }
  if (ghostCnt>0) { yaku.push('带鬼'); fan += 4; } // 欢乐场：带鬼 +4

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

// ===== 四川·血战到底（严格）计番 =====
function isTerminal(t: Tile){ if(!t) return false; const s=t[1]; if(s==='W'||s==='B'||s==='T'){ const n=parseInt(t[0],10); return n===1||n===9; } return false; }
function isSuit(t: Tile){ const s=t[1]; return s==='W'||s==='B'||s==='T'; }
function allTilesFrom(ts: Tile[], melds: Meld[]): Tile[]{
  const mtiles: Tile[] = [];
  for(const m of melds){ for(const x of m.tiles) mtiles.push(x); }
  return [...ts, ...mtiles];
}
function isDuanYao(ts: Tile[], melds: Meld[]): boolean {
  const all = allTilesFrom(ts, melds);
  return all.every(x => isSuit(x) && !isTerminal(x));
}
function isQingYiSe(ts: Tile[], melds: Meld[]): boolean {
  const all = allTilesFrom(ts, melds).filter(isSuit);
  const suits = new Set(all.map(x=>x[1]));
  return all.length>0 && suits.size===1;
}
function isJiang(ts: Tile[], melds: Meld[]): boolean {
  const all = allTilesFrom(ts, melds).filter(isSuit);
  return all.length>0 && all.every(x=> ['2','5','8'].includes(x[0]));
}
function hasChi(melds: Meld[]): boolean { return melds.some(m => m.type==='chi'); }
function isAllPungsSichuan(ts: Tile[], melds: Meld[]): boolean {
  if (hasChi(melds)) return false;
  return isAllPungsPossible(ts);
}
function countRoots(ts: Tile[], melds: Meld[]): number {
  const all = allTilesFrom(ts, melds);
  const c: Record<string, number> = {};
  for(const x of all){ c[x]=(c[x]||0)+1; }
  let roots = 0;
  for(const v of Object.values(c)){ if(v>=4) roots += Math.floor(v/4); }
  return roots;
}
export interface SichuanStrictCtx extends ScoreContext { capFan?: number; }
export function scoreWinSichuanStrict(hand: Tile[], melds: Meld[], ctx?: SichuanStrictCtx): WinResult {
  if (!checkWin(hand)) return { win:false, yaku:[], fan:0 };
  const yaku: string[] = [];
  let fan = 0;
  if (isSevenPairsWithGhosts(hand)) { yaku.push('七对'); fan += 2; }
  else if (isAllPungsSichuan(hand, melds)) { yaku.push('对对胡'); fan += 2; }
  else { yaku.push('平胡'); }
  if (isJiang(hand, melds)) { yaku.push('将对'); fan += 2; }
  if (isQingYiSe(hand, melds)) { yaku.push('清一色'); fan += 6; }
  if (isDuanYao(hand, melds)) { yaku.push('断幺九'); fan += 1; }
  if (ctx?.tsumo) { yaku.push('自摸'); fan += 1; }
  if (ctx?.rinshan) { yaku.push('杠上开花'); fan += 1; }
  if (ctx?.robKong) { yaku.push('抢杠'); fan += 1; }
  const roots = countRoots(hand, melds);
  if (roots>0){ yaku.push(`根×${roots}`); fan += roots; }
  const cap = ctx?.capFan ?? 13;
  if (fan > cap) fan = cap;
  return { win:true, yaku, fan };
}


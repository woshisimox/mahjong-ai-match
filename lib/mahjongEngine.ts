export type Tile = string;
export type PlayerHand = Tile[];
export type MeldType = 'chi'|'pon'|'kan'|'ankan'|'kakan';
export interface Meld { type: MeldType; tiles: Tile[]; from?: number; }
export type Wall = Tile[];

export interface ScoreContext {
  tsumo?: boolean;
  rinshan?: boolean;
  robKong?: boolean;
}

export interface PlayerState {
  ai: string;
  hand: PlayerHand;
  discards: Tile[];
  melds: Meld[];
  score: number;
  flowers?: Tile[];
  que?: 'W'|'B'|'T';
  alive?: boolean;
}

export function shuffle<T>(arr: T[]): T[]{
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const FLOWER_TILES: Tile[] = ['1F','2F','3F','4F','5F','6F','7F','8F']; // 春夏秋冬 梅兰竹菊
export function isFlower(t: Tile){ return t && t.endsWith('F'); }

export const generateWall = (): Wall => {
  const tiles: Tile[] = [];
  const suits = ['W','B','T'];
  for(const s of suits){ for(let n=1;n<=9;n++){ for(let k=0;k<4;k++) tiles.push(`${n}${s}`); } }
  for(let z=1; z<=7; z++){ for(let k=0;k<4;k++) tiles.push(`${z}Z`); }
  return shuffle(tiles);
};

export interface WallOptions { includeFlowers?: boolean; sichuan?: boolean; }
export const generateWallEx = (opts?: WallOptions): Wall => {
  const o = opts || {};
  const tiles: Tile[] = [];
  const suits = ['W','B','T'];
  for(const s of suits){ for(let n=1;n<=9;n++){ for(let k=0;k<4;k++) tiles.push(`${n}${s}`); } }
  if(!o.sichuan){
    for(let z=1; z<=7; z++){ for(let k=0;k<4;k++) tiles.push(`${z}Z`); }
    if(o.includeFlowers){ for(const f of FLOWER_TILES) tiles.push(f); }
  }
  return shuffle(tiles);
};

export function dealHands(wall: Wall, aiTags: string[]): PlayerState[]{
  const ps: PlayerState[] = aiTags.map(a=>({ ai:a, hand:[], discards:[], melds:[], score:25000, flowers:[], alive:true }));
  for(let r=0;r<3;r++){
    for(let i=0;i<ps.length;i++){
      for(let k=0;k<4;k++) ps[i].hand.push(wall.pop()!);
    }
  }
  // 13th/14th
  for(let i=0;i<ps.length;i++){
    ps[i].hand.push(wall.pop()!);
  }
  return ps;
}

export function drawTile(wall: Wall): Tile|undefined { return wall.pop(); }

export function sortTiles(ts: Tile[]): Tile[]{
  const order = (t:Tile) => {
    const n = parseInt(t[0]); const s=t[1];
    const sv = s==='W'?0:s==='B'?1:s==='T'?2:3;
    return sv*10 + n;
  };
  return [...ts].sort((a,b)=>order(a)-order(b));
}

function isSuit(t: Tile){ return t && (t[1]==='W'||t[1]==='B'||t[1]==='T'); }
function isTerminal(t: Tile){ if(!isSuit(t)) return false; const n=parseInt(t[0]); return n===1||n===9; }

export function checkWin(hand: Tile[]): boolean {
  // very lightweight check: allow 14 tiles that can be partitioned into 4 triplets and 1 pair OR 7 pairs
  const tiles = [...hand].sort();
  if(tiles.length!==14) return false;
  // seven pairs quick check
  const counts: Record<string, number> = {};
  for(const t of tiles) counts[t]=(counts[t]||0)+1;
  let pairs=0, bad=false;
  for(const v of Object.values(counts)){ if(v===2) pairs++; else if(v===4) pairs+=2; else if(v%2===1) bad=true; }
  if(!bad && pairs===7) return true;
  // naive set removal for triplets
  const arr = [...tiles];
  function canForm(a:string[]):boolean{
    if(a.length===0) return true;
    // try pair
    for(let i=0;i<a.length-1;i++){
      if(a[i]===a[i+1]){
        const rest=[...a.slice(0,i),...a.slice(i+2)];
        if(canMelds(rest)) return true;
      }
    }
    return false;
  }
  function canMelds(a:string[]):boolean{
    if(a.length===0) return true;
    // triplet
    for(let i=0;i<a.length-2;i++){
      if(a[i]===a[i+1]&&a[i+1]===a[i+2]){
        const rest=[...a.slice(0,i),...a.slice(i+3)];
        if(canMelds(rest)) return true;
      }
    }
    // sequence (same suit)
    for(let i=0;i<a.length;i++){
      const t=a[i]; if(!isSuit(t)) continue;
      const s=t[1]; const n=parseInt(t[0]);
      const t2=`${n+1}${s}`, t3=`${n+2}${s}`;
      const j=a.indexOf(t2), k=a.indexOf(t3);
      if(j>-1 && k>-1){
        const b=[...a]; b.splice(k,1); b.splice(j,1); b.splice(i,1);
        if(canMelds(b)) return true;
      }
    }
    return false;
  }
  return canForm(arr);
}

function allTilesFrom(ts: Tile[], melds: Meld[]): Tile[]{ const m:Tile[]=[]; for(const md of melds){ for(const x of md.tiles) m.push(x);} return [...ts, ...m]; }
function isDuanYao(ts: Tile[], melds: Meld[]): boolean { return allTilesFrom(ts, melds).every(x => isSuit(x) && !isTerminal(x)); }
function isQingYiSe(ts: Tile[], melds: Meld[]): boolean { const a=allTilesFrom(ts, melds).filter(isSuit); return a.length>0 && new Set(a.map(x=>x[1])).size===1; }
function isJiang(ts: Tile[], melds: Meld[]): boolean { const a=allTilesFrom(ts, melds).filter(isSuit); return a.length>0 && a.every(x=> ['2','5','8'].includes(x[0])); }
function hasChi(melds: Meld[]): boolean { return melds.some(m=>m.type==='chi'); }
function isAllPungsPossible(ts: Tile[]): boolean {
  const c: Record<string, number> = {}; for(const t of ts) c[t]=(c[t]||0)+1;
  let pairs=0; for(const v of Object.values(c)){ if(v===2)pairs++; if(v===4)pairs+=2; }
  return pairs>=1; // coarse check
}

export function scoreWin(hand: Tile[], ctx?: ScoreContext): { win:boolean; yaku:string[]; fan:number }{
  const win = checkWin(hand);
  if(!win) return { win:false, yaku:[], fan:0 };
  const yaku:string[]=[]; let fan=1;
  if(ctx?.tsumo) { yaku.push('自摸'); fan+=1; }
  if(ctx?.rinshan){ yaku.push('岭上开花'); fan+=1; }
  return { win:true, yaku, fan };
}

export interface SichuanStrictCtx extends ScoreContext { capFan?: number; }
export function scoreWinSichuanStrict(hand: Tile[], melds: Meld[], ctx?: SichuanStrictCtx): { win:boolean; yaku:string[]; fan:number }{
  if(!checkWin(hand)) return { win:false, yaku:[], fan:0 };
  const yaku:string[]=[]; let fan=0;
  if(isAllPungsPossible(hand) && !hasChi(melds)) { yaku.push('对对胡'); fan+=2; } else { yaku.push('平胡'); }
  if(isQingYiSe(hand, melds)) { yaku.push('清一色'); fan+=6; }
  if(isDuanYao(hand, melds)) { yaku.push('断幺九'); fan+=1; }
  if(isJiang(hand, melds)) { yaku.push('将对'); fan+=2; }
  if(ctx?.tsumo) { yaku.push('自摸'); fan+=1; }
  if(ctx?.rinshan){ yaku.push('杠上开花'); fan+=1; }
  if(ctx?.robKong){ yaku.push('抢杠'); fan+=1; }
  const cap = ctx?.capFan ?? 13;
  if(fan>cap) fan=cap;
  return { win:true, yaku, fan };
}

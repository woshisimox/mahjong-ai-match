
import { Tile, PlayerState, Reaction, ActionType, TableSnapshot, WinResult } from '../types';

/** Helpers */
function suitOf(t:Tile){ return t[1]; }
function numOf(t:Tile){ const n = parseInt(t[0]); return isNaN(n)? 0 : n; }
function isNumbered(t:Tile){ const s=suitOf(t); return s==='W'||s==='B'||s==='T'; }

export function countTiles(tiles:Tile[]):Record<string,number>{
  const c:Record<string,number>={};
  for(const t of tiles) c[t]=(c[t]||0)+1;
  return c;
}

function clone<T>(x:T):T{ return JSON.parse(JSON.stringify(x)); }

/** Win check (简化的四川血战底胡型判定：平胡/七对/清一) */
export function checkWin_SCZDXZ(hand:Tile[], last?:Tile|undefined):WinResult{
  const tiles = [...hand];
  if(last) tiles.push(last);
  tiles.sort();

  // 七对
  const cnt=countTiles(tiles);
  const pairs = Object.values(cnt).filter(v=>v===2).length;
  const quads = Object.values(cnt).filter(v=>v===4).length;
  const isSevenPairs = (pairs===7) || (pairs===6 && quads===1);

  // 标准4面子1将（平胡）
  function canFormMelds(arr:Tile[]):boolean{
    const c=countTiles(arr);
    // try every pair as eyes
    const uniq=[...new Set(arr)];
    for(const x of uniq){
      if(c[x]>=2){
        c[x]-=2;
        if(canMakeSets(c)) return true;
        c[x]+=2;
      }
    }
    return false;
  }
  function canMakeSets(c:Record<string,number>):boolean{
    // no tiles left?
    if(Object.values(c).every(v=>v===0)) return true;
    // find first tile
    const t = Object.keys(c).find(k=>c[k]>0)!;
    // try triplet
    if(c[t]>=3){
      c[t]-=3;
      if(canMakeSets(c)) return true;
      c[t]+=3;
    }
    // try sequence
    if(isNumbered(t)){
      const s=suitOf(t), n=numOf(t);
      const t2=`${n+1}${s}`, t3=`${n+2}${s}`;
      if(c[t2]>0 && c[t3]>0){
        c[t]--; c[t2]--; c[t3]--;
        if(canMakeSets(c)) return true;
        c[t]++; c[t2]++; c[t3]++;
      }
    }
    return false;
  }

  const isPingHu = canFormMelds(tiles);
  const suited = [...new Set(tiles.filter(isNumbered).map(suitOf))];
  const isQingYiSe = suited.length===1;

  if(isSevenPairs) return { win:true, fans: isQingYiSe? ['清一色','七对'] : ['七对'], scoreDelta: 8*(isQingYiSe?2:1), huType: 'RON' };
  if(isPingHu) return { win:true, fans: isQingYiSe? ['清一色','平胡'] : ['平胡'], scoreDelta: 8*(isQingYiSe?2:1), huType: 'RON' };
  return { win:false, fans:[], scoreDelta:0, huType:'RON' };
}

/** CHI/PENG/GANG availability after a discard */
export function reactionsAfterDiscard(state:TableSnapshot):Reaction[]{
  const last = state.lastDiscard;
  if(!last) return [];
  const tile = last.tile;
  const res:Reaction[]=[];
  for(let i=0;i<state.players.length;i++){
    if(i===last.from) continue;                       // cannot react to own discard (except BUGANG later)
    const p = state.players[i];
    if(p.isWinner) continue;                          // winners no longer act in 血战
    const acts:ActionType[]=[];
    // PENG
    const cnt=countTiles(p.hand);
    if((cnt[tile]||0)>=2) acts.push('PENG');
    // CHI only for next player
    const next = (last.from+1)%4;
    if(i===next && isNumbered(tile)){
      const s=suitOf(tile), n=numOf(tile);
      const has=(x:string)=>p.hand.includes(x);
      // three possible sequences: n-2,n-1,n  | n-1,n,n+1 | n,n+1,n+2
      if(n>=3 && has(`${n-2}${s}`) && has(`${n-1}${s}`)) acts.push('CHI');
      if(n>=2 && n<=8 && has(`${n-1}${s}`) && has(`${n+1}${s}`)) acts.push('CHI');
      if(n<=7 && has(`${n+1}${s}`) && has(`${n+2}${s}`)) acts.push('CHI');
    }
    // HU (荣和)
    const win = checkWin_SCZDXZ(p.hand, tile);
    if(win.win) acts.push('HU');
    if(acts.length) res.push({ seat:i, actions:[...new Set(acts)] });
  }
  // Priority: HU > GANG (not applicable here) > PENG > CHI
  return res;
}

/** 血战到底流程辅助：多人可胡 → 允许多家同时胡，按四川通行做法结算 */
export function resolveReactionsPriority(reactions:Reaction[]):Reaction[]{
  if(reactions.length===0) return [];
  const withHu = reactions.filter(r=>r.actions.includes('HU'));
  if(withHu.length>0) return withHu; // 多家可胡 -> 全部返回，交由上层依次/同时结算
  // 没人胡：看 PENG / CHI
  const withPeng = reactions.filter(r=>r.actions.includes('PENG'));
  if(withPeng.length>0) return withPeng; // 若多人碰，按离放铳者顺位优先（由上层处理）
  const withChi = reactions.filter(r=>r.actions.includes('CHI'));
  if(withChi.length>0) return withChi.slice(0,1); // 只有下家能吃，这里保留一条
  return [];
}

/** 手牌移除/加入工具 */
export function removeTilesFromHand(hand:Tile[], tiles:Tile[]):boolean{
  const copy=[...hand];
  for(const t of tiles){
    const i=copy.indexOf(t);
    if(i<0) return false;
    copy.splice(i,1);
  }
  // commit
  hand.length=0;
  hand.push(...copy);
  return true;
}
export function addTilesToHand(hand:Tile[], tiles:Tile[]){
  hand.push(...tiles);
}

/** 处理吃/碰/杠的具体应用（不含补杠/暗杠，留待上层 DRAW 后判断） */
export function applyMeld(state:TableSnapshot, actor:number, kind:'CHI'|'PENG'|'GANG', tiles:Tile[]):void{
  const p = state.players[actor];
  // last discard must exist
  const last = state.lastDiscard;
  if(!last) return;
  const taken = last.tile;
  // Build expected set
  let need:Tile[]=[];
  if(kind==='PENG'){
    need=[taken,taken]; // need two copies in hand
  }else if(kind==='GANG'){
    need=[taken,taken,taken];
  }else{ // CHI: tiles carries full sequence (3 tiles)
    // ensure taken tile is included
    if(!tiles.includes(taken)) throw new Error('CHI tiles must include the taken tile');
    // need = the other two tiles that must be removed from hand
    need=tiles.filter(t=>t!==taken);
  }
  if(!removeTilesFromHand(p.hand, need)) throw new Error('Not enough tiles to meld');
  // record meld
  const meldTiles = kind==='CHI' ? tiles : [taken, ...need];
  p.melds = p.melds || [];
  p.melds.push({ type: kind, tiles: meldTiles, from: state.lastDiscard!.from });
  // consume last discard
  state.lastDiscard = null;
  // actor becomes next to discard
  state.turn = actor;
}

/** 判断暗杠/补杠（在玩家摸牌后调用） */
export function concealedOrAddGangOptions(hand:Tile[], melds = [] as {type:string; tiles:Tile[]}[], drawn?:Tile){
  const cnt=countTiles(hand);
  const acts:ActionType[]=[];
  // 暗杠: any tile count==4
  if(Object.values(cnt).some(v=>v===4)) acts.push('ANGANG');
  // 补杠: if there is a PENG of X and hand contains X (+ drawn==X usually)
  const pengs = melds.filter(m=>m.type==='PENG').map(m=>m.tiles[0]);
  const hasBugang = pengs.some(x=> (cnt[x]||0)>=1 || drawn===x);
  if(hasBugang) acts.push('BUGANG');
  return acts;
}

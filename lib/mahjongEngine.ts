
import { Tile, Wall, PlayerState, TableSnapshot, Action, ActionType, Reaction, WinResult } from './types';
import { reactionsAfterDiscard, resolveReactionsPriority, applyMeld, checkWin_SCZDXZ, concealedOrAddGangOptions } from './rules/sichuan';

/** -------- Tile set generators -------- */
export const generateWallByRule = (includeHonors: boolean): Wall => {
  const tiles: Tile[] = [];
  const suits = ['W','B','T']; // 万/饼/条
  for(const s of suits){
    for(let n=1;n<=9;n++){
      for(let k=0;k<4;k++) tiles.push(`${n}${s}`);
    }
  }
  if(includeHonors){
    const honors = ['1Z','2Z','3Z','4Z','5Z','6Z','7Z']; // 东南西北中发白
    for(const h of honors){ for(let k=0;k<4;k++) tiles.push(h); }
  }
  return shuffle(tiles);
};

/** Backward-compat: default generateWall = 136张（含字牌） */
export const generateWall = (): Wall => generateWallByRule(true);

export const generateWall108 = (): Wall => generateWallByRule(false);
export const generateWall136 = (): Wall => generateWallByRule(true);

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
    score: 0,
    isWinner: false
  }));
};

export const drawTile = (wall: Wall): Tile | null => wall.length ? wall.shift()! : null;

/** -------- Rule-aware table init -------- */
export type RuleMode = 'BASIC' | 'SCZDXZ'; // BASIC: 136张；SCZDXZ：四川血战108张

export function initTable(rule:RuleMode, playerNames:string[], dealer=0):TableSnapshot{
  const includeHonors = (rule==='BASIC');
  const wall = generateWallByRule(includeHonors);
  const players = dealHands([...wall], playerNames, 13);
  wall.splice(0, 13*playerNames.length);
  return {
    wall,
    discards: [],
    players,
    turn: dealer,
    dealer,
    lastDiscard: null,
    roundActive: true,
    winners: [],
    rule: rule
  };
}

// Backward compatibility for earlier calls
export const initTable_SCZDXZ = (playerNames:string[], dealer=0)=> initTable('SCZDXZ', playerNames, dealer);

/** 出牌后的反应集合（CHI/PENG/胡） */
export function getReactionsAfterDiscard(state:TableSnapshot):Reaction[]{
  return reactionsAfterDiscard(state);
}

/** 多人反应的优先级（胡>碰>吃；胡允许多家并行） */
export function priorityResolve(reactions:Reaction[]):Reaction[]{
  return resolveReactionsPriority(reactions);
}

/** 应用吃/碰/杠操作 */
export function applyMeldAction(state:TableSnapshot, actor:number, kind:'CHI'|'PENG'|'GANG', tiles:Tile[]):void{
  applyMeld(state, actor, kind, tiles);
}

/** 胡牌判断（用于荣和；自摸在摸牌后判断） */
export function checkWin(state:TableSnapshot, seat:number, fromDiscard:boolean, last?:Tile):WinResult{
  const p = state.players[seat];
  const r = checkWin_SCZDXZ(p.hand, fromDiscard ? last : undefined);
  return r;
}

/** 摸牌->暗杠/补杠->自摸判定 */
export function onDrawPhase(state:TableSnapshot, seat:number):{ drawn:Tile|null, win?:WinResult, gangOptions:ActionType[] }{
  const t = drawTile(state.wall);
  if(!t) return { drawn:null, gangOptions:[] };
  const p = state.players[seat];
  p.hand.push(t);
  // 自摸判定
  const win = checkWin_SCZDXZ(p.hand);
  const gangOptions = concealedOrAddGangOptions(p.hand, p.melds||[], t);
  return { drawn:t, win: win.win ? { ...win, huType:'ZIMO' } : undefined, gangOptions };
}

/** 将一张牌打出，进入反应阶段 */
export function discardTile(state:TableSnapshot, seat:number, tile:Tile){
  const p = state.players[seat];
  const i = p.hand.indexOf(tile);
  if(i>=0) p.hand.splice(i,1);
  p.discards.push(tile);
  state.lastDiscard = { tile, from: seat };
}

/** 结束一位玩家（胡牌）但继续血战到底 */
export function markWinner(state:TableSnapshot, seat:number){
  if(!state.winners.includes(seat)){
    state.winners.push(seat);
    state.players[seat].isWinner = true;
  }
  const active = state.players.map((p,idx)=>({p,idx})).filter(x=>!x.p.isWinner);
  if(active.length<=1){
    state.roundActive = false;
  }else{
    let nxt = (state.turn+1)%4;
    while(state.players[nxt].isWinner) nxt = (nxt+1)%4;
    state.turn = nxt;
  }
}

/** 简单导出：供页面使用的类型 */
export type { PlayerState } from './types';

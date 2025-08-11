export const _mem:any={state:new Map(), ev:new Map()};
export async function saveRoomState(id:string, s:any){ _mem.state.set(id,s); }
export async function getRoomState(id:string){ return _mem.state.get(id); }
export async function appendEvent(id:string, h:number, ev:any){ const k=`${id}:${h}`; const arr=_mem.ev.get(k)||[]; arr.push(ev); _mem.ev.set(k,arr); }
export async function getHandEvents(id:string,h:number){ return _mem.ev.get(`${id}:${h}`)||[]; }

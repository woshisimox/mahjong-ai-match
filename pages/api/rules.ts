
import type { NextApiRequest, NextApiResponse } from 'next';
import { getReactionsAfterDiscard, priorityResolve } from '@/lib/mahjongEngine';
import { TableSnapshot } from '@/lib/types';

export default function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=='POST') return res.status(405).json({error:'Method Not Allowed'});
  try{
    const state = req.body?.state as TableSnapshot;
    if(!state || !state.lastDiscard) return res.status(400).json({error:'state with lastDiscard required'});
    const rs = getReactionsAfterDiscard(state);
    const resolved = priorityResolve(rs);
    return res.status(200).json({ reactions: rs, resolved });
  }catch(e:any){
    return res.status(500).json({error:String(e&&e.message||e)});
  }
}

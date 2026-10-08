import type { Designs,RoomDesign } from './scene/OfficeScene';
import { verticalById,propById } from '../shared/verticals.mjs';
export function loadDesigns():Designs{
  try{const stored=JSON.parse(localStorage.getItem('sidequest.designs')??'{}'),safe:Designs={};for(const [id,value]of Object.entries(stored)){const v=value as RoomDesign;if(v&&verticalById.has(v.vertical)&&Array.isArray(v.props))safe[id]={vertical:v.vertical,props:v.props.filter(p=>typeof p==='string'&&propById.has(p)).slice(0,12)};}return safe;}catch{return {};}
}

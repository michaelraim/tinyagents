import type { Designs,RoomDesign } from './scene/OfficeScene';
import { verticalById,propById } from '../shared/verticals.mjs';
export function loadDesigns():Designs{
  try{const stored=JSON.parse(localStorage.getItem('sidequest.designs')??'{}'),safe:Designs={};for(const [id,value]of Object.entries(stored)){const v=value as RoomDesign;if(v&&verticalById.has(v.vertical)&&Array.isArray(v.props))safe[id]={vertical:v.vertical,props:v.props.filter(p=>typeof p==='string'&&propById.has(p)).slice(0,12),description:typeof v.description==='string'?v.description.slice(0,180):''};}return safe;}catch{return {};}
}
const palette=['#8c82bc','#4f9a8a','#c69158','#638fb2','#be7d89','#94a45e','#987453','#579ba7'];
export function projectColor(id:string){let hash=0;for(const c of id)hash=(hash*31+c.charCodeAt(0))>>>0;return palette[hash%palette.length];}

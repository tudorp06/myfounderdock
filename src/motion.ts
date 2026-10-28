import { readPreferences } from './preferences';
export const panelEase='cubic-bezier(.22,1,.36,1)';
export function motionEnabled(){return readPreferences().motion && !(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);}
export function animateSections(root:HTMLElement){
 if(!motionEnabled())return;
 Array.from(root.children).filter((node):node is HTMLElement=>node instanceof HTMLElement&&!node.hidden).forEach((node,index)=>{
  if(typeof node.animate!=='function')return;
  node.animate([{opacity:0,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:560,delay:Math.min(index*45,180),easing:panelEase,fill:'backwards'});
 });
}

// The old panel is already closed; reveal only the current request's content.
export function transitionPanel(incoming:HTMLElement){
 if(!motionEnabled()||typeof incoming.animate!=='function')return;
 incoming.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:560,easing:panelEase,fill:'backwards'});
}

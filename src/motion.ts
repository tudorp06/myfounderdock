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

// One continuous handoff for cached responses and network responses alike.
export function transitionPanel(incoming:HTMLElement,outgoing?:HTMLElement){
 if(!motionEnabled()||typeof incoming.animate!=='function'){outgoing?.remove();return;}
 incoming.animate([
  {opacity:0,transform:'translateY(12px)'},
  {opacity:1,transform:'translateY(0)'}
 ],{duration:620,delay:outgoing?70:0,easing:panelEase,fill:'backwards'});
 if(outgoing){
  const exit=outgoing.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-8px)'}],{duration:280,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
  void exit.finished.catch(()=>{}).finally(()=>outgoing.remove());
 }
}

type Side = 'left' | 'right' | 'top' | 'bottom';
interface Placement { x: number; y: number; side: Side; attached: boolean }
interface Layout { placement: Placement; scale: number; width: number; height: number; railX: number; railY: number; railWidth: number; railHeight: number; panelX: number; panelY: number; panelWidth: number; panelHeight: number; settling: boolean; snapX: number; snapY: number }
interface Options { native: boolean; floating: () => boolean; motion: () => boolean; beforeDrag: () => void }
const sides: Side[] = ['left', 'right', 'top', 'bottom'];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, Math.max(min, max)));
function nearest(x: number, y: number, w: number, h: number): [Side, number] {
  return ([['left', x], ['right', w-x], ['top', y], ['bottom', h-y]] as [Side, number][]).sort((a,b) => a[1]-b[1])[0];
}
export function createDockPositioning(dock: HTMLElement, options: Options) {
  const rail = dock.querySelector<HTMLElement>('.rail')!;
  const railLength = () => 102 + rail.querySelectorAll('.platform:not([hidden])').length * 40;
  const key = `myfounderdock-placement-${options.native ? 'desktop' : 'preview'}`;
  let placement: Placement | null = null;
  try { const saved = JSON.parse(localStorage.getItem(key) ?? 'null'); if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && sides.includes(saved.side)) placement = saved; } catch { /* Default right edge. */ }
  let layout: Layout | null = null;
  let active = false;
  let settleUntil = 0;
  let generation = 0;

  const grip = document.createElement('button');
  grip.className = 'dock-grip';
  grip.setAttribute('aria-label', 'Move dock. Drag or use arrow keys.');
  grip.title = 'Move dock';
  grip.innerHTML = '<span aria-hidden="true"></span>';
  rail.prepend(grip);
  const announcement = document.createElement('span');
  announcement.className = 'sr-only'; announcement.setAttribute('role', 'status'); dock.append(announcement);
  function persist() { try { localStorage.setItem(key, JSON.stringify(placement)); } catch { /* Position remains usable for this session. */ } }
  function apply(next: Layout, animate = false) {
    const oldSide = dock.dataset.side;
    rail.getAnimations().forEach(animation => animation.cancel());
    for (const child of rail.children) child.getAnimations().forEach(animation => animation.cancel());
    dock.dataset.side = next.placement.side;
    dock.dataset.attached = String(next.placement.attached);
    const vertical = next.placement.side === 'left' || next.placement.side === 'right';
    const vars: Record<string,number> = {
      'rail-x':next.railX,'rail-y':next.railY,'rail-w':next.railWidth,'rail-h':next.railHeight,
      'panel-x':next.panelX,'panel-y':vertical ? next.panelY+next.panelHeight/2 : next.panelY,
      'panel-width':next.panelWidth,'panel-height':next.panelHeight,'panel-bottom':next.height-next.panelY-next.panelHeight,
    };
    for (const [name,value] of Object.entries(vars)) dock.style.setProperty(`--${name}`, `${value}px`);
    dock.dataset.ready = 'true';
    placement = next.placement; layout = next;
    if (animate && options.motion()) {
      const horizontal = next.placement.side === 'top' || next.placement.side === 'bottom';
      const changedAxis = oldSide && (oldSide === 'top' || oldSide === 'bottom') !== horizontal;
      // Reveal inside the final bounds: an old vertical rail must never extend below the taskbar.
      rail.animate([
        { clipPath: changedAxis ? (horizontal ? 'inset(0 44% round 23px)' : 'inset(44% 0 round 23px)') : 'inset(0 round 23px)' },
        { clipPath: 'inset(0 round 23px)' },
      ], { duration:240,easing:'cubic-bezier(.22,1,.36,1)' });
      if (changedAxis) for (const child of rail.children) {
        child.animate([{opacity:.15,transform:'scale(.85)'},{opacity:1,transform:'scale(1)'}], {duration:200,easing:'cubic-bezier(.22,1,.36,1)'});
      }
    }
  }

  function browserLayout(expanded: boolean, drop = false): Layout {
    const w = innerWidth, h = innerHeight;
    let point: Placement = placement ? { ...placement } : { x:w-29,y:h/2,side:'right',attached:true };
    if (drop) { const [side,distance] = nearest(point.x,point.y,w,h); point.side=dropHint??side; point.attached=dropHint!==null||distance<56; dropHint=null; }
    const rawX=point.x,rawY=point.y;
    const horizontal = point.side === 'top' || point.side === 'bottom';
    const thickness = options.floating() || !point.attached ? 42 : 46;
    const rw=horizontal ? Math.min(railLength(),w-16) : thickness;
    const rh=horizontal ? thickness : Math.min(railLength(),h-16);
    if (point.attached) {
      const inset=options.floating()?33:23;
      if(point.side==='left')point.x=inset;if(point.side==='right')point.x=w-inset;
      if(point.side==='top')point.y=inset;if(point.side==='bottom')point.y=h-(options.floating()?33:35);
    }
    const padX=point.attached&&!options.floating()&&!horizontal?0:8;
    const padY=point.attached&&!options.floating()&&point.side==='top'?0:8;
    if(!active||drop){point.x=clamp(point.x,rw/2+padX,w-rw/2-padX);point.y=clamp(point.y,rh/2+padY,h-rh/2-padY);}
    const rx=point.x-rw/2,ry=point.y-rh/2;
    let pw=Math.min(336,w-16),ph=Math.min(480,h-16),px=0,py=0;
    if(point.side==='left'){pw=Math.min(pw,Math.max(1,w-8-rx-rw-12));px=rx+rw+12;py=clamp(point.y-ph/2,8,h-ph-8);}
    if(point.side==='right'){pw=Math.min(pw,Math.max(1,rx-20));px=rx-12-pw;py=clamp(point.y-ph/2,8,h-ph-8);}
    if(point.side==='top'){ph=Math.min(ph,Math.max(1,h-8-ry-rh-12));px=clamp(point.x-pw/2,8,w-pw-8);py=ry+rh+12;}
    if(point.side==='bottom'){ph=Math.min(ph,Math.max(1,ry-20));px=clamp(point.x-pw/2,8,w-pw-8);py=ry-12-ph;}
    void expanded;
    return {placement:point,scale:1,width:w,height:h,railX:rx,railY:ry,railWidth:rw,railHeight:rh,panelX:px,panelY:py,panelWidth:pw,panelHeight:ph,settling:false,snapX:drop?rawX-point.x:0,snapY:drop?rawY-point.y:0};
  }
  async function resize(expanded: boolean) {
    if (active) return;
    const current=++generation;
    if (!options.native) {apply(browserLayout(expanded));return;}
    const { invoke }=await import('@tauri-apps/api/core');
    const next=await invoke<Layout>('set_expanded',{expanded,floating:options.floating(),placement,railLength:railLength()});
    if(current===generation)apply(next);
  }
  function finish(next: Layout) {
    apply(next,true);persist();
    settleUntil=Date.now()+300;
    announcement.textContent=`Dock moved to the ${next.placement.side}${next.placement.attached?' edge':', floating'}.`;

  }
  let grabX=0,grabY=0,pointerId=-1;
  let original: Placement|null=null;
  let dropHint: Side|null=null;
  rail.addEventListener('pointerdown', event => {
    if(event.button!==0||active)return;
    const target=event.target as Element;
    if(target.closest('button')!==grip&&target.closest('button'))return;
    event.preventDefault();event.stopPropagation();
    generation++;
    options.beforeDrag();active=true;original=placement?{...placement}:null;
    dock.classList.add('dragging');
    if(options.native){
      void import('@tauri-apps/api/core').then(({invoke})=>invoke<Layout>('drag_dock',{floating:options.floating()})).then(next=>finish(next)).catch(error=>{
        console.error('Unable to drag dock',error);announcement.textContent='Could not move the dock. Try the grip again.';
      }).finally(()=>{active=false;dock.classList.remove('dragging');});
      return;
    }
    const bounds=rail.getBoundingClientRect();grabX=event.clientX-(bounds.left+bounds.width/2);grabY=event.clientY-(bounds.top+bounds.height/2);
    pointerId=event.pointerId;rail.setPointerCapture(pointerId);
  });
  rail.addEventListener('pointermove',event=>{
    if(options.native||!active||event.pointerId!==pointerId)return;
    placement={x:event.clientX-grabX,y:event.clientY-grabY,side:placement?.side??'right',attached:false};
    apply(browserLayout(false));
  });
  rail.addEventListener('pointerup',event=>{
    if(options.native||!active||event.pointerId!==pointerId)return;
    const [edge,distance]=nearest(event.clientX,event.clientY,innerWidth,innerHeight);dropHint=distance<56?edge:null;placement={x:event.clientX-grabX,y:event.clientY-grabY,side:placement?.side??'right',attached:false};active=false;dock.classList.remove('dragging');rail.releasePointerCapture(pointerId);pointerId=-1;finish(browserLayout(false,true));
  });
  rail.addEventListener('pointercancel',()=>{
    if(options.native||!active)return;active=false;dock.classList.remove('dragging');placement=original;apply(browserLayout(false));
  });
  grip.addEventListener('keydown',event=>{
    const movements:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const movement=movements[event.key];if(!movement||active)return;event.preventDefault();options.beforeDrag();
    const distance=event.shiftKey?96:32;
    if(options.native){
      void import('@tauri-apps/api/core').then(({invoke})=>invoke<Layout>('move_dock',{dx:movement[0]*distance,dy:movement[1]*distance,floating:options.floating()})).then(finish).catch(console.error);
    }else{const current=placement??browserLayout(false).placement;placement={...current,x:current.x+movement[0]*distance,y:current.y+movement[1]*distance,attached:false};finish(browserLayout(false,true));}
  });
  window.addEventListener('resize',()=>{if(!options.native&&!active)void resize(false);});
  return {resize,isDragging:()=>active||Date.now()<settleUntil,get side(){return layout?.placement.side??'right';}};
}

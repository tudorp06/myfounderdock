use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{State, WebviewWindow};
#[cfg(not(target_os="windows"))]
use tauri::{PhysicalPosition, PhysicalSize};

const LONG: f64 = 370.0;
const PAD: f64 = 8.0;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement { pub x: f64, pub y: f64, pub side: String, pub attached: bool }
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    pub placement: Placement, pub scale: f64, pub width: f64, pub height: f64,
    pub rail_x: f64, pub rail_y: f64, pub rail_width: f64, pub rail_height: f64,
    pub panel_x: f64, pub panel_y: f64, pub panel_width: f64, pub panel_height: f64,
    pub settling: bool, pub snap_x: f64, pub snap_y: f64,
}
#[derive(Default)]
pub struct DockState { placement: Option<Placement>, last: Option<Layout>, dragging: bool, rail_length: Option<f64> }
#[derive(Clone, Copy, Debug)]
struct Rect { x: f64, y: f64, w: f64, h: f64 }
impl Rect {
    fn union(self, other: Rect) -> Rect {
        let x = self.x.min(other.x); let y = self.y.min(other.y);
        Rect { x, y, w: (self.x+self.w).max(other.x+other.w)-x, h: (self.y+self.h).max(other.y+other.h)-y }
    }
}
fn horizontal(side: &str) -> bool { side == "top" || side == "bottom" }
fn bounded(value: f64, low: f64, high: f64) -> f64 { value.max(low).min(high.max(low)) }
fn nearest(x: f64, y: f64, w: f64, h: f64) -> (&'static str, f64) {
    [("left", x), ("right", w-x), ("top", y), ("bottom", h-y)]
        .into_iter().min_by(|a,b| a.1.total_cmp(&b.1)).unwrap()
}
// Coordinates here are logical pixels relative to a monitor's usable work area.
fn geometry(mut x: f64, mut y: f64, side: &str, attached: bool, w: f64, h: f64, expanded: bool, floating: bool, settling: bool, long: f64) -> (Rect, Rect, Rect) {
    let thickness = if floating || !attached { 42.0 } else { 46.0 };
    let (rw,rh) = if horizontal(side) { (long.min(w-2.0*PAD),thickness) } else { (thickness,long.min(h-2.0*PAD)) };
    let px = if attached && !floating && !horizontal(side) { 0.0 } else { PAD };
    let py = if attached && !floating && side == "top" { 0.0 } else { PAD };
    x = bounded(x, rw/2.0+px, w-rw/2.0-px);
    y = bounded(y, rh/2.0+py, h-rh/2.0-py);
    let rail = Rect { x:x-rw/2.0, y:y-rh/2.0, w:rw, h:rh };
    let mut panel = Rect { x:0.0, y:0.0, w:336.0_f64.min(w-2.0*PAD), h:480.0_f64.min(h-2.0*PAD) };
    match side {
        "left" => { panel.w = panel.w.min((w-PAD-rail.x-rail.w-12.0).max(1.0)); panel.x=rail.x+rail.w+12.0; panel.y=bounded(y-panel.h/2.0,PAD,h-panel.h-PAD); },
        "top" => { panel.h = panel.h.min((h-PAD-rail.y-rail.h-12.0).max(1.0)); panel.x=bounded(x-panel.w/2.0,PAD,w-panel.w-PAD); panel.y=rail.y+rail.h+12.0; },
        "bottom" => { panel.h = panel.h.min((rail.y-12.0-PAD).max(1.0)); panel.x=bounded(x-panel.w/2.0,PAD,w-panel.w-PAD); panel.y=rail.y-12.0-panel.h; },
        _ => { panel.w=panel.w.min((rail.x-12.0-PAD).max(1.0)); panel.x=rail.x-12.0-panel.w; panel.y=bounded(y-panel.h/2.0,PAD,h-panel.h-PAD); },
    }
    let frame = if expanded { rail.union(panel) } else { rail };
    let _ = settling; // Transitions stay inside the final rail bounds.
    let left=(frame.x-PAD).max(0.0); let top=(frame.y-PAD).max(0.0);
    let frame=Rect { x:left,y:top,w:(frame.x+frame.w+PAD).min(w)-left,h:(frame.y+frame.h+PAD).min(h)-top };
    (frame,rail,panel)
}
// One native operation avoids presenting an intermediate size at the old position.
fn set_bounds(window:&WebviewWindow,x:i32,y:i32,width:u32,height:u32)->Result<(),String>{
    #[cfg(target_os="windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos,SWP_NOACTIVATE,SWP_NOZORDER,SWP_ASYNCWINDOWPOS};
        let hwnd=window.hwnd().map_err(|e|e.to_string())?.0;
        // Queue the atomic move/resize on the owning Windows thread without blocking IPC.
        let result=unsafe{SetWindowPos(hwnd,std::ptr::null_mut(),x,y,width as i32,height as i32,SWP_NOACTIVATE|SWP_NOZORDER|SWP_ASYNCWINDOWPOS)};
        if result==0{Err(std::io::Error::last_os_error().to_string())}else{Ok(())}
    }
    #[cfg(not(target_os="windows"))]
    {window.set_size(PhysicalSize::new(width,height)).map_err(|e|e.to_string())?;window.set_position(PhysicalPosition::new(x,y)).map_err(|e|e.to_string())}
}
fn position(window: &WebviewWindow, state: &Mutex<DockState>, requested: Option<Placement>, expanded: bool, floating: bool, drop: bool, previous: Option<String>) -> Result<Layout,String> {
    if window.label() != "main" { return Err("Only the dock can be moved".into()); }
    let current = requested.or(state.lock().map_err(|_|"Dock state unavailable")?.placement.clone());
    let monitors=window.available_monitors().map_err(|e|e.to_string())?;
    let monitor=current.as_ref().and_then(|point| monitors.iter().find(|m| {
        let origin=m.position(); let size=m.size();
        point.x>=origin.x as f64 && point.x<(origin.x as f64+size.width as f64) && point.y>=origin.y as f64 && point.y<(origin.y as f64+size.height as f64)
    }).cloned().or_else(||monitors.iter().min_by(|a,b| {
        let distance=|m:&tauri::Monitor|{let origin=m.position();let size=m.size();let dx=point.x-bounded(point.x,origin.x as f64,origin.x as f64+size.width as f64);let dy=point.y-bounded(point.y,origin.y as f64,origin.y as f64+size.height as f64);dx*dx+dy*dy};
        distance(a).total_cmp(&distance(b))
    }).cloned())).or(window.primary_monitor().map_err(|e|e.to_string())?).ok_or("No display available")?;
    let area=monitor.work_area(); let scale=monitor.scale_factor();
    let ax=area.position.x as f64; let ay=area.position.y as f64;
    let w=area.size.width as f64/scale; let h=area.size.height as f64/scale;
    let default=Placement { x:ax+(w-29.0)*scale,y:ay+h*scale/2.0,side:"right".into(),attached:true };
    let mut point=current.filter(|p|p.x.is_finite()&&p.y.is_finite()&&["left","right","top","bottom"].contains(&p.side.as_str())).unwrap_or(default);
    let mut x=(point.x-ax)/scale; let mut y=(point.y-ay)/scale;
    let raw_x=x; let raw_y=y;
    if drop && !point.attached {
        let (side,distance)=nearest(x,y,w,h); point.side=side.into(); point.attached=distance<56.0;
    }
    if point.attached {
        let inset=if floating { 33.0 } else { 23.0 };
        match point.side.as_str() { "left"=>x=inset,"right"=>x=w-inset,"top"=>y=inset,"bottom"=>y=h-if floating {33.0}else{35.0},_=>{} }
    }
    let _ = previous;
    let settling=false;
    let long=state.lock().map_err(|_|"Dock state unavailable")?.rail_length.unwrap_or(LONG);
    let (frame,rail,panel)=geometry(x,y,&point.side,point.attached,w,h,expanded,floating,settling,long);
    point.x=ax+(rail.x+rail.w/2.0)*scale; point.y=ay+(rail.y+rail.h/2.0)*scale;
    let layout=Layout { placement:point,scale,width:frame.w,height:frame.h,rail_x:rail.x-frame.x,rail_y:rail.y-frame.y,rail_width:rail.w,rail_height:rail.h,panel_x:panel.x-frame.x,panel_y:panel.y-frame.y,panel_width:panel.w,panel_height:panel.h,settling,snap_x:if drop {raw_x-x}else{0.0},snap_y:if drop {raw_y-y}else{0.0} };
    set_bounds(window, (ax+frame.x*scale).round()as i32, (ay+frame.y*scale).round()as i32, (frame.w*scale).ceil()as u32, (frame.h*scale).ceil()as u32)?;
    let mut data=state.lock().map_err(|_|"Dock state unavailable")?;
    data.placement=Some(layout.placement.clone()); data.last=Some(layout.clone());
    Ok(layout)
}
#[tauri::command]
pub async fn set_expanded(window: WebviewWindow,state: State<'_,Mutex<DockState>>,expanded: bool,floating: bool,placement:Option<Placement>,rail_length:Option<f64>) -> Result<Layout,String> {
    if state.lock().map_err(|_|"Dock state unavailable")?.dragging { return Err("Dock is being moved".into()); }
    if let Some(length)=rail_length {
        if !length.is_finite() || !(100.0..=4000.0).contains(&length) { return Err("Invalid dock length".into()); }
        state.lock().map_err(|_|"Dock state unavailable")?.rail_length=Some(length);
    }
    let layout=position(&window,&state,placement,expanded,floating,false,None)?;
    if !window.is_visible().map_err(|e|e.to_string())?{window.show().map_err(|e|e.to_string())?;}
    Ok(layout)
}
#[tauri::command]
pub async fn drag_dock(window:WebviewWindow,state:State<'_,Mutex<DockState>>,floating:bool) -> Result<Layout,String> {
    let old={let mut data=state.lock().map_err(|_|"Dock state unavailable")?; if data.dragging{return Err("Already moving".into())} let last=data.last.clone().ok_or("Dock has not been positioned")?;data.dragging=true;last};
    if let Err(error)=window.start_dragging(){state.lock().map_err(|_|"Dock state unavailable")?.dragging=false;return Err(error.to_string())}
    // Windows owns the pointer while dragging, so DOM pointerup is not reliable.
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os="windows")]
        { use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState,VK_LBUTTON};
          let start=std::time::Instant::now();
          while unsafe { GetAsyncKeyState(VK_LBUTTON as i32) } < 0 && start.elapsed().as_secs()<300 {std::thread::sleep(std::time::Duration::from_millis(16));}
        }
        std::thread::sleep(std::time::Duration::from_millis(40));
    }).await.map_err(|e|e.to_string())?;
    let result=(||{
        let origin=window.outer_position().map_err(|e|e.to_string())?;
        let scale=window.scale_factor().map_err(|e|e.to_string())?;
        let mut point=Placement {x:origin.x as f64+(old.rail_x+old.rail_width/2.0)*scale,y:origin.y as f64+(old.rail_y+old.rail_height/2.0)*scale,side:old.placement.side.clone(),attached:false};
        // Snap to the edge under the pointer, even when the grip is at one end.
        if let Ok(cursor)=window.cursor_position(){
            if let Some(monitor)=window.available_monitors().map_err(|e|e.to_string())?.into_iter().find(|m|{let o=m.position();let z=m.size();cursor.x>=o.x as f64&&cursor.x<o.x as f64+z.width as f64&&cursor.y>=o.y as f64&&cursor.y<o.y as f64+z.height as f64}){
                let area=monitor.work_area();let dpi=monitor.scale_factor();let ax=area.position.x as f64;let ay=area.position.y as f64;
                let (edge,distance)=nearest((cursor.x-ax)/dpi,(cursor.y-ay)/dpi,area.size.width as f64/dpi,area.size.height as f64/dpi);
                if distance<56.0{point.side=edge.into();point.attached=true;point.x=bounded(point.x,ax+0.1,ax+area.size.width as f64-0.1);point.y=bounded(point.y,ay+0.1,ay+area.size.height as f64-0.1);}
            }
        }
        position(&window,&state,Some(point),false,floating,true,Some(old.placement.side))
    })();
    state.lock().map_err(|_|"Dock state unavailable")?.dragging=false;
    result
}
#[tauri::command]
pub async fn move_dock(window:WebviewWindow,state:State<'_,Mutex<DockState>>,dx:f64,dy:f64,floating:bool)->Result<Layout,String>{
    if !dx.is_finite()||!dy.is_finite()||dx.abs()>200.0||dy.abs()>200.0{return Err("Invalid movement".into())}
    let old=state.lock().map_err(|_|"Dock state unavailable")?.last.clone().ok_or("Dock has not been positioned")?;
    let point=Placement{x:old.placement.x+dx*old.scale,y:old.placement.y+dy*old.scale,side:old.placement.side.clone(),attached:false};
    position(&window,&state,Some(point),false,floating,true,Some(old.placement.side))
}

#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn longer_rails_fit_all_edges(){
   for side in ["left","right","top","bottom"] {
     let (frame,rail,_)=geometry(600.,400.,side,false,1200.,800.,false,true,false,450.);
     assert_eq!(if horizontal(side){rail.w}else{rail.h},450.);
     assert!(frame.x>=0. && frame.y>=0. && frame.x+frame.w<=1200. && frame.y+frame.h<=800.);
   }
 }
 #[test] fn long_rail_is_constrained_to_small_work_area(){
   let (_,rail,_)=geometry(160.,100.,"right",false,320.,200.,false,true,false,450.);
   assert_eq!(rail.h,184.);
 }

 #[test] fn expanding_never_moves_the_rail(){for(side,x,y)in[("left",29.,300.),("right",1171.,300.),("top",600.,29.),("bottom",600.,771.)]{let(_,a,_)=geometry(x,y,side,true,1200.,800.,false,true,false,LONG);let(f,b,p)=geometry(x,y,side,true,1200.,800.,true,true,false,LONG);assert_eq!((a.x,a.y,a.w,a.h),(b.x,b.y,b.w,b.h));assert!(f.x<=b.x&&f.y<=b.y&&f.x+f.w>=b.x+b.w&&f.y+f.h>=b.y+b.h);assert!(p.x>=0.&&p.y>=0.&&p.x+p.w<=1200.&&p.y+p.h<=800.);}}
 #[test] fn free_positions_remain_free(){let(_,rail,_)=geometry(500.,350.,"bottom",false,1200.,800.,false,true,false,LONG);assert_eq!(rail.x+rail.w/2.,500.);assert_eq!(rail.y+rail.h/2.,350.);}
 #[test] fn monitor_edges_retain_whole_rail(){for(side,x,y)in[("left",0.,0.),("right",1200.,800.),("top",0.,0.),("bottom",1200.,800.)]{let(f,r,_)=geometry(x,y,side,true,1200.,800.,false,true,false,LONG);assert!(r.x>=PAD&&r.y>=PAD);assert!(f.x+f.w<=1200.&&f.y+f.h<=800.);}}
 #[test] fn edge_mode_joins_the_display(){for(side,x,y)in[("left",0.,400.),("right",1200.,400.),("top",600.,0.),("bottom",600.,800.)]{let(f,r,_)=geometry(x,y,side,true,1200.,800.,true,false,false,LONG);match side{"left"=>assert_eq!(r.x,0.),"right"=>assert_eq!(r.x+r.w,1200.),"top"=>assert_eq!(r.y,0.),_=>assert_eq!(r.y+r.h,792.)}assert!(f.x>=0.&&f.y>=0.&&f.x+f.w<=1200.&&f.y+f.h<=800.);}}
 #[test] fn nearest_edge_controls_orientation(){assert_eq!(nearest(600.,790.,1200.,800.).0,"bottom");assert_eq!(nearest(3.,400.,1200.,800.).0,"left");assert_eq!(nearest(600.,3.,1200.,800.).0,"top");assert_eq!(nearest(1195.,400.,1200.,800.).0,"right");}
 #[test] fn bottom_morph_keeps_clearance_without_a_second_resize(){
   for floating in [true,false]{
     let(f,r,_)=geometry(600.,if floating {767.}else{765.},"bottom",true,1200.,800.,false,floating,true,LONG);
     assert!(r.y+r.h<=788.);assert!(f.y+f.h<=800.);
     assert!(f.h<=62.);assert_eq!(f.w,386.);
   }
 }

}

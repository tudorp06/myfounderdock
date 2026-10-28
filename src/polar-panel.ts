interface Purchase {
  id: string; createdAt: string; totalAmount: number; currency: string;
  productId: string; productName: string; customerName: string; refundedAmount: number;
}
let cached: {orders: Purchase[]; expires: number} | undefined;
let pending: Promise<Purchase[]> | undefined;
let selectedProduct = '';
const bag = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 9V6a4 4 0 0 1 8 0v3" stroke-linecap="round"/></svg>';
function text(tag: string,value: string,className = '') {
  const node = document.createElement(tag);node.textContent=value;node.className=className;return node;
}
function amount(order: Purchase) {
  try {
    const formatter = new Intl.NumberFormat(undefined,{style:'currency',currency:order.currency.toUpperCase()});
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return new Intl.NumberFormat(undefined,{style:'currency',currency:order.currency.toUpperCase(),minimumFractionDigits:0,maximumFractionDigits:digits}).format(order.totalAmount / 10 ** digits);
  } catch { return (order.totalAmount/100).toFixed(2)+' '+order.currency.toUpperCase(); }
}
function when(value: string) {
  const seconds=Math.max(0,(Date.now()-Date.parse(value))/1000);
  if(!Number.isFinite(seconds))return 'Date unavailable';
  if(seconds<60)return 'Just now';
  const unit: Intl.RelativeTimeFormatUnit=seconds<3600?'minute':seconds<86400?'hour':seconds<2592000?'day':seconds<31536000?'month':'year';
  const divisor={minute:60,hour:3600,day:86400,month:2592000,year:31536000}[unit as 'minute'|'hour'|'day'|'month'|'year'];
  return new Intl.RelativeTimeFormat(undefined,{numeric:'always'}).format(-Math.floor(seconds/divisor),unit);
}
function initials(name: string) {
  const words=name.trim().split(/\s+/u);return [words[0],words.length>1?words[words.length-1]:''].map(word=>Array.from(word??'')[0]??'').join('').toLocaleUpperCase();
}
async function load(force: boolean) {
  if(pending)return pending;
  if(!force&&cached&&cached.expires>Date.now())return cached.orders;
  pending=import('@tauri-apps/api/core').then(({invoke})=>invoke<Purchase[]>('load_polar_orders',{productId:null})).then(orders=>{
    orders.sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));
    cached={orders,expires:Date.now()+60_000};return orders;
  }).finally(()=>{pending=undefined;});
  return pending;
}
export async function mountPolar(root: HTMLElement) {
  const view=root.querySelector<HTMLElement>('.polar-view')!;
  const list=view.querySelector<HTMLOListElement>('.purchase-list')!;
  const filter=view.querySelector<HTMLSelectElement>('.polar-product')!;
  const message=view.querySelector<HTMLElement>('.polar-message')!;
  const refresh=root.querySelector<HTMLButtonElement>('.polar-refresh')!;
  const count=view.querySelector<HTMLElement>('.purchase-count')!;
  let orders: Purchase[] = [];
  function render() {
    const visible=orders.filter(order=>!selectedProduct||order.productId===selectedProduct);
    list.replaceChildren();count.textContent=visible.length.toLocaleString()+' purchases';
    for(const order of visible){
      const row=document.createElement('li');row.className='purchase-row';
      const avatar=text('span',initials(order.customerName),'buyer-initials');avatar.setAttribute('aria-hidden','true');
      const copy=text('div','','purchase-copy');
      const name=text('p','','purchase-title');name.append(text('strong',order.customerName),document.createTextNode(' purchased'));
      name.title=order.customerName+' purchased';
      copy.append(name,text('p',order.productName+' · '+amount(order),'purchase-product'));
      if(order.refundedAmount>0)copy.append(text('span',order.refundedAmount>=order.totalAmount?'Refunded':'Partially refunded','purchase-refund'));
      const meta=text('div','','purchase-meta');const icon=text('span','','purchase-bag');icon.innerHTML=bag;
      const time=document.createElement('time');time.dateTime=order.createdAt;time.textContent=when(order.createdAt);
      const date=new Date(order.createdAt);if(Number.isFinite(date.getTime()))time.title=date.toLocaleString();
      meta.append(icon,time);row.append(avatar,copy,meta);list.append(row);
    }
    if(!visible.length)message.textContent=selectedProduct?'No paid purchases for this product yet.':'No paid purchases yet.';
  }
  async function refreshOrders(force = false) {
    if(!view.isConnected)return;
    refresh.disabled=true;view.setAttribute('aria-busy','true');message.textContent='Loading purchases…';
    try {
      if(!('__TAURI_INTERNALS__' in window)){message.textContent='Open myfounderdock on your desktop to load Polar purchases.';return;}
      orders=await load(force);
      if(!view.isConnected)return;
      const products=new Map(orders.filter(order=>order.productId).map(order=>[order.productId,order.productName]));
      filter.replaceChildren(new Option('All products',''));
      for(const [id,name] of products)filter.add(new Option(name,id));
      if(selectedProduct&&!products.has(selectedProduct))selectedProduct='';
      filter.value=selectedProduct;filter.disabled=products.size<2;
      message.textContent='';render();
      root.closest('.dock')?.querySelector('[data-panel="polar"]')?.setAttribute('aria-label','Polar purchases');
    } catch(error) {
      if(view.isConnected)message.textContent=typeof error==='string'?error:'Could not load purchases. Try refreshing.';
    } finally {
      if(view.isConnected){view.removeAttribute('aria-busy');refresh.disabled=false;}
    }
  }
  filter.addEventListener('change',()=>{selectedProduct=filter.value;message.textContent='';render();});
  refresh.addEventListener('click',()=>void refreshOrders(true));
  await refreshOrders();
}

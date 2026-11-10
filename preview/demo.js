import '../custom_components/thingslocal_dashboard/www/thingslocal-dashboard-card.js';
import {fixture} from './fixture.js';

if (!customElements.get('ha-icon')) customElements.define('ha-icon',class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root=this.attachShadow({mode:'open'}), name=this.getAttribute('icon') || '';
    let drawing='<circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>';
    if(name.includes('stove'))drawing='<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/>';
    else if(name.includes('dishwasher'))drawing='<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M4 7h16M8 4h1m3 0h4"/><circle cx="12" cy="14" r="4"/>';
    else if(name.includes('chevron-right'))drawing='<path d="m9 5 7 7-7 7"/>';
    else if(name.includes('chevron-down'))drawing='<path d="m5 9 7 7 7-7"/>';
    else if(name.includes('magnify'))drawing='<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>';
    else if(name.includes('refresh'))drawing='<path d="M20 10a8 8 0 1 0-1 8M20 3v7h-7"/>';
    else if(name.includes('close'))drawing='<path d="m5 5 14 14M5 19 19 5"/>';
    else if(name.includes('map-marker'))drawing='<path d="M12 22S4 14 4 9a8 8 0 0 1 16 0c0 5-8 13-8 13Z"/><circle cx="12" cy="9" r="3"/>';
    else if(name.includes('alert'))drawing='<circle cx="12" cy="12" r="9"/><path d="M12 6v7m0 3v1"/>';
    else if(name.includes('tune'))drawing='<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>';
    else if(name.includes('circle-outline'))drawing='<circle cx="12" cy="12" r="8"/>';
    else if(name.includes('heat'))drawing='<path d="M6 3c-6 6 6 7 0 13m6-13c-6 6 6 7 0 13m6-13c-6 6 6 7 0 13"/>';
    root.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round">${drawing}</svg>`;
  }
});

const card=document.createElement('thingslocal-bridge-dashboard');
let data, snapshot;
const connection={};
const apply=()=>{snapshot={...snapshot,states:{...data.states}};card.hass=snapshot;};
const setup=()=>{
  data=fixture();
  snapshot={connected:true,connection,user:{id:'example-user',is_admin:false},language:new URLSearchParams(location.search).get('language')||'en',config:{time_zone:'Europe/Warsaw'},states:data.states,
    callWS:async request=>{if(request.type!=='thingslocal_dashboard/metadata')throw new Error('Unexpected API');return {devices:data.devices};},
    callService:async(domain,service,payload)=>{
      if(domain!=='select'||service!=='select_option'||payload.entity_id!==data.select||!data.states[data.select].attributes.options.includes(payload.option))throw new Error('Only an existing program select is supported');
      data.calls.push({domain,service,payload});
      data.states[data.select]={...data.states[data.select],state:'unavailable'};
      data.states[data.result]={...data.states[data.result],state:'pending'};apply();
      setTimeout(()=>{
        data.states[data.select]={...data.states[data.select],state:payload.option};
        const current=data.devices[1].entities.find(entity=>entity.role==='program');
        data.states[current.entity_id]={...data.states[current.entity_id],state:payload.option};
        data.states[data.result]={...data.states[data.result],state:'confirmed'};apply();
      },300);
    }};
  card.setConfig({type:'custom:thingslocal-bridge-dashboard',language:'auto'});apply();
};
document.querySelector('#app').append(card);setup();
const params=new URLSearchParams(location.search);
if(params.get('theme')==='dark')document.documentElement.classList.add('dark');
document.querySelector('#demo-label').textContent=params.get('language')==='pl'?'Podgląd · przykładowe dane':'Demo · sample data';
document.querySelector('#theme').onclick=()=>document.documentElement.classList.toggle('dark');
document.querySelector('#connection').onclick=()=>{snapshot={...snapshot,connected:!snapshot.connected};apply();};
document.querySelector('#close-detail').onclick=()=>document.querySelector('#detail').close();
card.addEventListener('hass-more-info',event=>{
  const state=data.states[event.detail.entityId];
  document.querySelector('#detail p').textContent=`${state?.attributes.friendly_name}: ${state?.state} ${state?.attributes.unit_of_measurement || ''}`;
  document.querySelector('#detail').showModal();
});
window.thingslocalDemo={card,get data(){return data;},get hass(){return snapshot;},apply,reset:setup,
  update(patch){snapshot={...snapshot,...patch};apply();}};
if(params.has('checks')) import('../tests/browser-checks.js');

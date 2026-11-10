export function fixture() {
  const states = {}, devices = [], calls = [];
  const stamp = new Date().toISOString();
  const add = (device, role, value, options = {}) => {
    const domain = options.domain || (['power', 'heating', 'attention', 'cleaning_due', 'panel_lock'].includes(role) ? 'binary_sensor' : 'sensor');
    const id = `${domain}.demo_${device.id}_${role}_${device.entities.length}`;
    const entity = {entity_id: id, name: options.name || role, role, component: options.component || 'main', domain,
      can_control: role === 'program_select', diagnostic: options.diagnostic || false};
    device.entities.push(entity);
    states[id] = {entity_id: id, state: String(value), attributes: {friendly_name: entity.name, ...(options.unit ? {unit_of_measurement: options.unit} : {}), ...options.attributes}, last_updated: stamp};
    return id;
  };
  const hob = {id:'hob', name:'Induction hob', model:'Cooktop profile', profile:'cooktop', area:'Kitchen', entities:[]};
  add(hob,'power','on');add(hob,'operating_state','run');add(hob,'heating','on');add(hob,'panel_lock','off');
  for (let number=1;number<=4;number++) {
    const component=`burner-0${number}`;
    add(hob,'zone_level',number===2?7:number===4?4:0,{component});
    add(hob,'zone_mode','manual',{component});add(hob,'zone_timer',number===2?12:0,{component,unit:'min'});
    add(hob,'zone_residual',number===4?'hot':'normal',{component});
  }
  add(hob,'certificate_expiry',new Date(Date.now()+90*86400000).toISOString(),{diagnostic:true});
  const dw={id:'dishwasher',name:'Dishwasher',model:'Dishwasher profile',profile:'dishwasher',area:'Kitchen',entities:[]};
  add(dw,'power','on');add(dw,'operating_state','ready');add(dw,'program','eco');add(dw,'job_state','none');
  add(dw,'remaining_time',230,{unit:'min'});add(dw,'remaining_display','3:50');add(dw,'progress',0,{unit:'%'});
  add(dw,'completion_time',new Date(Date.now()+230*60000).toISOString());
  const select=add(dw,'program_select','eco',{domain:'select',attributes:{options:['auto','eco','intensive','delicate','express','preWash','selfClean','extraSilence']}});
  const result=add(dw,'command_result','ready',{diagnostic:true});
  add(dw,'attention','off');add(dw,'messages','none',{attributes:{messages:[]}});
  add(dw,'cleaning_count',21,{diagnostic:true});add(dw,'cleaning_threshold',20,{diagnostic:true});add(dw,'cleaning_due','on');
  add(dw,'certificate_expiry',new Date(Date.now()+90*86400000).toISOString(),{diagnostic:true});
  const generic={id:'utility',name:'Utility monitor',model:'Generic profile · extensible readings',profile:'generic',area:'Utility room',entities:[]};
  add(generic,'temperature',22.6,{unit:'°C'});add(generic,'power_consumption',85,{unit:'W'});add(generic,'energy',1.42,{unit:'kWh'});
  add(generic,'generic','42',{name:'Custom reported counter',unit:'min'});
  devices.push(hob,dw,generic);
  return {devices,states,calls,select,result};
}

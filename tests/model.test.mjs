import test from 'node:test';
import assert from 'node:assert/strict';
import {available, numeric, escape, deviceStatus, attention, zones, canSelect, language} from '../custom_components/thingslocal_dashboard/www/model.js';
import en from '../custom_components/thingslocal_dashboard/www/locales/en.js';
import pl from '../custom_components/thingslocal_dashboard/www/locales/pl.js';

const entity = (role, domain='sensor', extra={}) => ({role, domain, entity_id: `${domain}.${role}`, component:'main', ...extra});
const state = (value, attributes={}) => ({state:value, attributes});
test('missing and invalid readings are not zero or off', () => {
  assert.equal(available(undefined),false); assert.equal(available(state('unavailable')),false);
  for(const value of [null, undefined, '', ' ', true, NaN, Infinity, 'unknown']) assert.equal(numeric(value),null);
  assert.equal(numeric('0'),0); assert.equal(numeric('12.5'),12.5);
});
test('certificate and select availability do not imply appliance connectivity', () => {
  const device={entities:[entity('certificate_expiry'),entity('program_select','select')]};
  assert.equal(deviceStatus(device,{'sensor.certificate_expiry':state('2027-01-01')}),'waiting');
  device.entities.push(entity('power','binary_sensor'));
  assert.equal(deviceStatus(device,{'binary_sensor.power':state('unavailable')}),'offline');
  assert.equal(deviceStatus(device,{'binary_sensor.power':state('unknown')}),'unknown');
  assert.equal(deviceStatus(device,{'binary_sensor.power':state('off')}),'off');
});
test('alerts require explicitly reported states, not just cleaning threshold', () => {
  const device={entities:[entity('attention','binary_sensor'),entity('cleaning_due','binary_sensor'),entity('cleaning_threshold')]};
  assert.deepEqual(attention(device,{'sensor.cleaning_threshold':state('20')}),[]);
  assert.deepEqual(attention(device,{'binary_sensor.cleaning_due':state('on')}),['cleaning_due']);
});
test('controls require the exact allowed domain, rights, connectivity and availability', () => {
  const e=entity('program_select','select',{can_control:true}); const hass={connected:true,states:{[e.entity_id]:state('eco',{options:['eco','auto']})}};
  assert.equal(canSelect(e,hass,false),true);
  assert.equal(canSelect(e,hass,true),false); assert.equal(canSelect(e,hass,false,true),false);
  assert.equal(canSelect({...e,can_control:false},hass,false),false);
  assert.equal(canSelect({...e,role:'generic'},hass,false),false);
  assert.equal(canSelect(e,{...hass,connected:false},false),false);
});
test('zone count and ordering are dynamic without position labels', () => {
  const result=zones({entities:[entity('zone_level','sensor',{component:'burner-12'}),entity('zone_mode','sensor',{component:'burner-03'}),entity('zone_level','sensor',{component:'burner-03'})]});
  assert.deepEqual(result.map(([component])=>component),['burner-03','burner-12']);
  assert.equal(result[0][1].length,2);
});
test('both languages cover exactly the same nonempty keys and locale selection', () => {
  const flatten=(object,prefix='')=>Object.entries(object).flatMap(([key,value])=>typeof value==='object'?flatten(value,prefix+key+'.'):[[prefix+key,value]]);
  const a=flatten(en),b=flatten(pl);
  assert.deepEqual(a.map(([k])=>k).sort(),b.map(([k])=>k).sort());
  assert.ok([...a,...b].every(([,value])=>typeof value==='string'&&value.length>0));
  assert.equal(language('auto','en',{language:'pl-PL'}),'pl'); assert.equal(language('en','pl',{language:'pl'}),'en');
  assert.equal(language(null,null,{language:'de'}),'en');
});
test('untrusted names cannot become HTML',()=>assert.equal(escape('<img src=x onerror="evil()">'), '&lt;img src=x onerror=&quot;evil()&quot;&gt;'));

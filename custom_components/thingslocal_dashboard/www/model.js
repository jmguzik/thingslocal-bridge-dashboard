export const available = state => Boolean(state && typeof state.state === 'string' && !["unknown", "unavailable", ""].includes(state.state));
export const numeric = value => value != null && typeof value !== "boolean" && String(value).trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
export const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
export const record = (device, role, states) => device.entities.find(entity => entity.role === role && available(states[entity.entity_id])) || device.entities.find(entity => entity.role === role);
const infrastructure = new Set(["certificate_expiry", "command_result", "notification_event", "notification_ack", "program_select"]);
export function deviceStatus(device, states) {
  const telemetry = device.entities.filter(entity => !infrastructure.has(entity.role));
  if (!telemetry.length) return "waiting";
  if (!telemetry.some(entity => available(states[entity.entity_id]))) {
    return telemetry.some(entity => states[entity.entity_id]?.state === "unavailable") ? "offline" : "unknown";
  }
  const power = states[record(device, "power", states)?.entity_id];
  if (available(power) && power.state === "off") return "off";
  const operation = states[record(device, "operating_state", states)?.entity_id];
  const heating = states[record(device, "heating", states)?.entity_id];
  if (available(operation) && ["running", "run"].includes(operation.state) || available(heating) && heating.state === "on") return "running";
  if (available(operation) && ["paused", "pause"].includes(operation.state)) return "paused";
  if (available(operation) && ["ready", "idle", "finished"].includes(operation.state)) return "ready";
  return "online";
}
export function attention(device, states, now = Date.now()) {
  const roles = [];
  for (const role of ["attention", "cleaning_due"]) {
    const state = states[record(device, role, states)?.entity_id];
    if (available(state) && state.state === "on") roles.push(role);
  }
  const certificate = states[record(device, "certificate_expiry", states)?.entity_id];
  if (available(certificate) && Number.isFinite(Date.parse(certificate.state)) && Date.parse(certificate.state) - now <= 14 * 86400000) roles.push("certificate_expiry");
  return roles;
}
export function zones(device) {
  const groups = new Map();
  for (const entity of device.entities) if (entity.role.startsWith("zone_")) {
    if (!groups.has(entity.component)) groups.set(entity.component, []);
    groups.get(entity.component).push(entity);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, {numeric: true}));
}
export function canSelect(entity, hass, readOnly, pending = false) {
  return Boolean(!readOnly && !pending && hass?.connected !== false && entity?.role === "program_select"
    && entity.domain === "select" && entity.can_control === true && available(hass.states?.[entity.entity_id])
    && Array.isArray(hass.states[entity.entity_id].attributes?.options));
}
export function language(preference, config, hass, browser = "en") {
  const selected = preference || config || "auto";
  if (supportedLanguages.includes(selected)) return selected;
  const locale = String(hass?.language || browser).replace('_','-').toLowerCase();
  return supportedLanguages.includes(locale) ? locale : supportedLanguages.includes(locale.split('-')[0]) ? locale.split('-')[0] : 'en';
}
import {supportedLanguages} from './i18n.js?v=0.1.0';

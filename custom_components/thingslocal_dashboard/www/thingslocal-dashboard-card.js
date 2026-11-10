import {dictionaries, supportedLanguages, languageName} from './i18n.js?v=0.1.0';
import {STYLES} from './styles.js?v=0.1.0';
import {available, numeric, escape, record, deviceStatus, attention, zones, canSelect, language} from './model.js?v=0.1.0';

const icon = value => `<ha-icon icon="mdi:${value}" aria-hidden="true"></ha-icon>`;
const diagnosticRoles = new Set(['certificate_expiry', 'command_result', 'notification_event', 'notification_ack']);

export class ThingsLocalDashboard extends HTMLElement {
  constructor() {
    super(); this._devices = []; this._loaded = false; this._loading = false; this._error = false;
    this._request = 0; this._filter = 'all'; this._search = ''; this._settings = false;
    this._prefs = {}; this._expanded = new Set(); this._pending = new Map(); this._feedback = new Map();
  }
  setConfig(config) {
    if (config.language && !['auto', ...supportedLanguages].includes(config.language)) throw new Error('Supported languages: auto, ' + supportedLanguages.join(', '));
    if (config.read_only != null && typeof config.read_only !== 'boolean') throw new Error('read_only must be a boolean');
    if (config.device_ids && (!Array.isArray(config.device_ids) || !config.device_ids.every(value => typeof value === 'string'))) throw new Error('device_ids must be a list');
    this._config = {...config}; this._loadPrefs();
    if (!this.shadowRoot) {
      this.attachShadow({mode: 'open'}); this.shadowRoot.innerHTML = `<style>${STYLES}</style><main></main>`;
      this.shadowRoot.addEventListener('click', event => this._click(event));
      this.shadowRoot.addEventListener('change', event => this._change(event));
      this.shadowRoot.addEventListener('input', event => {
        if (event.target.matches('[data-search]')) {this._search = event.target.value; this._render(true);}
      });
      this.shadowRoot.addEventListener('focusout', () => queueMicrotask(() => {
        if (this._deferred && this.shadowRoot.activeElement?.tagName !== 'SELECT') this._render(true);
      }));
      this.shadowRoot.addEventListener('toggle', event => {
        if (event.target.matches('details[data-device]')) {
          const id = event.target.dataset.device;
          event.target.open ? this._expanded.add(id) : this._expanded.delete(id);
        }
      }, true);
    }
    this._render(true);
  }
  connectedCallback() {if (this._hass && !this._loaded && !this._loading && !this._error) this._discover();}
  disconnectedCallback() {this._request++; this._loading = false; this._cancelPending();}
  set hass(hass) {
    const previous = this._hass;
    const contextChanged = previous && (previous.user?.id !== hass.user?.id
      || previous.user?.is_admin !== hass.user?.is_admin || previous.connection !== hass.connection);
    this._hass = hass;
    if (!previous || contextChanged) {
      this._request++; this._devices = []; this._loaded = false; this._loading = false; this._error = false;
      this._expanded.clear(); this._feedback.clear(); this._cancelPending(); this._loadPrefs();
    }
    const reconnect = previous?.connected === false && hass.connected !== false;
    if (previous?.connected !== false && hass.connected === false || reconnect) {
      this._request++; this._loading = false;
      if (reconnect) this._error = false;
    }
    if (hass.connected === false) {
      this.shadowRoot?.querySelectorAll('select[data-program]').forEach(select => {select.disabled = true;});
      this._cancelPending();
    }
    this._checkPending();
    if ((!this._loaded && !this._loading && !this._error) || reconnect) this._discover();
    const changed = contextChanged || !previous || previous.connected !== hass.connected || previous.language !== hass.language
      || this._devices.some(device => device.entities.some(entity => previous.states?.[entity.entity_id] !== hass.states?.[entity.entity_id]));
    if (changed) this._render(Boolean(contextChanged || previous && previous.connected !== hass.connected));
  }
  get hass() {return this._hass;}
  getCardSize() {return 14;}
  getGridOptions() {return {columns: 'full', rows: 'auto'};}
  get _lang() {return language(this._prefs.language, this._config?.language, this._hass, navigator.language);}
  _t(key) {return dictionaries[this._lang][key] ?? key;}
  _value(table, key) {return Object.hasOwn(table, key) ? table[key] : key;}
  _label(entity) {return entity.custom_name ? entity.name : Object.hasOwn(dictionaries[this._lang].roles, entity.role) ? dictionaries[this._lang].roles[entity.role] : entity.name;}
  _format(value, precision = 1) {return new Intl.NumberFormat(this._lang, {maximumFractionDigits: precision}).format(value);}
  _date(value) {
    if (!Number.isFinite(Date.parse(value))) return this._t('missing');
    let timezone = this._hass?.config?.time_zone || 'UTC';
    try {new Intl.DateTimeFormat(this._lang, {timeZone: timezone});} catch {timezone = 'UTC';}
    return new Intl.DateTimeFormat(this._lang, {timeZone: timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}).format(new Date(value));
  }
  _storageKey() {return `thingslocal-dashboard:${this._hass?.user?.id || 'local'}`;}
  _loadPrefs() {
    let value = {}; try {value = JSON.parse(localStorage.getItem(this._storageKey()) || '{}');} catch {}
    if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
    this._prefs = {language: ['auto', ...supportedLanguages].includes(value.language) ? value.language : undefined,
      diagnostics: value.diagnostics === true, compact: value.compact === true,
      hidden: Array.isArray(value.hidden) ? value.hidden.filter(id => typeof id === 'string') : []};
  }
  _savePrefs() {try {localStorage.setItem(this._storageKey(), JSON.stringify(this._prefs));} catch {}}
  _cancelPending() {for (const pending of this._pending.values()) clearTimeout(pending.timer); this._pending.clear();}
  async _discover() {
    if (!this._hass || this._hass.connected === false || this._loading) return;
    const request = ++this._request, connection = this._hass.connection, user = this._hass.user?.id;
    this._loading = true; this._error = false; this._render();
    try {
      const data = await this._hass.callWS({type: 'thingslocal_dashboard/metadata'});
      if (request !== this._request || connection !== this._hass.connection || user !== this._hass.user?.id || this._hass.connected === false) return;
      if (!Array.isArray(data.devices)) throw new Error('Invalid metadata');
      this._devices = data.devices.filter(device => typeof device.id === 'string' && Array.isArray(device.entities));
      this._loaded = true;
    } catch {if (request === this._request) this._error = true;}
    finally {if (request === this._request) {this._loading = false; this._render();}}
  }
  _reading(entity) {
    const state = this._hass?.states?.[entity?.entity_id];
    if (!available(state)) return {value: this._t('missing'), unit: '', available: false};
    const raw = state.state, number = numeric(raw), dict = dictionaries[this._lang];
    if (entity.role === 'certificate_expiry' || entity.role === 'completion_time') return {value: this._date(raw), unit: '', available: true};
    if (entity.role === 'program' || entity.role === 'program_select') return {value: this._value(dict.programs, raw), unit: '', available: true};
    if (entity.role === 'command_result') return {value: this._value(dict.results, raw), unit: '', available: true};
    if (number != null) return {value: this._format(number, 2), unit: state.attributes?.unit_of_measurement || '', available: true};
    if (['on', 'off'].includes(raw)) {
      const deviceClass = state.attributes?.device_class;
      const key = entity.role === 'panel_lock' ? (raw === 'on' ? 'locked' : 'unlocked')
        : ['door', 'window', 'opening'].includes(deviceClass) ? (raw === 'on' ? 'open' : 'closed')
        : deviceClass === 'lock' ? (raw === 'on' ? 'locked' : 'unlocked') : raw;
      return {value: this._t(key), unit: '', available: true};
    }
    return {value: this._value(dict.values, raw), unit: state.attributes?.unit_of_measurement || '', available: true};
  }
  _metric(entity) {
    if (!entity) return '';
    const reading = this._reading(entity), clickable = ['sensor', 'binary_sensor'].includes(entity.domain);
    const tag = clickable ? 'button' : 'div';
    return `<${tag} ${clickable ? `type="button" data-more="${escape(entity.entity_id)}" title="${escape(this._t('entityDetails'))}"` : ''} class="metric ${reading.available ? '' : 'unavailable'}"><span class="metric-label"><span>${escape(this._label(entity))}</span>${clickable ? icon('chevron-right') : ''}</span><strong class="reading ${String(reading.value).length > 10 ? 'long' : ''}">${escape(reading.value)}${reading.unit ? `<small>${escape(reading.unit)}</small>` : ''}</strong></${tag}>`;
  }
  _role(device, role) {return record(device, role, this._hass?.states || {});}
  _zone(component, entities) {
    const level = entities.find(entity => entity.role === 'zone_level'), state = this._hass?.states?.[level?.entity_id];
    const levelNumber = available(state) ? numeric(state.state) : null;
    const residual = entities.find(entity => entity.role === 'zone_residual'), residualState = this._hass?.states?.[residual?.entity_id];
    const hot = available(residualState) && ['hot', 'veryHot', 'warm'].includes(residualState.state);
    const residualText = !available(residualState) ? '' : hot ? this._t('residualHot') : residualState.state === 'normal' ? this._t('residualNormal') : this._label(residual) + ': ' + residualState.state;
    const number = component.match(/^burner-(\d+)$/)?.[1];
    const extras = entities.filter(entity => ['zone_mode', 'zone_timer'].includes(entity.role));
    return `<div class="zone ${levelNumber > 0 ? 'active' : ''} ${hot ? 'hot' : ''}"><div class="zone-title"><span>${escape(number ? `${this._t('zone')} ${Number(number)}` : component)}</span>${icon(hot ? 'heat-wave' : 'circle-outline')}</div><strong>${levelNumber == null ? '—' : escape(this._format(levelNumber, 0))}</strong>${extras.map(entity => `<div class="zone-extra">${escape(this._label(entity))}: ${escape(this._reading(entity).value)} ${escape(this._reading(entity).unit)}</div>`).join('')}${available(residualState) ? `<div class="zone-extra">${escape(residualText)}</div>` : ''}</div>`;
  }
  _alerts(device) {
    const messages = this._role(device, 'messages'), messageState = this._hass?.states?.[messages?.entity_id];
    const alert = this._role(device, 'attention'), alertState = this._hass?.states?.[alert?.entity_id];
    let html = '';
    if (available(alertState) && alertState.state === 'on') {
      const records = Array.isArray(messageState?.attributes?.messages)
        ? messageState.attributes.messages.filter(item => item && typeof item === 'object' && typeof item.code === 'string')
          .slice(0, 32).map(item => ({code: item.code.slice(0, 96), description: typeof item.description === 'string' ? item.description.slice(0, 256) : ''})) : [];
      html += `<div class="notice warning">${icon('alert-circle-outline')}<div><strong>${escape(this._t('reportedMessages'))}</strong>${records.length ? records.map(item => `<p><span class="message-code">${escape(item.code)}</span>${item.description ? ` · ${escape(item.description)}` : ''}</p>`).join('') : `<p>${escape(messageState?.state || this._t('missing'))}</p>`}<p class="muted">${escape(this._t('messagesNote'))}</p></div></div>`;
    } else if (device.profile === 'dishwasher') html += `<p class="muted">${escape(available(alertState) ? this._t('noMessages') : this._t('noAlertData'))}</p>`;
    const due = this._role(device, 'cleaning_due'), dueState = this._hass?.states?.[due?.entity_id];
    const count = this._role(device, 'cleaning_count'), threshold = this._role(device, 'cleaning_threshold');
    if (due || count || threshold) {
      html += `<div class="notice ${available(dueState) && dueState.state === 'on' ? 'warning' : 'info'}" style="margin-top:12px">${icon('dishwasher-alert')}<div><strong>${escape(!available(dueState) ? this._t('cleaningUnknown') : dueState.state === 'on' ? this._t('cleaningNeeded') : this._t('cleaningClear'))}</strong><p class="muted">${escape(this._t('cleaningCount'))}: ${escape(this._reading(count).value)} · ${escape(this._t('cleaningThreshold'))}: ${escape(this._reading(threshold).value)}</p></div></div>`;
    }
    const certificate = this._role(device, 'certificate_expiry'), certificateState = this._hass?.states?.[certificate?.entity_id];
    if (available(certificateState) && Number.isFinite(Date.parse(certificateState.state)) && Date.parse(certificateState.state) - Date.now() <= 14 * 86400000) {
      html += `<div class="notice warning">${icon('certificate-outline')}<div><strong>${escape(this._t(Date.parse(certificateState.state) < Date.now() ? 'certificateExpired' : 'certificateSoon'))}</strong><p>${escape(this._date(certificateState.state))}</p><p class="muted">${escape(this._t('certificateHelp'))}</p></div></div>`;
    }
    return html ? `<div class="alerts">${html}</div>` : '';
  }
  _program(device) {
    const entity = this._role(device, 'program_select');
    if (!entity) return '';
    const state = this._hass?.states?.[entity.entity_id], options = state?.attributes?.options;
    const pending = this._pending.has(entity.entity_id), enabled = canSelect(entity, this._hass, this._config.read_only, pending);
    const reason = this._config.read_only ? 'readOnly' : !entity.can_control ? 'permissionDenied' : 'controlUnavailable';
    const feedback = this._feedback.get(entity.entity_id);
    return `<div class="program-control"><label for="program-${escape(device.id)}">${escape(this._t('program'))}</label><select id="program-${escape(device.id)}" data-focus="program-${escape(device.id)}" data-program="${escape(entity.entity_id)}" ${enabled ? '' : 'disabled'}>${!available(state) ? `<option value="">${escape(this._t('chooseProgram'))}</option>` : ''}${(Array.isArray(options) ? options : []).filter(option => typeof option === 'string').map(option => `<option value="${escape(option)}" ${state?.state === option ? 'selected' : ''}>${escape(this._value(dictionaries[this._lang].programs, option))}</option>`).join('')}</select><p>${escape(this._t('selectHelp'))}</p>${!enabled && !pending ? `<p>${escape(this._t(reason))}</p>` : ''}${pending || feedback ? `<p class="program-feedback ${feedback?.error ? 'error' : ''}" role="status">${escape(this._t(pending ? 'applying' : feedback.key))}</p>` : ''}</div>`;
  }
  _device(device) {
    const states = this._hass?.states || {}, status = deviceStatus(device, states), used = new Set();
    const roles = device.profile === 'cooktop' ? ['power', 'operating_state', 'heating', 'panel_lock']
      : device.profile === 'dishwasher' ? ['program', 'job_state', 'remaining_display', 'remaining_time', 'completion_time'] : [];
    const metrics = [];
    for (const role of roles) {
      if (role === 'remaining_time' && metrics.some(entity => entity.role === 'remaining_display')) continue;
      const entity = this._role(device, role); if (entity) {metrics.push(entity); used.add(entity.entity_id);}
    }
    const zoneGroups = device.profile === 'cooktop' ? zones(device) : [];
    for (const [, entities] of zoneGroups) for (const entity of entities) used.add(entity.entity_id);
    const extra = device.entities.filter(entity => !used.has(entity.entity_id) && entity.role !== 'program_select'
      && !['attention', 'messages', 'cleaning_due'].includes(entity.role)
      && (this._prefs.diagnostics || !(entity.diagnostic || diagnosticRoles.has(entity.role))));
    const progress = states[this._role(device, 'progress')?.entity_id], percentage = available(progress) ? numeric(progress.state) : null;
    const validProgress = percentage != null && percentage >= 0 && percentage <= 100;
    const times = device.entities.filter(entity => !diagnosticRoles.has(entity.role)).map(entity => states[entity.entity_id]?.last_updated).filter(value => Number.isFinite(Date.parse(value)));
    const last = times.length ? times.sort((a, b) => Date.parse(b) - Date.parse(a))[0] : null;
    return `<article class="appliance" data-device-card="${escape(device.id)}"><div class="card-heading"><div class="card-name">${icon(device.profile === 'cooktop' ? 'stove' : device.profile === 'dishwasher' ? 'dishwasher' : 'devices')}<div><h2>${escape(device.name)}</h2><p class="muted">${escape(this._t(device.profile))}${device.model ? ` · ${escape(device.model)}` : ''}</p><div class="card-meta"><span class="badge ${escape(status)}">${escape(this._t(status === 'waiting' ? 'waiting' : 'state_' + status))}</span>${this._config.read_only ? `<span class="muted">${escape(this._t('readOnly'))}</span>` : ''}</div></div></div>${this._hass?.user?.is_admin && !this._config.read_only ? `<a class="device-link" href="/config/devices/device/${encodeURIComponent(device.id)}" aria-label="${escape(this._t('deviceDetails'))}">${icon('open-in-new')}</a>` : ''}</div>${metrics.length ? `<div class="metrics">${metrics.map(entity => this._metric(entity)).join('')}</div>` : ''}${validProgress && device.profile === 'dishwasher' ? `<div class="progress" role="progressbar" aria-label="${escape(dictionaries[this._lang].roles.progress)}" aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percentage}%"></span></div><p class="progress-caption">${escape(this._format(percentage, 0))}%</p>` : ''}${zoneGroups.length ? `<div class="section-heading"><h3>${escape(this._t('zones'))}</h3></div><div class="zones">${zoneGroups.map(([component, entities]) => this._zone(component, entities)).join('')}</div><p class="zone-note">${escape(this._t('zoneNote'))}</p>` : ''}${this._program(device)}${this._alerts(device)}${extra.length ? device.profile === 'generic' ? `<div class="metrics">${extra.map(entity => this._metric(entity)).join('')}</div>` : `<details class="readings-toggle" data-device="${escape(device.id)}" ${this._expanded.has(device.id) ? 'open' : ''}><summary>${escape(this._t('moreReadings'))} ${icon('chevron-down')}</summary><div class="metrics">${extra.map(entity => this._metric(entity)).join('')}</div></details>` : ''}<footer class="device-footer"><span>${escape(this._t('viewOnly'))}</span><span>${escape(this._t('lastUpdated'))}: ${escape(last ? this._date(last) : this._t('missing'))}</span></footer></article>`;
  }
  _settingsHTML() {
    if (!this._settings) return '';
    const selected = this._prefs.language || this._config.language || 'auto';
    const devices = this._devices.filter(device => !this._config.device_ids || this._config.device_ids.includes(device.id));
    return `<section class="settings-panel"><div class="section-heading"><h2>${escape(this._t('settings'))}</h2><button type="button" class="icon-button" data-action="settings" aria-label="${escape(this._t('close'))}">${icon('close')}</button></div><div class="settings-fields"><label class="language-field">${escape(this._t('language'))}<select data-setting="language" data-focus="setting-language">${['auto', ...supportedLanguages].map(value => `<option value="${value}" ${value === selected ? 'selected' : ''}>${escape(value === 'auto' ? this._t('automatic') : languageName(value))}</option>`).join('')}</select></label><label><input type="checkbox" data-setting="diagnostics" ${this._prefs.diagnostics ? 'checked' : ''}>${escape(this._t('diagnostics'))}</label><label><input type="checkbox" data-setting="compact" ${this._prefs.compact ? 'checked' : ''}>${escape(this._t('compact'))}</label></div><h3>${escape(this._t('visibleDevices'))}</h3><div class="device-choices">${devices.map(device => `<label><input type="checkbox" data-visible="${escape(device.id)}" ${this._prefs.hidden.includes(device.id) ? '' : 'checked'}>${escape(device.name)}</label>`).join('')}</div><p class="muted">${escape(this._t('preferences'))}</p><button type="button" class="text-button" data-action="reset">${escape(this._t('reset'))}</button></section>`;
  }
  _render(force = false) {
    if (!this.shadowRoot) return;
    const focused = this.shadowRoot.activeElement;
    if (!force && focused?.tagName === 'SELECT') {this._deferred = true; return;}
    this._deferred = false;
    const focusKey = focused?.dataset.focus, selection = focused?.selectionStart;
    const states = this._hass?.states || {}, scope = this._devices.filter(device => !this._config.device_ids || this._config.device_ids.includes(device.id));
    const visible = scope.filter(device => !this._prefs.hidden.includes(device.id));
    const counts = {all: visible.length, active: 0, attention: 0, offline: 0};
    for (const device of visible) {
      if (deviceStatus(device, states) === 'running') counts.active++;
      if (attention(device, states).length) counts.attention++;
      if (deviceStatus(device, states) === 'offline') counts.offline++;
    }
    const search = this._search.trim().toLocaleLowerCase(this._lang);
    const filtered = visible.filter(device => (!search || [device.name, device.area, device.model].join(' ').toLocaleLowerCase(this._lang).includes(search))
      && (this._filter === 'all' || this._filter === 'active' && deviceStatus(device, states) === 'running'
        || this._filter === 'attention' && attention(device, states).length || this._filter === 'offline' && deviceStatus(device, states) === 'offline'));
    const groups = new Map();
    for (const device of filtered) {const area = device.area || this._t('unassigned'); if (!groups.has(area)) groups.set(area, []); groups.get(area).push(device);}
    const empty = (title, body) => `<div class="empty">${icon('devices')}<h2>${escape(this._t(title))}</h2><p>${escape(this._t(body))}</p></div>`;
    this.shadowRoot.querySelector('main').className = this._prefs.compact ? 'compact' : '';
    this.shadowRoot.querySelector('main').innerHTML = `<header><div class="brand">${icon('devices')}<div><h1>${escape(this._config.title || this._t('title'))}</h1><p class="muted">${escape(this._t('subtitle'))}</p></div></div><div class="header-actions"><div class="language-switch" role="group" aria-label="${escape(this._t('language'))}">${supportedLanguages.map(lang => `<button type="button" class="${this._lang === lang ? 'selected' : ''}" data-language="${lang}" data-focus="lang-${lang}" aria-pressed="${this._lang === lang}">${lang.toUpperCase()}</button>`).join('')}</div><button type="button" class="icon-button" data-action="refresh" aria-label="${escape(this._t('refresh'))}" ${this._loading ? 'disabled' : ''}>${icon('refresh')}</button><button type="button" class="icon-button ${this._settings ? 'selected' : ''}" data-action="settings" aria-expanded="${this._settings}" aria-label="${escape(this._t('settings'))}">${icon('tune-variant')}</button></div></header>${this._hass?.connected === false ? `<div class="notice warning" role="status">${icon('wifi-off')}<div>${escape(this._t('disconnected'))}</div></div>` : ''}${this._settingsHTML()}<div class="summaries">${[['all', 'appliances', 'devices'], ['active', 'active', 'play-circle-outline'], ['attention', 'attention', 'alert-circle-outline'], ['offline', 'offline', 'wifi-off']].map(([key, label, symbol]) => `<button type="button" class="stat" data-filter="${key}" aria-label="${escape(this._t(label))}: ${counts[key]}"><span class="stat-label">${icon(symbol)}${escape(this._t(label))}</span><strong>${this._loading && !this._loaded ? '—' : this._format(counts[key], 0)}</strong></button>`).join('')}</div><div class="toolbar"><div class="filters">${[['all', 'all'], ['active', 'filterActive'], ['attention', 'filterAttention'], ['offline', 'filterOffline']].map(([key, label]) => `<button type="button" data-filter="${key}" aria-pressed="${this._filter === key}" class="${this._filter === key ? 'selected' : ''}">${escape(this._t(label))}</button>`).join('')}</div><label class="search">${icon('magnify')}<input data-search data-focus="search" type="search" aria-label="${escape(this._t('search'))}" placeholder="${escape(this._t('search'))}" value="${escape(this._search)}"></label></div>${this._error ? `<div class="notice error" role="alert">${icon('alert-circle-outline')}<div>${escape(this._t('discoveryError'))}</div></div>` : ''}${this._loading && !this._loaded ? empty('loading', 'subtitle') : !scope.length && this._loaded ? empty('empty', 'emptyHelp') : !filtered.length && this._loaded ? empty('noMatches', 'noMatchesHelp') : [...groups].map(([area, devices]) => `<section><h2 class="room-heading">${icon('map-marker-outline')}${escape(area)}</h2><div class="devices">${devices.map(device => this._device(device)).join('')}</div></section>`).join('')}<p class="summary-note">${escape(this._t('shown'))}: ${this._format(filtered.length, 0)} · ThingsLocal Bridge</p>`;
    if (focusKey) {
      const target = [...this.shadowRoot.querySelectorAll('[data-focus]')].find(element => element.dataset.focus === focusKey);
      if (target && !target.disabled) {target.focus({preventScroll: true}); if (target.tagName === 'INPUT' && typeof selection === 'number') {try {target.setSelectionRange(selection, selection);} catch {}}}
    }
  }
  _click(event) {
    const target = event.target.closest('button,a'); if (!target) return;
    if (target.dataset.language) {this._prefs.language = target.dataset.language; this._savePrefs(); this._render(true);}
    if (target.dataset.filter) {this._filter = target.dataset.filter; this._render(true);}
    if (target.dataset.action === 'settings') {this._settings = !this._settings; this._render(true);}
    if (target.dataset.action === 'refresh') {this._error = false; this._discover();}
    if (target.dataset.action === 'reset') {this._prefs = {hidden: []}; this._savePrefs(); this._render(true);}
    if (target.dataset.more) {
      const entity = this._devices.flatMap(device => device.entities).find(item => item.entity_id === target.dataset.more);
      if (entity && ['sensor', 'binary_sensor'].includes(entity.domain)) this.dispatchEvent(new CustomEvent('hass-more-info', {detail: {entityId: entity.entity_id}, bubbles: true, composed: true}));
    }
  }
  _change(event) {
    const target = event.target;
    if (target.dataset.setting) {this._prefs[target.dataset.setting] = target.type === 'checkbox' ? target.checked : target.value; this._savePrefs(); this._render(true);}
    if (target.dataset.visible) {const hidden = new Set(this._prefs.hidden); target.checked ? hidden.delete(target.dataset.visible) : hidden.add(target.dataset.visible); this._prefs.hidden = [...hidden]; this._savePrefs(); this._render(true);}
    if (target.dataset.program) this._selectProgram(target.dataset.program, target.value);
  }
  async _selectProgram(entityId, option) {
    const entity = this._devices.flatMap(device => device.entities).find(item => item.entity_id === entityId);
    if (!canSelect(entity, this._hass, this._config.read_only, this._pending.has(entityId))) return;
    const state = this._hass.states[entityId];
    if (!state.attributes.options.includes(option)) return;
    if (state.state === option) {this._feedback.set(entityId, {key: 'unchanged'}); this._render(true); return;}
    const pending = {option, user: this._hass.user?.id, connection: this._hass.connection};
    pending.timer = setTimeout(() => {
      if (this._pending.get(entityId) !== pending) return;
      this._pending.delete(entityId); this._feedback.set(entityId, {key: 'outcomeUnknown', error: true}); this._render();
    }, 12000);
    this._pending.set(entityId, pending); this._feedback.delete(entityId); this._render(true);
    try {await this._hass.callService('select', 'select_option', {entity_id: entityId, option});}
    catch {
      if (this._pending.get(entityId) === pending) {
        clearTimeout(pending.timer); this._pending.delete(entityId);
        this._feedback.set(entityId, {key: 'serviceError', error: true}); this._render();
      }
    }
  }
  _checkPending() {
    for (const [entityId, pending] of this._pending) {
      if (pending.user !== this._hass.user?.id || pending.connection !== this._hass.connection) continue;
      const state = this._hass.states?.[entityId];
      if (available(state) && state.state === pending.option) {
        clearTimeout(pending.timer); this._pending.delete(entityId); this._feedback.set(entityId, {key: 'confirmed'});
      }
    }
  }
}

if (!customElements.get('thingslocal-bridge-dashboard')) customElements.define('thingslocal-bridge-dashboard', ThingsLocalDashboard);
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'thingslocal-bridge-dashboard')) window.customCards.push({
  type: 'thingslocal-bridge-dashboard', name: 'ThingsLocal Dashboard',
  description: 'Local appliance dashboard · Polski / English', preview: false,
});

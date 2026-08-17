class VesaciRampController extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._controller = null; this._profileId = null; this._draft = null;
    this._draftKey = null; this._editing = false; this._curveDirection = "up";
    this._dragIndex = null; this._dragged = false;
    this._tab = "overview"; this._dataController = null;
    this._quickDraft = []; this._dailyDraft = {enabled:false,points:[]};
    this._interactionActive = false;
    this.shadowRoot.addEventListener("focusin",e=>{if(e.target.matches?.("input,select,textarea"))this._interactionActive=true;});
    this.shadowRoot.addEventListener("focusout",()=>setTimeout(()=>{if(!this.shadowRoot.activeElement?.matches?.("input,select,textarea")){this._interactionActive=false;if(!this._editing)this.render();}},150));
  }

  setConfig(config) { this.config = config || {}; this.render(); }
  set panel(value) { this._panel = value; }
  set hass(value) { this._hass = value; if (!this._editing && !this._interactionActive) this.render(); }
  getCardSize() { return 10; }

  controllers() {
    if (!this._hass) return [];
    return Object.entries(this._hass.states)
      .filter(([, s]) => s.attributes?.controller_id && Array.isArray(s.attributes.profiles))
      .map(([entity, state]) => ({ entity, state }))
      .filter((item, i, all) => all.findIndex(x => x.state.attributes.controller_id === item.state.attributes.controller_id) === i);
  }

  current() {
    const all = this.controllers(), id = this._controller || this.config?.controller_id;
    return all.find(x => x.state.attributes.controller_id === id) || all[0];
  }

  profile(item) {
    const profiles = item?.state.attributes.profiles || [];
    const id = this._profileId || item.state.attributes.selected_profile || profiles[0]?.id;
    if (this._draft && this._draft.id === id && !profiles.some(p => p.id === id)) return this._draft;
    const stored = profiles.find(p => p.id === id) || profiles[0];
    if (!stored) return null;
    const key = `${item.state.attributes.controller_id}:${stored.id}`;
    if (this._draftKey !== key) {
      const legacyTarget = Number(stored.target ?? 100), legacyDuration = Number(stored.duration ?? 60);
      const legacyCurve = stored.curve || "linear", legacyPoints = stored.points || [[0, 0], [1, 1]];
      this._draftKey = key; this._draft = JSON.parse(JSON.stringify(stored));
      Object.assign(this._draft, {
        lower_target: Number(stored.lower_target ?? 0), upper_target: Number(stored.upper_target ?? legacyTarget),
        up_duration: Number(stored.up_duration ?? legacyDuration), down_duration: Number(stored.down_duration ?? legacyDuration),
        up_curve: stored.up_curve || legacyCurve, down_curve: stored.down_curve || legacyCurve,
        up_points: this.normalizePoints(stored.up_points || legacyPoints), down_points: this.normalizePoints(stored.down_points || legacyPoints),
        step_mode: stored.step_mode || "count", steps: Number(stored.steps || 20), interval: Number(stored.interval || 5),
        schedule_enabled: Boolean(stored.schedule_enabled), up_time: stored.up_time || "19:20", down_time: stored.down_time || "23:10",
      });
      this._editing = false;
    }
    return this._draft;
  }

  normalizePoints(points) {
    const clean = (points || []).map(([x, y]) => [this.clamp(Number(x)), this.clamp(Number(y))])
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).sort((a, b) => a[0] - b[0]);
    const unique = [];
    for (const point of clean) {
      if (unique.length && Math.abs(unique[unique.length - 1][0] - point[0]) < 0.002) unique[unique.length - 1] = point;
      else unique.push(point);
    }
    if (!unique.length || unique[0][0] > 0.001) unique.unshift([0, 0]); else unique[0] = [0, 0];
    if (unique[unique.length - 1][0] < 0.999) unique.push([1, 1]); else unique[unique.length - 1] = [1, 1];
    return unique;
  }

  curveValue(p, curve, points) {
    if (curve === "ease_in") return p * p;
    if (curve === "ease_out") return 1 - (1 - p) ** 2;
    if (curve === "s_curve") return p * p * (3 - 2 * p);
    if (curve === "step") return p < 1 ? 0 : 1;
    if (curve === "custom") {
      const list = this.normalizePoints(points);
      for (let i = 1; i < list.length; i++) if (p <= list[i][0]) {
        const [x1, y1] = list[i - 1], [x2, y2] = list[i];
        return y1 + (y2 - y1) * ((p - x1) / Math.max(0.000001, x2 - x1));
      }
    }
    return p;
  }

  graphPoints(profile) {
    const d = this._curveDirection, curve = profile[`${d}_curve`], controls = profile[`${d}_points`];
    const samples = curve === "custom" ? this.normalizePoints(controls) : Array.from({ length: 61 }, (_, i) => {
      const x = i / 60; return [x, this.curveValue(x, curve, controls)];
    });
    return samples.map(([x, y]) => [x, d === "down" ? 1 - y : y]);
  }

  async call(service, data = {}) {
    const item = this.current(); if (!item) return;
    await this._hass.callService("vesaci_ramp_controller", service, { controller_id: item.state.attributes.controller_id, ...data });
  }

  render() {
    if (!this.shadowRoot || !this._hass) return;
    const all = this.controllers(), item = this.current();
    if (!item) { this.shadowRoot.innerHTML = `<ha-card><div class="empty">Add a Vesaci Ramp Controller integration first.</div></ha-card>`; return; }
    const profile = this.profile(item), attrs = item.state.attributes, direction = this._curveDirection;
    if(this._dataController!==attrs.controller_id){this._dataController=attrs.controller_id;this._quickDraft=JSON.parse(JSON.stringify(attrs.quick_actions||[]));this._dailyDraft=JSON.parse(JSON.stringify(attrs.daily_plan||{enabled:false,points:[]}));}
    const curveKey = `${direction}_curve`, pointKey = `${direction}_points`;
    const rendered = this.graphPoints(profile), polyline = rendered.map(([x, y]) => `${55 + x * 510},${210 - y * 165}`).join(" ");
    const controlPoints = profile[curveKey] === "custom" ? this.normalizePoints(profile[pointKey]) : [];
    const controllerOptions = all.map(x => `<option value="${x.state.attributes.controller_id}" ${x === item ? "selected" : ""}>${this.esc(x.state.attributes.target_entity)}</option>`).join("");
    const listedProfiles = attrs.profiles.some(p => p.id === profile.id) ? attrs.profiles : [...attrs.profiles, profile];
    const profileOptions = listedProfiles.map(p => `<option value="${p.id}" ${p.id === profile.id ? "selected" : ""}>${this.esc(p.name)}</option>`).join("");
    const options = (values, selected) => values.map(x => `<option value="${x}" ${x === selected ? "selected" : ""}>${x.replaceAll("_", " ")}</option>`).join("");
    const quickRows=this._quickDraft.map((q,i)=>`<div class="quick-row"><input data-q="minutes" data-i="${i}" type="number" min="0.1" value="${q.minutes}"><input data-q="target" data-i="${i}" type="number" value="${q.target}"><button class="stop" data-del-q="${i}">×</button></div>`).join("");
    const dailyPoints=[...(this._dailyDraft.points||[])].sort((a,b)=>a.time.localeCompare(b.time));
    this._dailyDraft.points=dailyPoints;
    const dailyRows=dailyPoints.map((p,i)=>`<div class="daily-row"><input data-d="time" data-i="${i}" value="${p.time}" maxlength="5"><input data-d="target" data-i="${i}" type="number" value="${p.target}"><select data-d="transition" data-i="${i}">${options(["duration","continuous"],p.transition||"duration")}</select><input data-d="duration" data-i="${i}" type="number" min="1" value="${p.duration||30}"><select data-d="curve" data-i="${i}">${options(["linear","ease_in","ease_out","s_curve"],p.curve||"linear")}</select><button class="stop" data-del-d="${i}">×</button></div>`).join("");
    const rangeMin=Number(profile.lower_target),rangeMax=Number(profile.upper_target),rangeSpan=Math.max(1,rangeMax-rangeMin);
    const dayPolyline=dailyPoints.map(p=>{const [h,m]=p.time.split(":").map(Number),x=45+((h*60+m)/1440)*510,y=205-((Number(p.target)-rangeMin)/rangeSpan)*155;return`${x},${Math.max(50,Math.min(205,y))}`;}).join(" ");
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;font-family:var(--paper-font-body1_-_font-family,Arial);color:var(--primary-text-color)}ha-card{padding:20px;max-width:1050px;margin:auto}
        .header,.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.header{justify-content:space-between;margin-bottom:14px}.title{font-size:22px;font-weight:650}.meta,.hint{color:var(--secondary-text-color);font-size:12px}
        .section{border:1px solid var(--divider-color);border-radius:12px;padding:16px;margin-top:14px;background:color-mix(in srgb,var(--card-background-color) 94%,var(--primary-color) 6%)}
        .section-title{font-size:13px;font-weight:650;margin-bottom:12px;color:var(--primary-color);text-transform:uppercase;letter-spacing:.04em}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;align-items:end}.wide{grid-column:span 2}.directions{display:grid;grid-template-columns:1fr 1fr;gap:14px}.direction{border:1px solid var(--divider-color);border-radius:10px;padding:14px}.direction h3{margin:0 0 12px;color:var(--primary-color)}
        .tabs{display:flex;gap:6px;overflow:auto;padding:4px 0 8px}.tab{background:transparent;color:var(--secondary-text-color);white-space:nowrap}.tab.active{background:var(--primary-color);color:var(--text-primary-color)}.page{display:none}.page.active{display:block}.quick-head,.quick-row{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center}.daily-head,.daily-row{display:grid;grid-template-columns:.7fr .8fr 1fr .7fr 1fr auto;gap:8px;align-items:center}.quick-head,.daily-head{font-size:11px;color:var(--secondary-text-color);margin-bottom:6px}.overview-values{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.overview-value{border:1px solid var(--divider-color);border-radius:9px;padding:12px}.overview-value strong{display:block;font-size:20px;margin-top:4px}.log{font-family:monospace;font-size:12px;padding:7px;border-bottom:1px solid var(--divider-color)}
        select,input{box-sizing:border-box;width:100%;background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:8px;padding:10px}input[type=checkbox]{width:auto;transform:scale(1.25);margin:10px}.check{flex-direction:row;align-items:center}
        button{border:0;border-radius:8px;padding:10px 16px;background:var(--primary-color);color:var(--text-primary-color);cursor:pointer;font-weight:600}button.down{background:#59636e}button.stop{background:var(--error-color)}button.save{margin-top:16px}
        svg{width:100%;height:255px;background:var(--secondary-background-color);border-radius:10px;touch-action:none;user-select:none}.axis,.gridline{stroke:var(--divider-color);stroke-width:1}.gridline{stroke-dasharray:4 5}.curve{fill:none;stroke:var(--primary-color);stroke-width:4}.point{fill:var(--primary-color);stroke:white;stroke-width:2;cursor:grab}.axis-label{fill:var(--secondary-text-color);font-size:11px}
        label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--secondary-text-color)}.hint{margin-top:8px}.message{margin-left:12px;font-size:13px}.empty{padding:24px}@media(max-width:750px){ha-card{padding:12px}.wide{grid-column:span 1}.actions button{flex:1}.section{padding:12px}.directions{grid-template-columns:1fr}.quick-head,.daily-head{display:none}.quick-row,.daily-row{grid-template-columns:1fr 1fr;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--divider-color)}}
      </style><ha-card>
        <div class="header"><div><div class="title">Vesaci Ramp Controller</div><div class="meta">${this.esc(attrs.target_entity)} · ${this.esc(item.state.state)}</div></div><label>Controller<select id="controller">${controllerOptions}</select></label></div>
        <div class="tabs">${["overview","profiles","quick","daily","settings"].map(tab=>`<button class="tab ${this._tab===tab?"active":""}" data-tab="${tab}">${tab.replace("quick","Quick Actions").replace("daily","Daily Plan")}</button>`).join("")}</div>
        <div class="page ${this._tab==="overview"?"active":""}"><div class="section"><div class="section-title">Current activity</div><div class="overview-values"><div class="overview-value">Current<strong>${this.esc(attrs.current_value??"—")}</strong></div><div class="overview-value">Target<strong>${this.esc(attrs.target_value??"—")}</strong></div><div class="overview-value">Source<strong>${this.esc(attrs.source??"idle")}</strong></div><div class="overview-value">Action<strong>${this.esc(attrs.action??"—")}</strong></div><div class="overview-value">Progress<strong>${Number(attrs.progress||0).toFixed(1)}%</strong></div><div class="overview-value">Remaining<strong>${Number(attrs.remaining||0).toFixed(0)} s</strong></div></div></div><div class="section"><div class="section-title">Arbiter activity</div>${(attrs.activity_log||[]).slice(0,8).map(log=>`<div class="log">${this.esc(log.event)} · ${this.esc(log.source)} · ${this.esc(log.action)} · ${this.esc(log.detail)}</div>`).join("")||`<div class="hint">No activity yet.</div>`}</div></div>
        <div class="page ${this._tab==="profiles"?"active":""}">
        <div class="section"><div class="section-title">Control</div><div class="actions"><select id="profile" style="width:auto">${profileOptions}</select><button id="new_profile">＋ New profile</button><button id="up">▲ UP</button><button class="down" id="down">▼ DOWN</button><button id="pause">Ⅱ Pause</button><button id="resume">▶ Resume</button><button class="stop" id="stop">■ Stop</button></div></div>
        <div class="section"><div class="section-title">${direction.toUpperCase()} curve preview</div><svg id="graph" viewBox="0 0 600 240"><line class="axis" x1="55" y1="210" x2="565" y2="210"/><line class="axis" x1="55" y1="45" x2="55" y2="210"/><line class="gridline" x1="55" y1="127.5" x2="565" y2="127.5"/><text class="axis-label" x="52" y="230">0%</text><text class="axis-label" x="530" y="230">100% time</text><polyline class="curve" points="${polyline}"/>${controlPoints.map(([x,y],i)=>{const dy=direction==="down"?1-y:y;return `<circle class="point" data-index="${i}" cx="${55+x*510}" cy="${210-dy*165}" r="7"/>`;}).join("")}</svg><div class="hint">For Custom curves: click empty space to add, click an interior point to delete, or drag a point to move it.</div></div>
        <div class="section"><div class="section-title">Profile</div><div class="grid"><label class="wide">Name<input id="name" value="${this.esc(profile.name)}"></label><label class="check"><input id="schedule_enabled" type="checkbox" ${profile.schedule_enabled?"checked":""}>Enable daily schedule</label></div></div>
        <div class="section"><div class="section-title">UP and DOWN settings</div><div class="directions">
          <div class="direction"><h3>▲ UP</h3><div class="grid"><label>Upper target<input id="upper_target" type="number" value="${profile.upper_target}"></label><label>Duration (s)<input id="up_duration" type="number" min="0.1" value="${profile.up_duration}"></label><label>Curve<select id="up_curve">${options(["linear","ease_in","ease_out","s_curve","step","custom"],profile.up_curve)}</select></label><label>Start every day at (HH:MM)<input id="up_time" type="text" inputmode="numeric" maxlength="5" placeholder="19:20" value="${profile.up_time}"></label></div><button id="edit_up" style="margin-top:12px">Edit UP graph</button></div>
          <div class="direction"><h3>▼ DOWN</h3><div class="grid"><label>Lower target<input id="lower_target" type="number" value="${profile.lower_target}"></label><label>Duration (s)<input id="down_duration" type="number" min="0.1" value="${profile.down_duration}"></label><label>Curve<select id="down_curve">${options(["linear","ease_in","ease_out","s_curve","step","custom"],profile.down_curve)}</select></label><label>Start every day at (HH:MM)<input id="down_time" type="text" inputmode="numeric" maxlength="5" placeholder="23:10" value="${profile.down_time}"></label></div><button class="down" id="edit_down" style="margin-top:12px">Edit DOWN graph</button></div>
        </div><div class="hint">Schedule times use the Home Assistant time zone.</div></div>
        <div class="section"><div class="section-title">Update frequency</div><div class="grid"><label>Control by<select id="step_mode">${options(["count","interval"],profile.step_mode)}</select></label><label id="steps_field" style="display:${profile.step_mode==="count"?"flex":"none"}">Number of steps<input id="steps" type="number" min="1" value="${profile.steps}"></label><label id="interval_field" style="display:${profile.step_mode==="interval"?"flex":"none"}">Interval (seconds)<input id="interval" type="number" min="1" value="${profile.interval}"></label></div></div>
        <button class="save" id="save">Save profile</button><span class="message" id="message"></span></div>
        <div class="page ${this._tab==="quick"?"active":""}"><div class="section"><div class="section-title">Quick Action options</div><div class="hint">Each row contributes a selectable time and target to the Quick Action card. Times and targets can be combined freely.</div><div class="quick-head"><span>Minutes</span><span>Target</span><span></span></div>${quickRows}<div class="actions" style="margin-top:12px"><button id="add_quick">＋ Add option</button><button id="save_quick">Save options</button><span id="quick_message"></span></div></div></div>
        <div class="page ${this._tab==="daily"?"active":""}"><div class="section"><div class="section-title">Daily Plan</div><label class="check"><input id="daily_enabled" type="checkbox" ${this._dailyDraft.enabled?"checked":""}>Enable Daily Plan (disables profile schedules)</label><svg viewBox="0 0 600 240"><line class="axis" x1="45" y1="205" x2="555" y2="205"/><line class="axis" x1="45" y1="50" x2="45" y2="205"/><polyline class="curve" points="${dayPolyline}"/>${dailyPoints.map(p=>{const[h,m]=p.time.split(":").map(Number),x=45+((h*60+m)/1440)*510,y=205-((Number(p.target)-rangeMin)/rangeSpan)*155;return`<circle class="point" cx="${x}" cy="${Math.max(50,Math.min(205,y))}" r="6"/>`;}).join("")}<text class="axis-label" x="43" y="225">00:00</text><text class="axis-label" x="520" y="225">24:00</text></svg><div class="daily-head"><span>Deadline</span><span>Target</span><span>Transition</span><span>Minutes</span><span>Curve</span><span></span></div>${dailyRows}<div class="actions" style="margin-top:12px"><button id="add_daily">＋ Add point</button><button id="save_daily">Save Daily Plan</button><span id="daily_message"></span></div></div></div>
        <div class="page ${this._tab==="settings"?"active":""}"><div class="section"><div class="section-title">Conflict policy</div><div class="overview-values"><div class="overview-value">Stop<strong>100</strong></div><div class="overview-value">Manual<strong>80</strong></div><div class="overview-value">Quick Action<strong>70</strong></div><div class="overview-value">HA automation<strong>60</strong></div><div class="overview-value">Daily Plan<strong>40</strong></div><div class="overview-value">Profile schedule<strong>30</strong></div></div><p class="hint">Only one ramp can run. Lower-priority requests are ignored while a higher-priority action is active. Daily Plan and profile schedules cannot run together.</p></div></div>
      </ha-card>`;
    this.bind(profile, controlPoints);
  }

  bind(profile, controlPoints) {
    const $ = id => this.shadowRoot.getElementById(id), direction = this._curveDirection;
    const pointKey = `${direction}_points`, curveKey = `${direction}_curve`;
    this.shadowRoot.querySelectorAll("[data-tab]").forEach(button=>button.onclick=()=>{this._tab=button.dataset.tab;this.render();});
    const readFields = () => {
      profile.name=$("name").value;profile.lower_target=Number($("lower_target").value);profile.upper_target=Number($("upper_target").value);
      profile.up_duration=Number($("up_duration").value);profile.down_duration=Number($("down_duration").value);profile.up_curve=$("up_curve").value;profile.down_curve=$("down_curve").value;
      profile.step_mode=$("step_mode").value;profile.steps=Number($("steps").value);profile.interval=Number($("interval").value);
      profile.schedule_enabled=$("schedule_enabled").checked;profile.up_time=$("up_time").value;profile.down_time=$("down_time").value;this._editing=true;
    };
    $("controller").onchange=e=>{this._controller=e.target.value;this._profileId=null;this._draftKey=null;this._editing=false;this.render();};
    $("profile").onchange=e=>{this._profileId=e.target.value;this._draftKey=null;this._editing=false;this.render();};
    $("new_profile").onclick=()=>{readFields();const copy=JSON.parse(JSON.stringify(profile));copy.id=`profile_${Date.now()}`;copy.name="New profile";copy.schedule_enabled=false;this._profileId=copy.id;this._draft=copy;this._draftKey=`${this.current().state.attributes.controller_id}:${copy.id}`;this._editing=true;this.render();};
    $("up").onclick=()=>this.call("start_profile",{profile:profile.id,direction:"up",source:"manual"});$("down").onclick=()=>this.call("start_profile",{profile:profile.id,direction:"down",source:"manual"});
    $("pause").onclick=()=>this.call("pause");$("resume").onclick=()=>this.call("resume");$("stop").onclick=()=>this.call("stop");
    $("edit_up").onclick=()=>{readFields();this._curveDirection="up";this.render();};$("edit_down").onclick=()=>{readFields();this._curveDirection="down";this.render();};
    $("up_curve").onchange=()=>{readFields();if(profile.up_curve==="custom")profile.up_points=this.normalizePoints(profile.up_points);this._curveDirection="up";this.render();};$("down_curve").onchange=()=>{readFields();if(profile.down_curve==="custom")profile.down_points=this.normalizePoints(profile.down_points);this._curveDirection="down";this.render();};
    ["name","lower_target","upper_target","up_duration","down_duration","step_mode","steps","interval","schedule_enabled","up_time","down_time"].forEach(id=>{$(id).oninput=readFields;$(id).onchange=readFields;});
    $("step_mode").onchange=()=>{readFields();this.render();};
    const graph=$("graph"),position=e=>{const point=graph.createSVGPoint();point.x=e.clientX;point.y=e.clientY;const svgPoint=point.matrixTransform(graph.getScreenCTM().inverse());const x=this.clamp((svgPoint.x-55)/510);const displayY=this.clamp((210-svgPoint.y)/165);return[x,direction==="down"?1-displayY:displayY];};
    graph.onpointerdown=e=>{if(!e.target.classList.contains("point"))return;const i=Number(e.target.dataset.index);if(i===0||i===controlPoints.length-1)return;this._dragIndex=i;this._dragNode=e.target;this._dragged=false;graph.setPointerCapture(e.pointerId);};
    graph.onpointermove=e=>{if(this._dragIndex===null)return;const[x,y]=position(e),list=this.normalizePoints(profile[pointKey]);const min=list[this._dragIndex-1][0]+.005,max=list[this._dragIndex+1][0]-.005;list[this._dragIndex]=[Math.max(min,Math.min(max,x)),y];profile[pointKey]=list;this._dragged=true;this._editing=true;const dy=direction==="down"?1-list[this._dragIndex][1]:list[this._dragIndex][1];this._dragNode?.setAttribute("cx",55+list[this._dragIndex][0]*510);this._dragNode?.setAttribute("cy",210-dy*165);graph.querySelector(".curve").setAttribute("points",this.graphPoints(profile).map(([gx,gy])=>`${55+gx*510},${210-gy*165}`).join(" "));};
    graph.onpointerup=()=>{this._dragIndex=null;this._dragNode=null;};
    graph.onclick=e=>{if(this._dragged){this._dragged=false;return;}if(e.target.classList.contains("point")){const i=Number(e.target.dataset.index);if(i>0&&i<controlPoints.length-1){profile[pointKey]=controlPoints.filter((_,j)=>j!==i);this._editing=true;this.render();}return;}if(profile[curveKey]!=="custom")return;const[x,y]=position(e);profile[pointKey]=this.normalizePoints([...(profile[pointKey]||[]),[x,y]]);this._editing=true;this.render();};
    this.shadowRoot.querySelectorAll(".point").forEach(node=>node.oncontextmenu=e=>{e.preventDefault();const i=Number(node.dataset.index);if(i>0&&i<controlPoints.length-1){profile[pointKey]=controlPoints.filter((_,j)=>j!==i);this._editing=true;this.render();}});
    $("save").onclick=async()=>{readFields();const message=$("message"),validTime=/^(?:[01]\d|2[0-3]):[0-5]\d$/;if(profile.lower_target>=profile.upper_target){message.textContent="Lower target must be below upper target.";return;}if(!validTime.test(profile.up_time)||!validTime.test(profile.down_time)){message.textContent="Enter both times in 24-hour HH:MM format.";return;}profile.up_points=this.normalizePoints(profile.up_points);profile.down_points=this.normalizePoints(profile.down_points);message.textContent="Saving…";await this.call("save_profile",{profile:JSON.stringify(profile)});this._editing=false;message.textContent="Saved";};
    this.shadowRoot.querySelectorAll("[data-q]").forEach(field=>{field.oninput=()=>{const item=this._quickDraft[Number(field.dataset.i)];item[field.dataset.q]=["minutes","target"].includes(field.dataset.q)?Number(field.value):field.value;this._editing=true;};});
    this.shadowRoot.querySelectorAll("[data-del-q]").forEach(button=>button.onclick=()=>{this._quickDraft.splice(Number(button.dataset.delQ),1);this._editing=true;this.render();});
    $("add_quick").onclick=()=>{this._quickDraft.push({id:`quick_${Date.now()}`,name:"Option",minutes:10,target:profile.upper_target,curve:"s_curve"});this._editing=true;this.render();};
    $("save_quick").onclick=async()=>{const message=$("quick_message");if(this._quickDraft.some(q=>q.minutes<=0)){message.textContent="Positive minutes are required.";return;}message.textContent="Saving…";await this.call("save_quick_actions",{actions:JSON.stringify(this._quickDraft)});this._editing=false;message.textContent="Saved";};
    this.shadowRoot.querySelectorAll("[data-d]").forEach(field=>{const update=()=>{const point=this._dailyDraft.points[Number(field.dataset.i)];point[field.dataset.d]=["target","duration"].includes(field.dataset.d)?Number(field.value):field.value;this._editing=true;};field.oninput=update;field.onchange=()=>{update();this.render();};});
    this.shadowRoot.querySelectorAll("[data-del-d]").forEach(button=>button.onclick=()=>{this._dailyDraft.points.splice(Number(button.dataset.delD),1);this._editing=true;this.render();});
    $("daily_enabled").onchange=()=>{this._dailyDraft.enabled=$("daily_enabled").checked;this._editing=true;};
    $("add_daily").onclick=()=>{this._dailyDraft.points.push({id:`point_${Date.now()}`,time:"12:00",target:profile.upper_target,transition:"duration",duration:30,curve:"linear",steps:20});this._editing=true;this.render();};
    $("save_daily").onclick=async()=>{const message=$("daily_message"),validTime=/^(?:[01]\d|2[0-3]):[0-5]\d$/,times=this._dailyDraft.points.map(p=>p.time);if(this._dailyDraft.points.some(p=>!validTime.test(p.time)||p.duration<=0)||new Set(times).size!==times.length){message.textContent="Use unique HH:MM times and positive durations.";return;}message.textContent="Saving…";await this.call("save_daily_plan",{plan:JSON.stringify(this._dailyDraft)});this._editing=false;message.textContent="Saved";};
  }

  clamp(value){return Math.max(0,Math.min(1,value));}
  esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
}

customElements.define("vesaci-ramp-controller-panel",VesaciRampController);
customElements.define("vesaci-ramp-controller-card",class extends VesaciRampController{});

class VesaciRampCompactCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this._controller=null;this._profileId=null;this._interactionActive=false;this.shadowRoot.addEventListener("focusin",e=>{if(e.target.matches?.("input,select,textarea"))this._interactionActive=true;});this.shadowRoot.addEventListener("focusout",()=>setTimeout(()=>{if(!this.shadowRoot.activeElement?.matches?.("input,select,textarea")){this._interactionActive=false;this.render();}},150));}
  setConfig(config){this.config=config||{};this.render();}
  set hass(value){this._hass=value;if(!this._interactionActive)this.render();}
  getCardSize(){return 3;}
  controllers(){if(!this._hass)return[];return Object.entries(this._hass.states).filter(([,s])=>s.attributes?.controller_id&&Array.isArray(s.attributes.profiles)).map(([entity,state])=>({entity,state}));}
  current(){const all=this.controllers(),id=this._controller||this.config?.controller_id;return all.find(x=>x.state.attributes.controller_id===id)||all[0];}
  call(service,data={}){const item=this.current();if(item)this._hass.callService("vesaci_ramp_controller",service,{controller_id:item.state.attributes.controller_id,...data});}
  esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
  render(){if(!this.shadowRoot||!this._hass)return;const all=this.controllers(),item=this.current();if(!item){this.shadowRoot.innerHTML=`<ha-card><div style="padding:20px">No Ramp Controller found.</div></ha-card>`;return;}const a=item.state.attributes,profiles=a.profiles||[],selected=this._profileId||a.selected_profile||profiles[0]?.id,selectedProfile=profiles.find(p=>p.id===selected)||profiles[0]||{},progress=Number(a.progress||0),current=this._hass.states[a.target_entity]?.state??a.current_value??"—",action=`${(a.action||"—").toUpperCase()} · ${String(item.state.state).toUpperCase()}`,minimum=selectedProfile.lower_target??selectedProfile.target??"—",maximum=selectedProfile.upper_target??selectedProfile.target??"—";this.shadowRoot.innerHTML=`<style>:host{display:block}ha-card{padding:16px}.head,.values{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.head{justify-content:space-between}.title{font-size:18px;font-weight:650}.values{margin:14px 0}.value{flex:1;min-width:100px;padding:10px;border:1px solid var(--divider-color);border-radius:9px}.label{font-size:11px;color:var(--secondary-text-color)}.big{font-size:20px;margin-top:3px}.range{font-size:12px;color:var(--secondary-text-color);margin:8px 0}.bar{height:9px;background:var(--divider-color);border-radius:9px;overflow:hidden;margin:10px 0 14px}.fill{height:100%;width:${Math.max(0,Math.min(100,progress))}%;background:var(--primary-color)}select{background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:8px;padding:9px}.buttons{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.buttons button{width:100%;min-width:0;border:0;border-radius:8px;padding:11px 4px;background:var(--primary-color);color:var(--text-primary-color);font-weight:600}button.down{background:#59636e}button.stop{background:var(--error-color)}</style><ha-card><div class="head"><div class="title">Ramp Controller</div>${all.length>1?`<select id="controller">${all.map(x=>`<option value="${x.state.attributes.controller_id}" ${x===item?"selected":""}>${this.esc(x.state.attributes.target_entity)}</option>`).join("")}</select>`:""}</div><select id="mode" style="margin-top:12px">${profiles.map(p=>`<option value="${p.id}" ${p.id===selected?"selected":""}>${this.esc(p.name)}</option>`).join("")}</select><div class="range">Min: ${this.esc(minimum)} · Max: ${this.esc(maximum)}</div><div class="values"><div class="value"><div class="label">Current value</div><div class="big">${this.esc(current)}</div></div><div class="value"><div class="label">Action</div><div class="big">${this.esc(action)}</div></div><div class="value"><div class="label">Progress</div><div class="big">${progress.toFixed(1)}%</div></div></div><div class="bar"><div class="fill"></div></div><div class="buttons"><button id="up">▲ UP</button><button class="down" id="down">▼ DOWN</button><button id="pause">Ⅱ</button><button id="resume">▶</button><button class="stop" id="stop">■</button></div></ha-card>`;const $=id=>this.shadowRoot.getElementById(id);if($("controller"))$("controller").onchange=e=>{this._controller=e.target.value;this._profileId=null;this.render();};$("mode").onchange=e=>{this._profileId=e.target.value;this.call("select_profile",{profile:e.target.value});this.render();};$("up").onclick=()=>this.call("start_profile",{profile:$("mode").value,direction:"up"});$("down").onclick=()=>this.call("start_profile",{profile:$("mode").value,direction:"down"});$("pause").onclick=()=>this.call("pause");$("resume").onclick=()=>this.call("resume");$("stop").onclick=()=>this.call("stop");}
}
customElements.define("vesaci-ramp-controller-compact-card",VesaciRampCompactCard);

class VesaciRampQuickActionsCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:"open"});this._controller=null;this._minutes=null;this._target=null;this._interactionActive=false;this.shadowRoot.addEventListener("focusin",e=>{if(e.target.matches?.("select,input"))this._interactionActive=true;});this.shadowRoot.addEventListener("focusout",()=>setTimeout(()=>{if(!this.shadowRoot.activeElement?.matches?.("select,input")){this._interactionActive=false;this.render();}},150));}
  setConfig(config){this.config=config||{};this.render();}
  set hass(value){this._hass=value;if(!this._interactionActive)this.render();}
  getCardSize(){return 3;}
  controllers(){if(!this._hass)return[];return Object.values(this._hass.states).filter(s=>s.attributes?.controller_id&&Array.isArray(s.attributes.quick_actions));}
  current(){const all=this.controllers(),id=this._controller||this.config?.controller_id;return all.find(s=>s.attributes.controller_id===id)||all[0];}
  run(){const state=this.current();if(state)this._hass.callService("vesaci_ramp_controller","start_quick",{controller_id:state.attributes.controller_id,minutes:Number(this._minutes),target:Number(this._target)});}
  esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
  render(){if(!this.shadowRoot||!this._hass)return;const state=this.current();if(!state){this.shadowRoot.innerHTML=`<ha-card><div style="padding:16px">No Ramp Controller found.</div></ha-card>`;return;}const actions=state.attributes.quick_actions||[],minutes=[...new Set(actions.map(q=>Number(q.minutes)))].sort((a,b)=>a-b),targets=[...new Set(actions.map(q=>Number(q.target)))].sort((a,b)=>a-b);this._minutes=minutes.includes(Number(this._minutes))?Number(this._minutes):(minutes[0]??5);this._target=targets.includes(Number(this._target))?Number(this._target):(targets[0]??0);this.shadowRoot.innerHTML=`<style>ha-card{padding:16px}.title{font-size:18px;font-weight:650;margin-bottom:12px}.form{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}label{display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--secondary-text-color)}select{background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:8px;padding:10px}button{border:0;border-radius:8px;padding:11px 20px;background:var(--primary-color);color:var(--text-primary-color);font-weight:650}@media(max-width:500px){.form{grid-template-columns:1fr 1fr}.form button{grid-column:span 2}}</style><ha-card><div class="title">Quick Action</div><div class="form"><label>Time<select id="quick_minutes">${minutes.map(value=>`<option value="${value}" ${value===this._minutes?"selected":""}>${value} min</option>`).join("")}</select></label><label>Target<select id="quick_target">${targets.map(value=>`<option value="${value}" ${value===this._target?"selected":""}>${this.esc(value)}</option>`).join("")}</select></label><button id="quick_start">▶ Start</button></div></ha-card>`;const minutesSelect=this.shadowRoot.getElementById("quick_minutes"),targetSelect=this.shadowRoot.getElementById("quick_target");minutesSelect.onchange=()=>{this._minutes=Number(minutesSelect.value);};targetSelect.onchange=()=>{this._target=Number(targetSelect.value);};this.shadowRoot.getElementById("quick_start").onclick=()=>this.run();}
}
customElements.define("vesaci-ramp-controller-quick-actions-card",VesaciRampQuickActionsCard);
window.customCards=window.customCards||[];
window.customCards.push({type:"vesaci-ramp-controller-card",name:"Vesaci Ramp Controller",description:"Visual ramp profile editor and controller"});
window.customCards.push({type:"vesaci-ramp-controller-compact-card",name:"Vesaci Ramp Controller Compact",description:"Compact controls, current value, action and progress"});
window.customCards.push({type:"vesaci-ramp-controller-quick-actions-card",name:"Vesaci Ramp Quick Action",description:"Select duration and target, then start"});

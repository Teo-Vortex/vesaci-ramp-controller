class VesaciRampController extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._controller = null; this._profileId = null; this._draft = null;
    this._draftKey = null; this._editing = false; this._curveDirection = "up";
    this._dragIndex = null; this._dragged = false;
  }

  setConfig(config) { this.config = config || {}; this.render(); }
  set panel(value) { this._panel = value; }
  set hass(value) { this._hass = value; if (!this._editing) this.render(); }
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
    const curveKey = `${direction}_curve`, pointKey = `${direction}_points`;
    const rendered = this.graphPoints(profile), polyline = rendered.map(([x, y]) => `${55 + x * 510},${210 - y * 165}`).join(" ");
    const controlPoints = profile[curveKey] === "custom" ? this.normalizePoints(profile[pointKey]) : [];
    const controllerOptions = all.map(x => `<option value="${x.state.attributes.controller_id}" ${x === item ? "selected" : ""}>${this.esc(x.state.attributes.target_entity)}</option>`).join("");
    const profileOptions = attrs.profiles.map(p => `<option value="${p.id}" ${p.id === profile.id ? "selected" : ""}>${this.esc(p.name)}</option>`).join("");
    const options = (values, selected) => values.map(x => `<option value="${x}" ${x === selected ? "selected" : ""}>${x.replaceAll("_", " ")}</option>`).join("");
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;font-family:var(--paper-font-body1_-_font-family,Arial);color:var(--primary-text-color)}ha-card{padding:20px;max-width:1050px;margin:auto}
        .header,.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.header{justify-content:space-between;margin-bottom:14px}.title{font-size:22px;font-weight:650}.meta,.hint{color:var(--secondary-text-color);font-size:12px}
        .section{border:1px solid var(--divider-color);border-radius:12px;padding:16px;margin-top:14px;background:color-mix(in srgb,var(--card-background-color) 94%,var(--primary-color) 6%)}
        .section-title{font-size:13px;font-weight:650;margin-bottom:12px;color:var(--primary-color);text-transform:uppercase;letter-spacing:.04em}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;align-items:end}.wide{grid-column:span 2}
        select,input{box-sizing:border-box;width:100%;background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:8px;padding:10px}input[type=checkbox]{width:auto;transform:scale(1.25);margin:10px}.check{flex-direction:row;align-items:center}
        button{border:0;border-radius:8px;padding:10px 16px;background:var(--primary-color);color:var(--text-primary-color);cursor:pointer;font-weight:600}button.down{background:#59636e}button.stop{background:var(--error-color)}button.save{margin-top:16px}
        svg{width:100%;height:255px;background:var(--secondary-background-color);border-radius:10px;touch-action:none;user-select:none}.axis,.gridline{stroke:var(--divider-color);stroke-width:1}.gridline{stroke-dasharray:4 5}.curve{fill:none;stroke:var(--primary-color);stroke-width:4}.point{fill:var(--primary-color);stroke:white;stroke-width:2;cursor:grab}.axis-label{fill:var(--secondary-text-color);font-size:11px}
        label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--secondary-text-color)}.hint{margin-top:8px}.message{margin-left:12px;font-size:13px}.empty{padding:24px}@media(max-width:650px){ha-card{padding:12px}.wide{grid-column:span 1}.actions button{flex:1}.section{padding:12px}}
      </style><ha-card>
        <div class="header"><div><div class="title">Vesaci Ramp Controller</div><div class="meta">${this.esc(attrs.target_entity)} · ${this.esc(item.state.state)}</div></div><label>Controller<select id="controller">${controllerOptions}</select></label></div>
        <div class="section"><div class="section-title">Control</div><div class="actions"><select id="profile" style="width:auto">${profileOptions}</select><button id="up">▲ UP</button><button class="down" id="down">▼ DOWN</button><button id="pause">Ⅱ Pause</button><button id="resume">▶ Resume</button><button class="stop" id="stop">■ Stop</button></div></div>
        <div class="section"><div class="section-title">${direction.toUpperCase()} curve preview</div><svg id="graph" viewBox="0 0 600 240"><line class="axis" x1="55" y1="210" x2="565" y2="210"/><line class="axis" x1="55" y1="45" x2="55" y2="210"/><line class="gridline" x1="55" y1="127.5" x2="565" y2="127.5"/><text class="axis-label" x="52" y="230">0%</text><text class="axis-label" x="530" y="230">100% time</text><polyline class="curve" points="${polyline}"/>${controlPoints.map(([x,y],i)=>{const dy=direction==="down"?1-y:y;return `<circle class="point" data-index="${i}" cx="${55+x*510}" cy="${210-dy*165}" r="7"/>`;}).join("")}</svg><div class="hint">Preset curves update the preview automatically. Choose Custom to add points; drag points to edit and right-click an interior point to remove it.</div></div>
        <div class="section"><div class="section-title">Profile and targets</div><div class="grid"><label class="wide">Name<input id="name" value="${this.esc(profile.name)}"></label><label>Lower target<input id="lower_target" type="number" value="${profile.lower_target}"></label><label>Upper target<input id="upper_target" type="number" value="${profile.upper_target}"></label></div></div>
        <div class="section"><div class="section-title">Direction curves</div><div class="grid"><label>Edit direction<select id="curve_direction">${options(["up","down"],direction)}</select></label><label>${direction.toUpperCase()} curve<select id="curve">${options(["linear","ease_in","ease_out","s_curve","step","custom"],profile[curveKey])}</select></label><label>UP duration (s)<input id="up_duration" type="number" min="0.1" value="${profile.up_duration}"></label><label>DOWN duration (s)<input id="down_duration" type="number" min="0.1" value="${profile.down_duration}"></label></div></div>
        <div class="section"><div class="section-title">Update frequency</div><div class="grid"><label>Control by<select id="step_mode">${options(["count","interval"],profile.step_mode)}</select></label><label>Number of steps<input id="steps" type="number" min="1" value="${profile.steps}"></label><label>Interval (seconds)<input id="interval" type="number" min="1" value="${profile.interval}"></label></div></div>
        <div class="section"><div class="section-title">Daily schedule</div><div class="grid"><label class="check"><input id="schedule_enabled" type="checkbox" ${profile.schedule_enabled?"checked":""}>Enable schedule</label><label>Start UP at<input id="up_time" type="time" value="${profile.up_time}"></label><label>Start DOWN at<input id="down_time" type="time" value="${profile.down_time}"></label></div><div class="hint">Times use the Home Assistant time zone and run every day.</div></div>
        <button class="save" id="save">Save profile</button><span class="message" id="message"></span>
      </ha-card>`;
    this.bind(profile, controlPoints);
  }

  bind(profile, controlPoints) {
    const $ = id => this.shadowRoot.getElementById(id), direction = this._curveDirection;
    const pointKey = `${direction}_points`, curveKey = `${direction}_curve`;
    const readFields = () => {
      profile.name=$("name").value;profile.lower_target=Number($("lower_target").value);profile.upper_target=Number($("upper_target").value);
      profile.up_duration=Number($("up_duration").value);profile.down_duration=Number($("down_duration").value);profile[curveKey]=$("curve").value;
      profile.step_mode=$("step_mode").value;profile.steps=Number($("steps").value);profile.interval=Number($("interval").value);
      profile.schedule_enabled=$("schedule_enabled").checked;profile.up_time=$("up_time").value;profile.down_time=$("down_time").value;this._editing=true;
    };
    $("controller").onchange=e=>{this._controller=e.target.value;this._profileId=null;this._draftKey=null;this._editing=false;this.render();};
    $("profile").onchange=e=>{this._profileId=e.target.value;this._draftKey=null;this._editing=false;this.render();};
    $("up").onclick=()=>this.call("start_profile",{profile:profile.id,direction:"up"});$("down").onclick=()=>this.call("start_profile",{profile:profile.id,direction:"down"});
    $("pause").onclick=()=>this.call("pause");$("resume").onclick=()=>this.call("resume");$("stop").onclick=()=>this.call("stop");
    $("curve_direction").onchange=e=>{readFields();this._curveDirection=e.target.value;this.render();};
    $("curve").onchange=()=>{readFields();if(profile[curveKey]==="custom")profile[pointKey]=this.normalizePoints(profile[pointKey]);this.render();};
    ["name","lower_target","upper_target","up_duration","down_duration","step_mode","steps","interval","schedule_enabled","up_time","down_time"].forEach(id=>{$(id).oninput=readFields;$(id).onchange=readFields;});
    const graph=$("graph"),position=e=>{const rect=graph.getBoundingClientRect();const x=this.clamp(((e.clientX-rect.left)/rect.width*600-55)/510);const displayY=this.clamp((210-(e.clientY-rect.top)/rect.height*240)/165);return[x,direction==="down"?1-displayY:displayY];};
    graph.onpointerdown=e=>{if(!e.target.classList.contains("point"))return;const i=Number(e.target.dataset.index);if(i===0||i===controlPoints.length-1)return;this._dragIndex=i;this._dragNode=e.target;this._dragged=false;graph.setPointerCapture(e.pointerId);};
    graph.onpointermove=e=>{if(this._dragIndex===null)return;const[x,y]=position(e),list=this.normalizePoints(profile[pointKey]);const min=list[this._dragIndex-1][0]+.005,max=list[this._dragIndex+1][0]-.005;list[this._dragIndex]=[Math.max(min,Math.min(max,x)),y];profile[pointKey]=list;this._dragged=true;this._editing=true;const dy=direction==="down"?1-list[this._dragIndex][1]:list[this._dragIndex][1];this._dragNode?.setAttribute("cx",55+list[this._dragIndex][0]*510);this._dragNode?.setAttribute("cy",210-dy*165);graph.querySelector(".curve").setAttribute("points",this.graphPoints(profile).map(([gx,gy])=>`${55+gx*510},${210-gy*165}`).join(" "));};
    graph.onpointerup=()=>{this._dragIndex=null;this._dragNode=null;if(this._dragged)this.render();};
    graph.onclick=e=>{if(this._dragged){this._dragged=false;return;}if(e.target.classList.contains("point"))return;const[x,y]=position(e);profile[curveKey]="custom";profile[pointKey]=this.normalizePoints([...(profile[pointKey]||[]),[x,y]]);this._editing=true;this.render();};
    this.shadowRoot.querySelectorAll(".point").forEach(node=>node.oncontextmenu=e=>{e.preventDefault();const i=Number(node.dataset.index);if(i>0&&i<controlPoints.length-1){profile[pointKey]=controlPoints.filter((_,j)=>j!==i);this._editing=true;this.render();}});
    $("save").onclick=async()=>{readFields();const message=$("message");if(profile.lower_target>=profile.upper_target){message.textContent="Lower target must be below upper target.";return;}if(!profile.up_time||!profile.down_time){message.textContent="Both schedule times are required.";return;}profile.up_points=this.normalizePoints(profile.up_points);profile.down_points=this.normalizePoints(profile.down_points);message.textContent="Saving…";await this.call("save_profile",{profile:JSON.stringify(profile)});this._editing=false;message.textContent="Saved";};
  }

  clamp(value){return Math.max(0,Math.min(1,value));}
  esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
}

customElements.define("vesaci-ramp-controller-panel",VesaciRampController);
customElements.define("vesaci-ramp-controller-card",class extends VesaciRampController{});
window.customCards=window.customCards||[];
window.customCards.push({type:"vesaci-ramp-controller-card",name:"Vesaci Ramp Controller",description:"Visual ramp profile editor and controller"});

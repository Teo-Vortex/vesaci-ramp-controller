class VesaciRampController extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._controller = null;
    this._profileId = null;
  }

  setConfig(config) { this.config = config || {}; this.render(); }
  set panel(value) { this._panel = value; }
  set hass(value) { this._hass = value; this.render(); }
  getCardSize() { return 7; }

  controllers() {
    if (!this._hass) return [];
    return Object.entries(this._hass.states)
      .filter(([, s]) => s.attributes && s.attributes.controller_id && Array.isArray(s.attributes.profiles))
      .map(([entity, state]) => ({ entity, state }))
      .filter((item, i, all) => all.findIndex(x => x.state.attributes.controller_id === item.state.attributes.controller_id) === i);
  }

  current() {
    const all = this.controllers();
    const configured = this.config && this.config.controller_id;
    const id = this._controller || configured;
    return all.find(x => x.state.attributes.controller_id === id) || all[0];
  }

  profile(item) {
    const profiles = item?.state.attributes.profiles || [];
    const id = this._profileId || item.state.attributes.selected_profile || profiles[0]?.id;
    return profiles.find(p => p.id === id) || profiles[0];
  }

  async call(service, data = {}) {
    const item = this.current();
    if (!item) return;
    await this._hass.callService("vesaci_ramp_controller", service, {
      controller_id: item.state.attributes.controller_id, ...data
    });
  }

  render() {
    if (!this.shadowRoot || !this._hass) return;
    const all = this.controllers();
    const item = this.current();
    if (!item) {
      this.shadowRoot.innerHTML = `<ha-card><div class="empty">Add a Vesaci Ramp Controller integration first.</div></ha-card>`;
      return;
    }
    const profile = this.profile(item);
    const attrs = item.state.attributes;
    const points = (profile?.points || [[0, 0], [1, 1]]).map(p => [Number(p[0]), Number(p[1])]);
    const polyline = points.map(([x, y]) => `${20 + x * 560},${220 - y * 180}`).join(" ");
    const controllerOptions = all.map(x => `<option value="${x.state.attributes.controller_id}" ${x === item ? "selected" : ""}>${this.esc(x.state.attributes.target_entity)}</option>`).join("");
    const profileOptions = attrs.profiles.map(p => `<option value="${p.id}" ${p.id === profile.id ? "selected" : ""}>${this.esc(p.name)}</option>`).join("");
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;font-family:var(--paper-font-body1_-_font-family,Arial);color:var(--primary-text-color)}
        ha-card{padding:20px;max-width:900px;margin:auto}.top,.controls,.fields{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
        .top{justify-content:space-between}.title{font-size:22px;font-weight:600}.meta{color:var(--secondary-text-color);margin:8px 0 16px}
        select,input{background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:8px;padding:9px}
        button{border:0;border-radius:8px;padding:10px 15px;background:var(--primary-color);color:var(--text-primary-color);cursor:pointer}
        button.stop{background:var(--error-color)}svg{width:100%;height:240px;background:var(--secondary-background-color);border-radius:10px;margin:16px 0;touch-action:none}
        .grid{stroke:var(--divider-color);stroke-width:1}.curve{fill:none;stroke:var(--primary-color);stroke-width:4}.point{fill:var(--primary-color);stroke:white;stroke-width:2;cursor:pointer}
        label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--secondary-text-color)}.empty{padding:24px}
      </style>
      <ha-card>
        <div class="top"><div class="title">Vesaci Ramp Controller</div><select id="controller">${controllerOptions}</select></div>
        <div class="meta">${this.esc(attrs.target_entity)} · Status: ${this.esc(item.state.state)}</div>
        <div class="controls"><select id="profile">${profileOptions}</select><button id="start">▶ Start</button><button id="pause">Ⅱ Pause</button><button id="resume">▶ Resume</button><button class="stop" id="stop">■ Stop</button></div>
        <svg id="graph" viewBox="0 0 600 240">
          <line class="grid" x1="20" y1="220" x2="580" y2="220"/><line class="grid" x1="20" y1="40" x2="20" y2="220"/>
          <polyline class="curve" points="${polyline}"/>
          ${points.map(([x,y], i) => `<circle class="point" data-index="${i}" cx="${20+x*560}" cy="${220-y*180}" r="7"/>`).join("")}
        </svg>
        <div class="fields">
          <label>Name<input id="name" value="${this.esc(profile.name)}"></label>
          <label>Target<input id="target" type="number" value="${profile.target}"></label>
          <label>Duration (s)<input id="duration" type="number" min="0.1" value="${profile.duration}"></label>
          <label>Curve<select id="curve">${["linear","ease_in","ease_out","s_curve","step","custom"].map(x=>`<option ${x===profile.curve?"selected":""}>${x}</option>`).join("")}</select></label>
          <label>Steps<input id="steps" type="number" min="1" value="${profile.steps || 20}"></label>
          <button id="save">Save profile</button>
        </div>
      </ha-card>`;
    this.bind(item, profile, points);
  }

  bind(item, profile, points) {
    const $ = id => this.shadowRoot.getElementById(id);
    $("controller").onchange = e => { this._controller = e.target.value; this._profileId = null; this.render(); };
    $("profile").onchange = e => { this._profileId = e.target.value; this.render(); };
    $("start").onclick = () => this.call("start_profile", { profile: profile.id });
    $("pause").onclick = () => this.call("pause"); $("resume").onclick = () => this.call("resume"); $("stop").onclick = () => this.call("stop");
    $("graph").onclick = e => {
      if (e.target.classList.contains("point")) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, ((e.clientX-rect.left)/rect.width*600-20)/560));
      const y = Math.max(0, Math.min(1, (220-(e.clientY-rect.top)/rect.height*240)/180));
      profile.points = [...points, [Number(x.toFixed(3)), Number(y.toFixed(3))]].sort((a,b)=>a[0]-b[0]);
      profile.curve = "custom"; this.render();
    };
    this.shadowRoot.querySelectorAll(".point").forEach(node => node.oncontextmenu = e => {
      e.preventDefault(); const i = Number(node.dataset.index); if (i && i < points.length-1) { profile.points = points.filter((_,j)=>j!==i); this.render(); }
    });
    $("save").onclick = async () => {
      const updated = {...profile, name: $("name").value, target: Number($("target").value), duration: Number($("duration").value), curve: $("curve").value, steps: Number($("steps").value), points: profile.points || points};
      await this.call("save_profile", { profile: JSON.stringify(updated) });
    };
  }

  esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
}

customElements.define("vesaci-ramp-controller-panel", VesaciRampController);
customElements.define("vesaci-ramp-controller-card", class extends VesaciRampController {});
window.customCards = window.customCards || [];
window.customCards.push({type:"vesaci-ramp-controller-card",name:"Vesaci Ramp Controller",description:"Visual ramp profile editor and controller"});

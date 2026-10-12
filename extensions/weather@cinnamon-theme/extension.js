// Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
// Wetter auf dem Desktop: Regenschauer, Blätter im Wind und Schneefall in
// unregelmäßigen Abständen. Die Ebene liegt über Hintergrundbild, Desktop-Symbolen
// und Desklets, aber immer unter allen Programmfenstern.
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Main = imports.ui.main;
const Settings = imports.ui.settings;

const UUID = "weather@cinnamon-theme";
const LEAF_COLORS = [
    [0.82, 0.45, 0.14], [0.74, 0.27, 0.12], [0.88, 0.64, 0.20],
    [0.58, 0.35, 0.16], [0.64, 0.56, 0.22], [0.78, 0.36, 0.10],
];

let weather = null;

function rand(a, b) { return a + Math.random() * (b - a); }
function smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

class Weather {
    constructor() {
        this.settings = new Settings.ExtensionSettings(this, UUID);
        const resched = () => { if (!this.event) this._schedule(); };
        this.settings.bind("active", "active", () => this._onActive());
        this.settings.bind("toggle-key", "toggleKey", () => this._bindKey());
        for (let [k, p] of [["rain", "rain"], ["leaves", "leaves"], ["snow", "snow"], ["seasonal", "seasonal"],
                            ["pause-min", "pauseMin"], ["pause-max", "pauseMax"]])
            this.settings.bind(k, p, resched);
        for (let [k, p] of [["duration-min", "durMin"], ["duration-max", "durMax"], ["intensity", "intensity"],
                            ["size", "size"], ["wind", "wind"]])
            this.settings.bind(k, p);
        this.settings.bind("fps", "fps", () => { if (this.timer) { this._stopTimer(); this._startTimer(); } });
        this.settings.bind("pause-covered", "pauseCovered", () => this._checkCovered());
        this.settings.bind("show-in-rdp", "showInRdp", () => this._checkCovered());

        this.isRdp = !!GLib.getenv("XRDP_SESSION");
        this.layer = new Clutter.Actor({ reactive: false, clip_to_allocation: true, visible: false });
        this.shade = new St.Widget({ reactive: false, style: "background-color: rgb(16,20,28);", opacity: 0 });
        this.layer.add_child(this.shade);
        global.window_group.add_child(this.layer);
        this._restack();

        this.parts = [];
        this.pool = { rain: [], leaf: [], snow: [] };
        this.acc = { rain: 0, leaf: 0, snow: 0 };
        this.event = null;
        this.paused = false;
        this.shadeLevel = 0;
        this.timer = 0;
        this.checkTimer = 0;
        this.schedId = 0;
        this._later = 0;

        this._restackId = global.display.connect("restacked", () => this._queueRestack());
        this._monitorsId = Main.layoutManager.connect("monitors-changed", () => this._resize());
        this._resize();
        this._bindKey();
        this._schedule(rand(30, 90));
    }

    _bindKey() {
        Main.keybindingManager.removeHotKey(UUID + "-toggle");
        if (this.toggleKey)
            Main.keybindingManager.addHotKey(UUID + "-toggle", this.toggleKey, () => {
                this.active = !this.active;
                this._onActive();
                Main.notify("Nebel: Wetter", this.active ? "Wettereffekte eingeschaltet" : "Wettereffekte ausgeschaltet");
            });
    }

    _onActive() {
        if (this.active) { if (!this.event) this._schedule(rand(20, 60)); }
        else this.stop();
    }

    // ------------------------------------------------------------ Ebene
    // Muffin sortiert bei jeder Stapeländerung nur Fenster und Desklets ein; fremde
    // Ebenen rutschen dabei nach oben. Deshalb direkt unter das unterste Fenster setzen.
    _restack() {
        let wg = global.window_group;
        if (this.layer.get_parent() !== wg) return;
        let first = wg.get_children().find(c => c !== this.layer && c instanceof Meta.WindowActor);
        if (first) wg.set_child_below_sibling(this.layer, first);
        else wg.set_child_above_sibling(this.layer, null);
    }

    _queueRestack() {
        if (this._later) return;
        this._later = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._later = 0;
            this._restack();
            return false;
        });
    }

    _resize() {
        let w = 0, h = 0;
        for (let m of Main.layoutManager.monitors) {
            w = Math.max(w, m.x + m.width);
            h = Math.max(h, m.y + m.height);
        }
        this.W = w; this.H = h;
        this.layer.set_position(0, 0);
        this.layer.set_size(w, h);
        this.shade.set_size(w, h);
    }

    // ------------------------------------------------------------ Zeitplan
    _schedule(secs) {
        if (this.schedId) GLib.source_remove(this.schedId);
        this.schedId = 0;
        if (!this.active) return;
        if (secs === undefined) {
            let lo = Math.max(1, this.pauseMin), hi = Math.max(lo, this.pauseMax);
            secs = rand(lo, hi) * 60;
        }
        this.schedId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, Math.max(1, Math.round(secs)), () => {
            this.schedId = 0;
            this._startEvent(this._pickKinds());
            return GLib.SOURCE_REMOVE;
        });
    }

    _pickKinds() {
        let m = GLib.DateTime.new_now_local().get_month();
        let s = this.seasonal;
        let ok = {
            rain: this.rain && (!s || (m >= 3 && m <= 11)),
            leaf: this.leaves && (!s || (m >= 9 && m <= 11)),
            snow: this.snow && (!s || m === 12 || m <= 2),
        };
        let avail = Object.keys(ok).filter(k => ok[k]);
        if (!avail.length) return null;
        let main = avail[Math.floor(Math.random() * avail.length)];
        let kinds = { [main]: 1 };
        if (main === "leaf" && ok.rain && Math.random() < 0.3) kinds.rain = 0.6;     // Herbststurm
        if (main === "rain" && ok.leaf && Math.random() < 0.4) kinds.leaf = 0.5;
        return kinds;
    }

    _startEvent(kinds, manual) {
        if (!kinds) { this._schedule(); return; }
        if (this.schedId) { GLib.source_remove(this.schedId); this.schedId = 0; }
        let lo = Math.max(10, this.durMin), hi = Math.max(lo, this.durMax);
        let windDir = this.wind !== 0 ? Math.sign(this.wind) : (Math.random() < 0.5 ? -1 : 1);
        let dur = rand(lo, hi);
        this.event = {
            kinds,
            manual: !!manual,
            t0: GLib.get_monotonic_time() / 1e6,
            dur,
            rise: manual ? 2 : dur * 0.15,     // Testknopf: sofort sichtbar
            dir: windDir,
            minWind: kinds.leaf ? rand(0.5, 0.9) : 0.15,
            ph: rand(0, 6.28),
        };
        if (!this.checkTimer)
            this.checkTimer = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 1, () => {
                this._checkCovered();
                this._restack();
                return GLib.SOURCE_CONTINUE;
            });
        this.paused = false;
        this._checkCovered(true);
        if (!this.paused) this._run();
        if (manual) this._seed(kinds);
    }

    trigger(kinds) { this._startEvent(kinds, true); }

    // Testknopf: gleich einige Teilchen über den Bildschirm verteilen statt nur am Rand
    _seed(kinds) {
        let k = this.intensity / 100;
        let wind = (Math.sign(this.wind) || this.event.dir) * Math.max(Math.abs(this.wind / 100), this.event.minWind) * 200;
        let n = { rain: 120 * k, leaf: 6 * k, snow: 60 * k };
        for (let kind in kinds) {
            for (let i = 0; i < Math.round(n[kind] * kinds[kind]); i++) {
                if (kind === "rain") this._spawnRain(wind);
                else if (kind === "leaf") this._spawnLeaf(wind);
                else this._spawnSnow();
                let p = this.parts[this.parts.length - 1];
                p.x = rand(0, this.W);
                p.y = rand(-0.05, kind === "rain" ? 0.9 : 0.6) * this.H;
            }
        }
    }

    stop() {
        this.event = null;
        this._clearParts();
        this._idle();
    }

    // ------------------------------------------------------------ Ablauf
    _startTimer() {
        // Clutter-Zeitleiste statt GLib-Zeitgeber: läuft im Zeichentakt der Bühne, damit jede
        // berechnete Position auch genau einmal gezeigt wird (kein Überspringen/Verdoppeln).
        // Die Bildrate wirkt als Obergrenze.
        this.last = GLib.get_monotonic_time();
        let tl = new Clutter.Timeline({ duration: 1000, repeat_count: -1 });
        tl.connect("new-frame", () => {
            let now = GLib.get_monotonic_time();
            if ((now - this.last) / 1000 < 1000 / Math.max(5, this.fps) - 4) return;
            this._step();
        });
        this.timer = tl;
        tl.start();
    }

    _stopTimer() {
        let tl = this.timer;
        this.timer = 0;
        if (tl) { tl.stop(); tl.run_dispose(); }
    }

    _run() {
        this._restack();
        this.layer.show();
        if (!this.timer) this._startTimer();
    }

    _idle() {
        this._stopTimer();
        if (this.checkTimer) GLib.source_remove(this.checkTimer);
        this.checkTimer = 0;
        this.layer.hide();
        this.shade.opacity = 0;
        this.shadeLevel = 0;
        this.event = null;
        for (let k in this.pool) {
            for (let p of this.pool[k]) p.actor.destroy();
            this.pool[k] = [];
        }
        this._schedule();
    }

    _covered() {
        if (this.isRdp && !this.showInRdp) return true;
        if (!this.pauseCovered || (this.event && this.event.manual)) return false;
        let ws = global.workspace_manager.get_active_workspace();
        return ws.list_windows().some(w =>
            !w.minimized && w.showing_on_its_workspace() && w.get_window_type() === Meta.WindowType.NORMAL &&
            (w.is_fullscreen() || w.get_maximized() === Meta.MaximizeFlags.BOTH));
    }

    _checkCovered(force) {
        if (!this.event && !this.parts.length && !force) return;
        let c = this._covered();
        if (c && this.event && GLib.get_monotonic_time() / 1e6 - this.event.t0 > this.event.dur) {
            this.event = null;
            this._clearParts();
            this._idle();
            return;
        }
        if (c === this.paused && !force) return;
        this.paused = c;
        if (c) { this._stopTimer(); this.layer.hide(); }
        else this._run();
    }

    // ------------------------------------------------------------ Teilchen
    _makeActor(kind) {
        let a;
        if (kind === "rain") {
            a = new Clutter.Actor({ reactive: false,
                background_color: new Clutter.Color({ red: 205, green: 216, blue: 230, alpha: 255 }) });
        } else if (kind === "leaf") {
            a = new St.DrawingArea({ reactive: false });
            a.connect("repaint", area => this._drawLeaf(area));
        } else {
            a = new St.Widget({ reactive: false });
        }
        a.set_pivot_point(0.5, 0.5);
        this.layer.add_child(a);
        return a;
    }

    _get(kind) {
        let p = this.pool[kind].pop();
        if (!p) p = { kind, actor: this._makeActor(kind) };
        p.actor.show();
        this.parts.push(p);
        return p;
    }

    _free(i) {
        let p = this.parts[i];
        p.actor.hide();
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
        this.pool[p.kind].push(p);
    }

    _clearParts() {
        while (this.parts.length) this._free(this.parts.length - 1);
    }

    _spawnRain(windPx) {
        let p = this._get("rain"), d = Math.random(), sz = this.size / 100;
        p.vy = (750 + d * 650) * (0.9 + sz * 0.1);
        p.vx = windPx * 0.7;
        let len = Math.round((12 + d * 24) * sz);
        p.actor.set_size(d > 0.75 ? 2 : 1, len);
        p.actor.opacity = Math.round(60 + d * 110);
        p.x = rand(-0.2 * this.W, 1.2 * this.W);
        p.y = -len - rand(0, 60);
    }

    _spawnSnow() {
        let p = this._get("snow"), d = Math.random();
        let r = (1.2 + d * 2.8) * this.size / 100, dd = Math.max(2, Math.round(r * 2));
        p.vy = 25 + d * 55;
        p.amp = 8 + Math.random() * 22;
        p.freq = 0.3 + Math.random() * 0.8;
        p.ph = rand(0, 6.28);
        p.drift = 0.4 + d * 0.8;
        p.x = rand(-0.1 * this.W, 1.1 * this.W);
        p.y = -dd - rand(0, 40);
        p.actor.set_size(dd, dd);
        p.actor.style = `background-color: rgba(255,255,255,${(0.45 + d * 0.5).toFixed(2)}); border-radius: ${dd}px;`;
    }

    _spawnLeaf(windPx) {
        let p = this._get("leaf"), d = Math.random();
        let s = Math.round((20 + d * 22) * this.size / 100);
        let a = p.actor;
        a._color = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)]
            .map(c => Math.max(0, Math.min(1, c + rand(-0.06, 0.06))));
        a._shape = Math.random();
        a.set_size(s, s);
        a.queue_repaint();
        a.opacity = 235;
        p.s = s;
        p.vy = 35 + d * 45;
        p.drag = 0.8 + d * 0.9;
        p.vx = windPx * p.drag;
        p.f1 = rand(0.6, 1.6); p.f2 = rand(1.0, 2.6); p.flip = rand(1.5, 4.5);
        p.ph = rand(0, 6.28);
        p.rot = rand(0, 360);
        p.spin = rand(-160, 160);
        p.t = 0;
        if (Math.abs(windPx) > 60 && Math.random() < 0.65) {
            p.x = windPx > 0 ? -s - 10 : this.W + 10;
            p.y = rand(-0.05, 0.65) * this.H;
        } else {
            p.x = rand(0, this.W);
            p.y = -s - rand(0, 40);
        }
    }

    _drawLeaf(area) {
        let cr = area.get_context();
        let [w, h] = area.get_surface_size();
        let c = area._color || LEAF_COLORS[0];
        let cy = h / 2, x0 = w * 0.14, x1 = w * 0.97, L = x1 - x0;
        let bw = h * (0.24 + (area._shape || 0) * 0.2);
        cr.moveTo(x0, cy);
        cr.curveTo(x0 + L * 0.2, cy - bw, x0 + L * 0.68, cy - bw * 0.95, x1, cy);
        cr.curveTo(x0 + L * 0.68, cy + bw * 0.95, x0 + L * 0.2, cy + bw, x0, cy);
        cr.closePath();
        cr.setSourceRGBA(c[0], c[1], c[2], 0.95);
        cr.fillPreserve();
        cr.setSourceRGBA(c[0] * 0.55, c[1] * 0.55, c[2] * 0.55, 0.9);
        cr.setLineWidth(Math.max(0.7, w / 30));
        cr.stroke();
        cr.moveTo(0, cy + h * 0.05);
        cr.lineTo(x0 + L * 0.85, cy);
        cr.stroke();
        cr.$dispose();
    }

    _step() {
        let now = GLib.get_monotonic_time();
        let dt = Math.min((now - this.last) / 1e6, 0.1);
        this.last = now;
        let t = now / 1e6, k = this.intensity / 100;
        let ev = this.event, env = 0;
        if (ev) {
            let el = t - ev.t0;
            if (el > ev.dur) { this.event = ev = null; }
            else env = smooth(el / ev.rise) * smooth((ev.dur - el) / (ev.dur * 0.25)) *
                       (0.7 + 0.3 * Math.sin(el * 0.35 + ev.ph));
        }

        // Wind mit Böen
        let base = this.wind / 100;
        let dir = ev ? ev.dir : (Math.sign(base) || 1);
        let mag = Math.max(Math.abs(base), ev ? ev.minWind : 0);
        let gust = Math.max(0.15, 0.75 + 0.35 * Math.sin(t * 0.31) + 0.25 * Math.sin(t * 1.07 + 2) +
                                         0.15 * Math.sin(t * 2.3 + 1));
        let windPx = dir * mag * gust * 200;

        if (ev) {
            let rates = { rain: 170 * k, leaf: 5 * k * gust, snow: 5 * k };
            for (let kind in ev.kinds) {
                this.acc[kind] += rates[kind] * ev.kinds[kind] * env * dt;
                let n = Math.min(Math.floor(this.acc[kind]), 40);
                this.acc[kind] -= Math.floor(this.acc[kind]);
                for (let i = 0; i < n; i++) {
                    if (kind === "rain") this._spawnRain(windPx);
                    else if (kind === "leaf") this._spawnLeaf(windPx);
                    else this._spawnSnow();
                }
            }
        }

        let rainLevel = ev && ev.kinds.rain ? env * ev.kinds.rain : 0;
        let target = Math.round(Math.min(1.6, k) * 50 * rainLevel);
        this.shadeLevel += (target - this.shadeLevel) * Math.min(1, dt * 2);
        if (Math.abs(target - this.shadeLevel) < 0.5) this.shadeLevel = target;
        this.shade.opacity = Math.round(this.shadeLevel);

        let W = this.W, H = this.H;
        let rainRot = -Math.atan2(windPx * 0.7, 1000) * 180 / Math.PI;
        for (let i = this.parts.length - 1; i >= 0; i--) {
            let p = this.parts[i], a = p.actor;
            if (p.kind === "rain") {
                p.vx += (windPx * 0.7 - p.vx) * Math.min(1, dt * 3);
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if (p.y > H) { this._free(i); continue; }
                a.rotation_angle_z = rainRot;
                a.set_position(Math.round(p.x), Math.round(p.y));
            } else if (p.kind === "snow") {
                p.y += p.vy * dt;
                p.x += windPx * 0.25 * p.drift * dt;
                if (p.y > H + 10) { this._free(i); continue; }
                let x = p.x + Math.sin(t * p.freq + p.ph) * p.amp;
                a.set_position(x, p.y);  // Bruchteile: langsame Teilchen gleiten statt zu springen
            } else {
                p.t += dt;
                let want = windPx * p.drag + Math.sin(p.t * p.f1 + p.ph) * 45;
                p.vx += (want - p.vx) * Math.min(1, dt * 1.2);
                p.x += p.vx * dt;
                p.y += p.vy * (0.55 + 0.6 * Math.abs(Math.sin(p.t * p.f2 + p.ph))) * dt;
                p.rot += p.spin * (0.4 + gust * 0.6) * dt;
                if (p.y > H + 40 || p.x < -80 || p.x > W + 80) { this._free(i); continue; }
                let fl = Math.cos(p.t * p.flip + p.ph);
                a.scale_x = Math.abs(fl) < 0.15 ? (fl < 0 ? -0.15 : 0.15) : fl;
                a.rotation_angle_z = p.rot;
                a.set_position(p.x, p.y);
            }
        }

        if (!ev && !this.parts.length && this.shadeLevel < 0.5) this._idle();
    }

    destroy() {
        this._stopTimer();
        if (this.checkTimer) GLib.source_remove(this.checkTimer);
        if (this.schedId) GLib.source_remove(this.schedId);
        if (this._later) Meta.later_remove(this._later);
        Main.keybindingManager.removeHotKey(UUID + "-toggle");
        global.display.disconnect(this._restackId);
        Main.layoutManager.disconnect(this._monitorsId);
        this.settings.finalize();
        this.layer.destroy();
    }
}

function init(metadata) {}

function enable() {
    weather = new Weather();
    return {
        startRain: () => weather && weather.trigger({ rain: 1 }),
        startLeaves: () => weather && weather.trigger({ leaf: 1 }),
        startSnow: () => weather && weather.trigger({ snow: 1 }),
        stop: () => weather && weather.stop(),
        instance: () => weather,
    };
}

function disable() {
    if (weather) weather.destroy();
    weather = null;
}

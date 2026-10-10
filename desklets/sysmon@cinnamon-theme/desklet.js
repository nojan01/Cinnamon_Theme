// Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const ByteArray = imports.byteArray;
const Mainloop = imports.mainloop;
const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;

const FONT = "JetBrains Mono";
const GREEN = [0x8f / 255, 0xc4 / 255, 0x6b / 255];
const GREY = [0.82, 0.82, 0.82];

function readFile(path) {
    try {
        let [ok, data] = GLib.file_get_contents(path);
        return ok ? ByteArray.toString(data) : "";
    } catch (e) {
        return "";
    }
}

function fmtBytes(b) {
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    let i = 0;
    while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
    return (i === 0 || b >= 100 ? b.toFixed(0) : b.toFixed(1)) + " " + units[i];
}

class Graph {
    // series: [{ color: [r,g,b], data: [] }]; max: fester Wert oder null (automatisch)
    constructor(series, max) {
        this.series = series;
        this.fixedMax = max;
        this.actor = new St.DrawingArea({ style_class: "sm-graph" });
        this.actor.connect("repaint", area => this._draw(area));
    }

    setSize(w, h) { this.actor.set_size(w, h); }

    push(values, limit) {
        this.series.forEach((s, i) => {
            s.data.push(values[i]);
            while (s.data.length > limit) s.data.shift();
        });
        this.limit = limit;
        this.actor.queue_repaint();
    }

    _draw(area) {
        let cr = area.get_context();
        let [w, h] = area.get_surface_size();
        let max = this.fixedMax;
        if (!max) {
            max = 1;
            this.series.forEach(s => s.data.forEach(v => { if (v > max) max = v; }));
            max *= 1.15;
        }

        cr.setSourceRGBA(1, 1, 1, 0.05);
        cr.rectangle(0, 0, w, h);
        cr.fill();
        cr.setSourceRGBA(1, 1, 1, 0.10);
        cr.setLineWidth(1);
        for (let f of [0.25, 0.5, 0.75]) {
            cr.moveTo(0, Math.round(h * f) + 0.5);
            cr.lineTo(w, Math.round(h * f) + 0.5);
        }
        cr.stroke();

        let n = Math.max(2, this.limit || 60);
        let step = w / (n - 1);
        for (let s of this.series) {
            if (s.data.length < 2) continue;
            let x0 = w - (s.data.length - 1) * step;
            let y = v => h - 1 - Math.min(v / max, 1) * (h - 2);
            cr.moveTo(x0, h);
            s.data.forEach((v, i) => cr.lineTo(x0 + i * step, y(v)));
            cr.lineTo(w, h);
            cr.closePath();
            cr.setSourceRGBA(s.color[0], s.color[1], s.color[2], 0.22);
            cr.fill();
            s.data.forEach((v, i) => i === 0 ? cr.moveTo(x0, y(v)) : cr.lineTo(x0 + i * step, y(v)));
            cr.setSourceRGBA(s.color[0], s.color[1], s.color[2], 0.95);
            cr.setLineWidth(1.5);
            cr.stroke();
        }
        cr.$dispose();
    }
}

class SysmonDesklet extends Desklet.Desklet {
    constructor(metadata, deskletId) {
        super(metadata, deskletId);
        this._timer = 0;
        this._prevCpu = null;
        this._prevNet = null;

        this.settings = new Settings.DeskletSettings(this, metadata.uuid, deskletId);
        for (let [key, prop] of [["font-size", "fontSize"], ["graph-width", "graphWidth"],
                                 ["graph-height", "graphHeight"], ["opacity", "opacity"]]) {
            this.settings.bind(key, prop, () => this._applyStyle());
        }
        this.settings.bind("interval", "interval", () => this._restart());
        this.settings.bind("history", "history");
        this.settings.bind("interface", "iface", () => { this._prevNet = null; });

        this._box = new St.BoxLayout({ vertical: true, style_class: "sm-desklet" });
        this._labels = [];
        this._cpuGraph = this._addSection("CPU", new Graph([{ color: GREEN, data: [] }], 100));
        this._memGraph = this._addSection("RAM", new Graph([{ color: GREEN, data: [] }], 100));
        this._netGraph = this._addSection("Netz", new Graph(
            [{ color: GREEN, data: [] }, { color: GREY, data: [] }], null));
        this.setContent(this._box);
        this._applyStyle();
    }

    _addSection(title, graph) {
        let head = new St.BoxLayout({ style_class: "sm-head" });
        let t = new St.Label({ style_class: "sm-title", text: title });
        let v = new St.Label({ style_class: "sm-value", text: "…", x_expand: true,
                               x_align: Clutter.ActorAlign.END });
        head.add_actor(t);
        head.add_actor(v);
        this._box.add_actor(head);
        this._box.add_actor(graph.actor);
        this._labels.push(t, v);
        graph.value = v;
        return graph;
    }

    _applyStyle() {
        let a = Math.max(0, Math.min(100, this.opacity)) / 100;
        this._box.style = `background-color: rgba(30, 30, 30, ${a.toFixed(2)});`;
        for (let l of this._labels) l.style = `font-family: "${FONT}"; font-size: ${this.fontSize}pt;`;
        for (let g of [this._cpuGraph, this._memGraph, this._netGraph]) {
            g.setSize(this.graphWidth, this.graphHeight);
            g.actor.queue_repaint();
        }
    }

    on_desklet_added_to_desktop() { this._restart(); }

    on_desklet_removed() {
        if (this._timer) Mainloop.source_remove(this._timer);
        this._timer = 0;
    }

    _restart() {
        if (this._timer) Mainloop.source_remove(this._timer);
        this._update();
        this._timer = Mainloop.timeout_add_seconds(Math.max(1, this.interval), () => {
            this._update();
            return true;
        });
    }

    _update() {
        let limit = Math.max(10, this.history);
        this._updateCpu(limit);
        this._updateMem(limit);
        this._updateNet(limit);
    }

    _updateCpu(limit) {
        let line = readFile("/proc/stat").split("\n")[0] || "";
        let f = line.trim().split(/\s+/).slice(1).map(Number);
        if (f.length < 4) return;
        let idle = f[3] + (f[4] || 0);
        let total = f.reduce((a, b) => a + b, 0);
        let usage = 0;
        if (this._prevCpu) {
            let dt = total - this._prevCpu.total;
            usage = dt > 0 ? 100 * (1 - (idle - this._prevCpu.idle) / dt) : 0;
        }
        this._prevCpu = { idle, total };
        let load = (readFile("/proc/loadavg").split(" ").slice(0, 3)).join(" ");
        this._cpuGraph.push([usage], limit);
        this._cpuGraph.value.set_text(`${usage.toFixed(0).padStart(3)} %   Last ${load}`);
    }

    _updateMem(limit) {
        let m = {};
        for (let l of readFile("/proc/meminfo").split("\n")) {
            let r = l.match(/^(\w+):\s+(\d+)/);
            if (r) m[r[1]] = Number(r[2]) * 1024;
        }
        if (!m.MemTotal) return;
        let used = m.MemTotal - (m.MemAvailable !== undefined ? m.MemAvailable : m.MemFree);
        let pct = 100 * used / m.MemTotal;
        this._memGraph.push([pct], limit);
        this._memGraph.value.set_text(`${fmtBytes(used)} / ${fmtBytes(m.MemTotal)} (${pct.toFixed(0)} %)`);
    }

    _defaultIface() {
        for (let l of readFile("/proc/net/route").split("\n").slice(1)) {
            let f = l.trim().split(/\s+/);
            if (f.length > 2 && f[1] === "00000000") return f[0];
        }
        return null;
    }

    _updateNet(limit) {
        let iface = (this.iface || "").trim() || this._defaultIface();
        let rx = 0, tx = 0, found = false;
        for (let l of readFile("/proc/net/dev").split("\n").slice(2)) {
            let [name, rest] = l.split(":");
            if (!rest) continue;
            name = name.trim();
            if (iface ? name !== iface : name === "lo") continue;
            let f = rest.trim().split(/\s+/).map(Number);
            rx += f[0];
            tx += f[8];
            found = true;
        }
        if (!found) {
            this._netGraph.value.set_text(`${iface || "?"} nicht gefunden`);
            return;
        }
        let now = GLib.get_monotonic_time() / 1e6;
        let down = 0, up = 0;
        if (this._prevNet && this._prevNet.iface === iface) {
            let dt = now - this._prevNet.t;
            if (dt > 0) {
                down = Math.max(0, (rx - this._prevNet.rx) / dt);
                up = Math.max(0, (tx - this._prevNet.tx) / dt);
            }
        }
        this._prevNet = { iface, rx, tx, t: now };
        this._netGraph.push([down, up], limit);
        this._netGraph.value.clutter_text.set_markup(
            `<span font_family="${FONT}">${iface || "alle"}  ` +
            `<span foreground="#8fc46b">↓ ${fmtBytes(down)}/s</span>  ` +
            `<span foreground="#d1d1d1">↑ ${fmtBytes(up)}/s</span></span>`);
    }
}

function main(metadata, deskletId) {
    return new SysmonDesklet(metadata, deskletId);
}


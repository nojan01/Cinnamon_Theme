// Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
// Ergänzt im Rechtsklickmenü der Programme im Mint-Menü (menu@cinnamon.org)
// den Eintrag „Zum Dock hinzufügen“. Die Klassen des Menü-Applets sind nicht
// exportiert, daher wird der Prototyp über eine laufende Instanz gefunden.
// Außerdem: D-Bus-Methode de.little_tools.NebelMenu.Open öffnet das Mint-Menü
// (mit Suche) über dem Dock – aufgerufen vom Dock-Starter „Anwendungen“.
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const AppletManager = imports.ui.appletManager;
const Util = imports.misc.util;
const Settings = imports.ui.settings;

const MENU_UUID = "menu@cinnamon.org";
const MARK = "__nebelDockPatched";
const HELPER = GLib.build_filenamev([GLib.get_home_dir(), ".local", "bin", "nebel-dock-add"]);

const DBUS_PATH = "/de/little_tools/NebelMenu";
const DBUS_IFACE = '<node><interface name="de.little_tools.NebelMenu"><method name="Open"/></interface></node>';

let patched = [];
let dbusObj = null;
let settings = null;
let menuOpacity = 75;
let styledMenus = [];
let timerId = 0;
let settingsId = 0;

function addDockItem(menu, button) {
    let appinfo = button.app && button.app.get_app_info && button.app.get_app_info();
    if (!appinfo || !appinfo.get_filename())
        return;
    let item = new PopupMenu.PopupIconMenuItem("Zum Dock hinzufügen", "xsi-list-add", St.IconType.SYMBOLIC);
    item.connect("activate", () => {
        Util.spawn([HELPER, appinfo.get_filename()]);
        button.applet.toggleContextMenu(button);
        button.applet.menu.close();
    });
    let items = menu._getMenuItems();
    let idx = items.findIndex(i => i._action === "add_to_panel");
    menu.addMenuItem(item, idx >= 0 ? idx + 1 : 0);
}

function findGenericPrototype(applet) {
    let buttons = (applet._applicationsButtons || []).concat(applet._favoriteAppButtons || []);
    for (let b of buttons) {
        let proto = Object.getPrototypeOf(b);
        while (proto && !Object.prototype.hasOwnProperty.call(proto, "populateMenu"))
            proto = Object.getPrototypeOf(proto);
        if (proto)
            return proto;
    }
    return null;
}

function patchAll() {
    let instances = AppletManager.getRunningInstancesForUuid(MENU_UUID) || [];
    for (let applet of instances) {
        let proto = findGenericPrototype(applet);
        if (!proto || proto[MARK])
            continue;
        let orig = proto.populateMenu;
        proto.populateMenu = function (menu) {
            orig.call(this, menu);
            try {
                addDockItem(menu, this);
            } catch (e) {
                global.logError("dock-menu@cinnamon-theme: " + e);
            }
        };
        proto[MARK] = orig;
        patched.push(proto);
    }
    applyOpacity();
    return GLib.SOURCE_CONTINUE;
}

const PLANK_PATH = "/net/launchpad/plank/docks/dock1/";

function readKeyFile(path) {
    let kf = new GLib.KeyFile();
    try {
        kf.load_from_file(path, GLib.KeyFileFlags.NONE);
        return kf;
    } catch (e) {
        return null;
    }
}

function themeValue(kf, key, def) {
    if (kf) {
        for (let group of ["PlankDockTheme", "PlankTheme"]) {
            try { return kf.get_double(group, key); } catch (e) {}
        }
    }
    return def;
}

// Linker Außenrand des Plank-Docks: Mitte des ersten Eintrags (Plank-D-Bus
// GetHoverPosition) minus halbe Symbolgröße, Theme-Abstände und Rahmen.
function plankLeftEdge() {
    try {
        let s = new Gio.Settings({ schema_id: "net.launchpad.plank.dock.settings", path: PLANK_PATH });
        let first = s.get_strv("dock-items")[0];
        if (!first)
            return null;
        let dir = GLib.build_filenamev([GLib.get_user_config_dir(), "plank", "dock1", "launchers"]);
        let item = readKeyFile(GLib.build_filenamev([dir, first]));
        let uri = item && item.get_string("PlankDockItemPreferences", "Launcher");
        if (!uri)
            return null;
        let res = Gio.DBus.session.call_sync("net.launchpad.plank", "/net/launchpad/plank/dock1",
            "net.launchpad.plank.Items", "GetHoverPosition", new GLib.Variant("(s)", [uri]),
            null, Gio.DBusCallFlags.NONE, 300, null);
        let [cx, , pos, ok] = res.deep_unpack();
        if (!ok || pos !== 3) // 3 = unten
            return null;
        let size = s.get_int("icon-size");
        let theme = s.get_string("theme");
        let kf = null;
        for (let base of [GLib.build_filenamev([GLib.get_user_data_dir(), "plank", "themes"]), "/usr/share/plank/themes"]) {
            kf = readKeyFile(GLib.build_filenamev([base, theme, "dock.theme"]));
            if (kf)
                break;
        }
        let pad = (themeValue(kf, "HorizPadding", 0) + themeValue(kf, "ItemPadding", 0) / 2) / 10 * size;
        return Math.round(cx - size / 2 - pad - themeValue(kf, "LineWidth", 1));
    } catch (e) {
        global.logError("dock-menu@cinnamon-theme: Plank " + e);
        return null;
    }
}

// Mint-Menü am unteren Rand des Arbeitsbereichs öffnen (Plank reserviert seinen
// Platz, das Menü sitzt also direkt über dem Dock), linksbündig mit dem Dock;
// ohne Plank-Daten mittig über der Mausposition.
function openAtDock() {
    let applet = (AppletManager.getRunningInstancesForUuid(MENU_UUID) || [])[0];
    if (!applet || !applet.menu)
        return;
    let menu = applet.menu;
    if (menu.isOpen) {
        menu.close(applet.enableAnimation);
        return;
    }
    let [px] = global.get_pointer();
    let left = plankLeftEdge();
    let wa = global.workspace_manager.get_active_workspace()
        .get_work_area_for_monitor(global.display.get_current_monitor());
    if (!menu.__nebelOrigCalc)
        menu.__nebelOrigCalc = menu._calculatePosition;
    let origOrientation = menu._orientation;
    let restore = () => {
        if (menu.__nebelOrigCalc) {
            menu._calculatePosition = menu.__nebelOrigCalc;
            delete menu.__nebelOrigCalc;
        }
        menu._orientation = origOrientation;
    };
    menu._calculatePosition = function () {
        if (!this.actor.visible)
            this.box.show();
        let [, , natW, natH] = this.actor.get_preferred_size();
        let x = left !== null ? left : Math.round(px - natW / 2);
        x = Math.max(wa.x, Math.min(x, wa.x + wa.width - natW));
        this.sideFlipped = true;
        return [x, Math.max(wa.y, wa.y + wa.height - natH)];
    };
    menu._orientation = St.Side.BOTTOM;
    let id = menu.connect("open-state-changed", (m, open) => {
        if (open)
            return;
        menu.disconnect(id);
        // Schließ-Animation nutzt die Position noch
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => { restore(); return GLib.SOURCE_REMOVE; });
    });
    try {
        menu.toggle_with_options(applet.enableAnimation);
    } catch (e) {
        global.logError("dock-menu@cinnamon-theme: " + e);
        menu.disconnect(id);
        restore();
    }
}

function plankTheme() {
    try {
        let s = new Gio.Settings({ schema_id: "net.launchpad.plank.dock.settings", path: PLANK_PATH });
        let theme = s.get_string("theme");
        for (let base of [GLib.build_filenamev([GLib.get_user_data_dir(), "plank", "themes"]), "/usr/share/plank/themes"]) {
            let kf = readKeyFile(GLib.build_filenamev([base, theme, "dock.theme"]));
            if (kf)
                return kf;
        }
    } catch (e) {}
    return null;
}

function plankColor(kf, key, def) {
    try {
        let v = kf.get_string("PlankDockTheme", key).split(";;").map(Number);
        if (v.length === 4 && v.every(n => !isNaN(n)))
            return v;
    } catch (e) {}
    return def;
}

// Hintergrund des Mint-Menüs im Grau der Plank-Füllung (FillStartColor aus
// dock.theme) mit der eingestellten Deckkraft, Rahmen wie OuterStrokeColor.
// Kein Verlauf: St zeichnet Verläufe mit Transparenz nur in der Endfarbe.
// Kein Schatten: St legt box-shadow unter die ganze (durchsichtige) Fläche,
// das Menü wirkte dadurch dunkler als das Dock.
function menuStyle() {
    let kf = plankTheme();
    let c = plankColor(kf, "FillStartColor", [60, 60, 60, 190]);
    let o = plankColor(kf, "OuterStrokeColor", [150, 150, 150, 140]);
    return "background-color: rgba(" + c[0] + ", " + c[1] + ", " + c[2] + ", " + (menuOpacity / 100).toFixed(2) + ");" +
        " box-shadow: none;" +
        " border: 1px solid rgba(" + o[0] + ", " + o[1] + ", " + o[2] + ", " + (o[3] / 255).toFixed(2) + ");";
}

// Seitenleiste (.appmenu-sidebar) hat im Theme eine eigene dunklere Füllung
const SIDEBAR_STYLE = "background-color: transparent;";

function findSidebar(actor, depth) {
    if (actor.style_class && actor.style_class.split(" ").includes("appmenu-sidebar"))
        return actor;
    if (depth > 6)
        return null;
    for (let ch of actor.get_children()) {
        let f = findSidebar(ch, depth + 1);
        if (f)
            return f;
    }
    return null;
}

const OWN_PROPS = ["background-color", "box-shadow", "border"];

// Das Menü-Applet setzt beim Öffnen eigene Inline-Stile (max-height/-width) und
// überschreibt dabei unseren – daher eigene Angaben ergänzen statt ersetzen.
function mergeStyle(actor, own) {
    let keep = (actor.get_style() || "").split(";").map(d => d.trim())
        .filter(d => d && !OWN_PROPS.includes(d.split(":")[0].trim()));
    actor.set_style(keep.concat([own]).join("; "));
}

function stripStyle(actor) {
    let keep = (actor.get_style() || "").split(";").map(d => d.trim())
        .filter(d => d && !OWN_PROPS.includes(d.split(":")[0].trim()));
    actor.set_style(keep.length ? keep.join("; ") + ";" : null);
}

let currentStyle = null;

function styleMenu(menu) {
    mergeStyle(menu.actor, currentStyle || (currentStyle = menuStyle()));
    let sb = findSidebar(menu.actor, 0);
    if (sb)
        sb.set_style(SIDEBAR_STYLE);
}

function applyOpacity() {
    currentStyle = menuStyle();
    let instances = AppletManager.getRunningInstancesForUuid(MENU_UUID) || [];
    styledMenus = styledMenus.filter(m => instances.some(a => a.menu === m) && !m.actor.is_finalized());
    for (let applet of instances) {
        let menu = applet.menu;
        if (!menu || menu.actor.is_finalized())
            continue;
        styleMenu(menu);
        if (!styledMenus.includes(menu)) {
            menu.__nebelStyleId = menu.connect("open-state-changed", (m, open) => {
                if (open)
                    styleMenu(m);
            });
            styledMenus.push(menu);
        }
    }
}

function resetOpacity() {
    for (let menu of styledMenus) {
        if (menu.__nebelStyleId) {
            menu.disconnect(menu.__nebelStyleId);
            delete menu.__nebelStyleId;
        }
        if (!menu.actor.is_finalized()) {
            stripStyle(menu.actor);
            let sb = findSidebar(menu.actor, 0);
            if (sb)
                sb.set_style(null);
        }
    }
    styledMenus = [];
}

let extUuid = "dock-menu@cinnamon-theme";

function init(metadata) {
    extUuid = metadata.uuid;
}

function enable() {
    try {
        settings = new Settings.ExtensionSettings({}, extUuid);
        menuOpacity = settings.getValue("menu-opacity");
        settings.bind("menu-opacity", "menuOpacity", () => { menuOpacity = settings.getValue("menu-opacity"); applyOpacity(); });
    } catch (e) {
        global.logError("dock-menu@cinnamon-theme: Einstellungen " + e);
    }
    patchAll();
    // Menü-Applet kann neu geladen werden (neue Klassen) – regelmäßig nachziehen
    timerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 5, patchAll);
    settingsId = global.settings.connect("changed::enabled-applets", () => patchAll());
    try {
        dbusObj = Gio.DBusExportedObject.wrapJSObject(DBUS_IFACE, { Open: () => openAtDock() });
        dbusObj.export(Gio.DBus.session, DBUS_PATH);
    } catch (e) {
        global.logError("dock-menu@cinnamon-theme: D-Bus " + e);
        dbusObj = null;
    }
}

function disable() {
    if (timerId) GLib.source_remove(timerId);
    if (settingsId) global.settings.disconnect(settingsId);
    timerId = settingsId = 0;
    if (dbusObj) {
        dbusObj.unexport();
        dbusObj = null;
    }
    for (let proto of patched) {
        proto.populateMenu = proto[MARK];
        delete proto[MARK];
    }
    patched = [];
    resetOpacity();
    if (settings) {
        settings.finalize();
        settings = null;
    }
}

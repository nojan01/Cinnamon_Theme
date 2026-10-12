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

const MENU_UUID = "menu@cinnamon.org";
const MARK = "__nebelDockPatched";
const HELPER = GLib.build_filenamev([GLib.get_home_dir(), ".local", "bin", "nebel-dock-add"]);

const DBUS_PATH = "/de/little_tools/NebelMenu";
const DBUS_IFACE = '<node><interface name="de.little_tools.NebelMenu"><method name="Open"/></interface></node>';

let patched = [];
let dbusObj = null;
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
    return GLib.SOURCE_CONTINUE;
}

// Mint-Menü über der Mausposition am unteren Rand des Arbeitsbereichs öffnen
// (Plank reserviert seinen Platz, das Menü sitzt also direkt über dem Dock).
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
        let x = Math.round(px - natW / 2);
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

function init(metadata) {}

function enable() {
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
}

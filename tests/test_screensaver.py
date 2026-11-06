#!/usr/bin/python3
# Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
"""Run with /usr/bin/python3 -m unittest discover -s tests."""
from datetime import datetime, timedelta, timezone
import ast
import importlib.machinery
import importlib.util
import json
import re
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parent.parent
LOADER = importlib.machinery.SourceFileLoader("nebel_screensaver", str(ROOT / "screensaver/nebel-screensaver"))
SPEC = importlib.util.spec_from_loader(LOADER.name, LOADER)
saver = importlib.util.module_from_spec(SPEC)
LOADER.exec_module(saver)
COLOR_SPEC = importlib.util.spec_from_file_location(
    "screensaver_color", ROOT / "system/screensaver-clock-color.py")
screensaver_color = importlib.util.module_from_spec(COLOR_SPEC)
COLOR_SPEC.loader.exec_module(screensaver_color)


class ScreensaverColorPatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        self.clock = self.folder / "clock.py"
        self.state = self.folder / "state"
        self.backup = self.state / "cinnamon-screensaver-clock.py.original"
        self.set_paths()

    def set_paths(self):
        self.paths = (
            patch.object(screensaver_color, "CLOCK", self.clock),
            patch.object(screensaver_color, "STATE_DIR", self.state),
            patch.object(screensaver_color, "BACKUP", self.backup),
        )
        for context in self.paths:
            context.start()
            self.addCleanup(context.stop)

    def test_patch_and_restore_native_clock_colors(self):
        original = ((screensaver_color.OLD_COLOR + " %s " +
                     screensaver_color.OLD_COLOR + " %s\n").encode())
        self.clock.write_bytes(original)
        cache = self.folder / "__pycache__"
        cache.mkdir()
        stale_bytecode = cache / "clock.cpython-312.pyc"
        stale_bytecode.write_bytes(b"stale")
        screensaver_color.install()
        self.assertEqual(self.clock.read_bytes().count(screensaver_color.NEW_COLOR.encode()), 2)
        self.assertFalse(stale_bytecode.exists())
        self.assertEqual(self.backup.read_bytes(), original)
        screensaver_color.uninstall()
        self.assertEqual(self.clock.read_bytes(), original)
        self.assertFalse(self.backup.exists())

    def test_reinstall_preserves_new_package_source_for_restore(self):
        self.clock.write_bytes((screensaver_color.OLD_COLOR + " %s " +
                                screensaver_color.OLD_COLOR + " %s\n").encode())
        screensaver_color.install()
        screensaver_color.install()
        latest_package_source = (
            b"# updated by package\n" + (screensaver_color.OLD_COLOR + " %s " +
                                           screensaver_color.OLD_COLOR + " %s\n").encode())
        self.clock.write_bytes(latest_package_source)
        screensaver_color.install()
        screensaver_color.uninstall()
        self.assertEqual(self.clock.read_bytes(), latest_package_source)

    def test_uninstall_does_not_replace_unpatched_package_update(self):
        self.clock.write_bytes((screensaver_color.OLD_COLOR + " %s " +
                                screensaver_color.OLD_COLOR + " %s\n").encode())
        screensaver_color.install()
        latest_package_source = b"# package update replaced patched file\n"
        self.clock.write_bytes(latest_package_source)
        screensaver_color.uninstall()
        self.assertEqual(self.clock.read_bytes(), latest_package_source)


class AlarmTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "next-alarm.json"
        self.now = datetime(2026, 11, 6, 19, 30)

    def write(self, **overrides):
        data = {"enabled": True, "nextWake": "2026-11-07T07:15:00", "label": "Frühstück"}
        data.update(overrides)
        self.path.write_text(json.dumps(data), encoding="utf-8")

    def test_missing(self):
        self.assertIsNone(saver.read_alarm(self.path, self.now))

    def test_enabled(self):
        self.write()
        self.assertEqual(saver.read_alarm(self.path, self.now),
                         (datetime(2026, 11, 7, 7, 15), "Frühstück"))

    def test_disabled(self):
        self.write(enabled=False, nextWake=None)
        self.assertIsNone(saver.read_alarm(self.path, self.now))

    def test_optional_label(self):
        self.write(label=None)
        self.assertEqual(saver.read_alarm(self.path, self.now)[1], "")

    def test_expired_or_due(self):
        for value in ("2026-11-06T10:00:00", self.now.isoformat()):
            self.write(nextWake=value)
            self.assertIsNone(saver.read_alarm(self.path, self.now))

    def test_timezone(self):
        when = datetime.now(timezone.utc) + timedelta(days=2)
        self.write(nextWake=when.isoformat())
        alarm = saver.read_alarm(self.path, datetime.now())
        self.assertEqual(alarm[0], when.astimezone().replace(tzinfo=None))

    def test_invalid_is_not_no_alarm(self):
        for data in ("{", "[]", '{"enabled": "true"}', '{"enabled": true, "nextWake": "bad"}'):
            self.path.write_text(data, encoding="utf-8")
            with self.assertRaises((ValueError, KeyError)):
                saver.read_alarm(self.path, self.now)

    def test_alarm_day_and_label(self):
        with patch.object(saver, "GERMAN", True):
            for days, expected in ((0, "Heute"), (1, "Morgen"), (8, "14.11.2026")):
                when = self.now + timedelta(days=days, hours=1)
                text = saver.alarm_text((when, "Test"), self.now)
                self.assertIn(expected, text)
                self.assertIn("20:30", text)
                self.assertTrue(text.endswith(" · Test"))
            self.assertEqual(saver.alarm_text(None, self.now), "Kein Wecker gestellt")


class WeatherTests(unittest.TestCase):
    def setUp(self):
        self.settings = saver.read_weather(Path("/nonexistent-nebel-test-config"))

    def test_all_effects_render(self):
        for kind in ("rain", "snow", "leaves", "sun"):
            with self.subTest(kind=kind):
                settings = dict(self.settings, seasonal=False, fog=False)
                settings.update({key: key == kind for key in ("rain", "snow", "leaves", "sun")})
                effects = saver.Effects(settings)
                effects.step(0.1, datetime(2026, 11, 6, 12))
                self.assertEqual(effects.kind, kind)
                for _ in range(50):
                    effects.step(0.1, datetime(2026, 11, 6, 12))
                effects.render()
                effects.paint_details(saver.cairo.Context(effects.surface))
                self.assertTrue(any(effects.surface.get_data()))

    def test_fog_without_other_effects(self):
        effects = saver.Effects(dict(self.settings, rain=False, snow=False, leaves=False, sun=False, fog=True))
        effects.step(1, datetime(2026, 11, 6, 12))
        effects.render()
        self.assertIsNone(effects.kind)
        self.assertTrue(any(effects.surface.get_data()))

    def test_fog_texture_fades_to_transparent_at_every_edge(self):
        effects = saver.Effects(self.settings)
        for seed in range(5):
            effects.rng.seed(seed)
            texture = effects._fog_texture()
            data = bytes(texture.get_data())
            width, height, stride = texture.get_width(), texture.get_height(), texture.get_stride()
            self.assertTrue(any(data))
            for y in range(height):
                for x in range(width):
                    if x in (0, width - 1) or y in (0, height - 1):
                        offset = y * stride + x * 4
                        self.assertEqual(data[offset:offset + 4], b"\0" * 4)

    def test_master_disabled_is_transparent(self):
        effects = saver.Effects(dict(self.settings, active=False))
        effects.step(1, datetime(2026, 11, 6, 12))
        effects.render()
        self.assertFalse(any(effects.surface.get_data()))

    def test_no_sun_at_night(self):
        settings = dict(self.settings, rain=False, snow=False, leaves=False, sun=True)
        effects = saver.Effects(settings)
        effects.step(1, datetime(2026, 11, 6, 19))
        self.assertIsNone(effects.kind)

    def test_demo_cycles_all_enabled_effects_at_night_without_long_pauses(self):
        settings = dict(self.settings, rain=True, leaves=True, snow=True, sun=True, seasonal=True)
        effects = saver.Effects(settings, demo=True)
        now = datetime(2026, 7, 6, 23)
        for expected in ("rain", "leaves", "sun", "snow", "rain"):
            effects._start_event(now)
            self.assertEqual(effects.kind, expected)
            self.assertEqual(effects.duration, 15)
            self.assertEqual(effects.next_at - effects.elapsed, 16)
            effects.elapsed = effects.next_at

    def test_demo_respects_disabled_effects(self):
        settings = dict(self.settings, rain=False, leaves=True, snow=False, sun=True)
        effects = saver.Effects(settings, demo=True)
        for expected in ("leaves", "sun", "leaves"):
            effects._start_event(datetime(2026, 7, 6, 23))
            self.assertEqual(effects.kind, expected)
        effects.settings.update(leaves=False, sun=False)
        effects._start_event(datetime(2026, 7, 6, 23))
        self.assertIsNone(effects.kind)

    def test_seasonal_snow_only_in_winter(self):
        settings = dict(self.settings, rain=False, snow=True, leaves=False, sun=False, seasonal=True)
        for month, expected in ((1, "snow"), (7, None), (11, None), (12, "snow")):
            effects = saver.Effects(settings)
            effects.step(1, datetime(2026, month, 6, 12))
            self.assertEqual(effects.kind, expected)

    def test_fades_out(self):
        effects = saver.Effects(dict(self.settings, fog=False))
        effects.step(0.1, datetime(2026, 11, 6, 12))
        effects.elapsed = effects.event_at + effects.duration + 1
        effects.render()
        self.assertFalse(any(effects.surface.get_data()))

    def test_persisted_settings_and_invalid_value(self):
        with tempfile.TemporaryDirectory() as folder:
            config = Path(folder)
            path = config / "cinnamon/spices" / saver.WEATHER_UUID / f"{saver.WEATHER_UUID}.json"
            path.parent.mkdir(parents=True)
            path.write_text('{"wind": {"value": -100}, "sun": {"value": false}}', encoding="utf-8")
            settings = saver.read_weather(config)
            self.assertEqual(settings["wind"], -100)
            self.assertFalse(settings["sun"])
            for data in ('{"fps": {"value": 0}}', '{"rain": false}', '[]'):
                path.write_text(data, encoding="utf-8")
                with self.assertRaises(ValueError):
                    saver.read_weather(config)


class DetailedParticleTests(unittest.TestCase):
    def test_snow_stays_small_and_soft_at_all_monitor_sizes(self):
        settings = saver.read_weather(Path("/nonexistent-nebel-test-config"))
        for zoom in (1, 2, 4, 16 / 3):
            effects = saver.Effects(dict(settings, size=100, fog=False))
            effects.kind, effects.event_at, effects.elapsed, effects.duration = "snow", 0, 5, 60
            for depth_scale in (0.6, 1.0, 1.4):
                effects.particles = [[20, 20, depth_scale, 0]]
                surface = saver.cairo.ImageSurface(saver.cairo.FORMAT_ARGB32, 200, 200)
                cr = saver.cairo.Context(surface)
                cr.scale(zoom, zoom)
                before = tuple(cr.get_matrix())
                effects.paint_details(cr)
                self.assertEqual(tuple(cr.get_matrix()), before)
                data = bytes(surface.get_data())
                stride = surface.get_stride()
                pixels = [(x, y) for y in range(200) for x in range(200)
                          if any(data[y * stride + x * 4:y * stride + x * 4 + 4])]
                self.assertTrue(pixels)
                xs, ys = zip(*pixels)
                self.assertLessEqual(max(xs) - min(xs) + 1, 8)
                self.assertLessEqual(max(ys) - min(ys) + 1, 8)
                self.assertLess(max(data), 230)

    def test_leaf_shapes_and_colors_match_desktop(self):
        source = (ROOT / "extensions/weather@cinnamon-theme/extension.js").read_text()
        for name in ("LEAF_COLORS", "MAPLE_COLORS", "MAPLE", "MAPLE_TIPS"):
            match = re.search(r"const " + name + r" = (\[.*?\]);", source, re.S)
            self.assertIsNotNone(match)
            desktop = ast.literal_eval(match[1])
            self.assertEqual([tuple(point) for point in desktop], getattr(saver, name))

    def test_both_leaf_shapes_are_drawn_directly_and_have_individual_motion(self):
        rng = saver.random.Random(42)
        leaves = [saver.Leaf(rng, 100, 40) for _ in range(40)]
        self.assertEqual({leaf.maple for leaf in leaves}, {True, False})
        for leaf in leaves:
            self.assertFalse(hasattr(leaf, "texture"))
            before = (leaf.x, leaf.y, leaf.rotation)
            leaf.step(0.1, 40, 1, rng)
            self.assertNotEqual(before, (leaf.x, leaf.y, leaf.rotation))
            cr = saver.cairo.Context(saver.cairo.ImageSurface(saver.cairo.FORMAT_ARGB32, 200, 200))
            leaf.x = leaf.y = 50
            leaf.paint(cr, 1)
            self.assertTrue(any(cr.get_target().get_data()))

    def test_rotated_and_flipped_leaves_leave_surroundings_transparent(self):
        rng = saver.random.Random(42)
        leaf = saver.Leaf(rng, 100, 40)
        leaf.x = leaf.y = 90
        leaf.size = 40
        for maple in (False, True):
            leaf.maple = maple
            for angle in (0, 0.4, 1.5, 3.2):
                for age in (0, 0.5, 1, 2):
                    with self.subTest(maple=maple, angle=angle, age=age):
                        leaf.rotation, leaf.age = angle, age
                        surface = saver.cairo.ImageSurface(saver.cairo.FORMAT_ARGB32, 220, 220)
                        cr = saver.cairo.Context(surface)
                        leaf.paint(cr, 1)
                        data = bytes(surface.get_data())
                        self.assertTrue(any(data))
                        stride = surface.get_stride()
                        for y in range(220):
                            for x in range(220):
                                if not (78 <= x <= 142 and 78 <= y <= 142):
                                    offset = y * stride + x * 4
                                    self.assertEqual(data[offset:offset + 4], b"\0" * 4)

    def test_rain_segments_are_straight_and_follow_velocity(self):
        settings = saver.read_weather(Path("/nonexistent-nebel-test-config"))
        for wind in (-100, 0, 100):
            effects = saver.Effects(dict(settings, wind=wind))
            effects.kind, effects.event_at, effects.elapsed, effects.duration = "rain", 0, 5, 60
            effects.particles = [[200, 100, 1.2, 0]]
            cr = Mock()
            effects.paint_details(cr)
            cr.move_to.assert_called_once_with(200, 100)
            cr.line_to.assert_called_once()
            cr.stroke.assert_called_once()
            end_x, end_y = cr.line_to.call_args.args
            vx, vy = effects._rain_velocity(1.2)
            self.assertAlmostEqual((end_x - 200) * vy - (end_y - 100) * vx, 0)
            self.assertGreater(end_y, 100)

    def test_detail_layer_not_baked_into_low_resolution_surface(self):
        effects = saver.Effects(saver.read_weather(Path("/nonexistent-nebel-test-config")))
        with patch.object(effects, "paint_details") as details:
            effects.render()
        details.assert_not_called()


class LockTests(unittest.TestCase):
    def test_native_lock_without_name_restores_previous_default_message(self):
        bus = Mock()
        settings = Mock()
        state = {"custom-screensaver-command": "", "default-message": ""}
        settings.get_string.side_effect = state.get
        settings.get_user_value.return_value = saver.GLib.Variant("s", "Original")

        def set_message(key, value):
            state[key] = value
            return True

        settings.set_string.side_effect = set_message
        with patch.object(saver.Gio.Settings, "new", return_value=settings), \
                patch.object(saver, "read_alarm", return_value=(datetime.now() + timedelta(days=1), "<Test>&")), \
                patch.object(saver, "app_running", return_value=True), \
                patch.object(saver, "wait_for_unlock") as wait:
            saver.lock(bus)
        bus.call_sync.assert_called_once()
        args = bus.call_sync.call_args.args
        self.assertEqual(args[:4], (saver.SS_NAME, saver.SS_PATH, saver.SS_NAME, "Lock"))
        self.assertEqual(args[4].unpack()[0], "")
        self.assertIn("<Test>&", settings.set_string.call_args.args[1])
        settings.set_value.assert_called_once_with("default-message", settings.get_user_value.return_value)
        wait.assert_called_once_with(bus)
        settings.set_boolean.assert_not_called()

    def test_lock_failure_restores_unset_default_message(self):
        bus = Mock()
        bus.call_sync.side_effect = saver.GLib.Error("Lock failed")
        settings = Mock()
        state = {"custom-screensaver-command": "", "default-message": ""}
        settings.get_string.side_effect = state.get
        settings.get_user_value.return_value = None

        def set_message(key, value):
            state[key] = value
            return True

        settings.set_string.side_effect = set_message
        with patch.object(saver.Gio.Settings, "new", return_value=settings), \
                patch.object(saver, "read_alarm", return_value=None), \
                patch.object(saver, "app_running", return_value=True):
            with self.assertRaises(saver.GLib.Error):
                saver.lock(bus)
        settings.reset.assert_called_once_with("default-message")

    def test_custom_locker_refused(self):
        bus = Mock()
        settings = Mock()
        settings.get_string.return_value = "other-locker"
        with patch.object(saver.Gio.Settings, "new", return_value=settings):
            with self.assertRaises(RuntimeError):
                saver.lock(bus)
        bus.call_sync.assert_not_called()

    def test_invalid_alarm_does_not_prevent_locking(self):
        bus = Mock()
        settings = Mock()
        settings.get_string.return_value = ""
        with patch.object(saver.Gio.Settings, "new", return_value=settings), \
                patch.object(saver, "read_alarm", side_effect=ValueError("broken status")), \
                patch.object(saver, "wait_for_unlock"), \
                self.assertLogs(saver.LOG, level="ERROR"):
            saver.lock(bus)
        self.assertEqual(bus.call_sync.call_args.args[3], "Lock")

    def test_running_state_is_checked(self):
        bus = Mock()
        bus.call_sync.return_value = saver.GLib.Variant("(b)", (False,))
        self.assertFalse(saver.app_running(bus))
        self.assertEqual(bus.call_sync.call_args.args[4].unpack(), (saver.APP_BUS_NAME,))


class IdleWatcherTests(unittest.TestCase):
    def setUp(self):
        self.watcher = saver.IdleWatcher()
        self.watcher.bus = Mock()
        self.read_automation = saver.read_automation
        self.config = patch.object(saver, "read_automation", return_value=(True, 5))
        self.config.start()
        self.addCleanup(self.config.stop)
        self.spawn = patch.object(saver.Gio.Subprocess, "new")
        self.process = self.spawn.start()
        self.addCleanup(self.spawn.stop)

    def replies(self, idle, locked=False, inhibited=False):
        self.watcher.bus.call_sync.side_effect = [
            saver.GLib.Variant("(t)", (idle,)),
            saver.GLib.Variant("(b)", (locked,)),
            saver.GLib.Variant("(b)", (inhibited,)),
        ]

    def test_exact_threshold_and_no_duplicate(self):
        self.replies(299999)
        self.watcher.poll()
        self.process.assert_not_called()
        self.replies(300000)
        self.watcher.poll()
        self.process.assert_called_once()
        self.replies(305000)
        self.watcher.poll()
        self.process.assert_called_once()

    def test_lock_takes_priority(self):
        self.replies(400000, locked=True)
        self.watcher.poll()
        self.process.assert_not_called()

    def test_inhibitor_prevents_start(self):
        self.replies(400000, inhibited=True)
        self.watcher.poll()
        self.process.assert_not_called()
        self.replies(402000)
        self.watcher.poll()
        self.process.assert_called_once()

    def test_disable_stops_owned_preview(self):
        child = Mock()
        self.watcher.child = child
        with patch.object(saver, "read_automation", return_value=(False, 5)):
            self.watcher.poll()
        child.force_exit.assert_called_once()
        self.assertIsNone(self.watcher.child)
        self.watcher.bus.call_sync.assert_not_called()

    def test_new_activity_rearms(self):
        self.watcher.armed = False
        self.watcher.previous_idle = 400000
        self.replies(100)
        self.watcher.poll()
        self.assertTrue(self.watcher.armed)
        self.replies(300000)
        self.watcher.poll()
        self.process.assert_called_once()

    def test_invalid_configuration_reported_and_preview_stopped(self):
        child = Mock()
        self.watcher.child = child
        with patch.object(saver, "read_automation", side_effect=ValueError("invalid")), \
                self.assertLogs(saver.LOG, level="ERROR"):
            self.watcher.poll()
        child.force_exit.assert_called_once()
        self.process.assert_not_called()

    def test_config_defaults_and_validation(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "screensaver.json"
            self.assertEqual(self.read_automation(path), (False, 5))
            for value in (1, 120):
                path.write_text(json.dumps({"enabled": True, "minutes": value}))
                self.assertEqual(self.read_automation(path), (True, value))
            for value in (0, 121, True, 2.5):
                path.write_text(json.dumps({"enabled": True, "minutes": value}))
                with self.assertRaises(ValueError):
                    self.read_automation(path)


class MovementTests(unittest.TestCase):
    def test_bounds_and_screen_coverage_at_different_resolutions(self):
        for w, h in ((640, 360), (800, 600), (1920, 1080), (3840, 2160),
                     (5120, 2880), (3440, 1440), (1080, 1920)):
            with self.subTest(resolution=(w, h)):
                scale = min(w / 960, h / 540)
                width, height = w / scale, h / scale
                block_width, block_height = 500, 220
                positions = [saver.floating_position(width, height, block_width, block_height, t)
                             for t in range(0, 3600, 5)]
                for x, y in positions:
                    self.assertGreaterEqual(x * scale, 24 * scale)
                    self.assertGreaterEqual(y * scale, 24 * scale)
                    self.assertLessEqual((x + block_width) * scale, w - 24 * scale + 1e-8)
                    self.assertLessEqual((y + block_height) * scale, h - 40 * scale + 1e-8)
                xs, ys = zip(*positions)
                self.assertGreater(max(xs) - min(xs), (width - block_width - 48) * 0.99)
                self.assertGreater(max(ys) - min(ys), (height - block_height - 64) * 0.99)

    def test_axes_do_not_repeat_together(self):
        first = saver.floating_position(960, 540, 500, 220, 0)
        later = saver.floating_position(960, 540, 500, 220, 2 * saver.math.pi / 0.011)
        self.assertAlmostEqual(first[0], later[0])
        self.assertNotAlmostEqual(first[1], later[1])


class PreviewLifecycleTests(unittest.TestCase):
    def test_font_changes_are_used_on_next_draw(self):
        display = Mock()
        display.get_n_monitors.return_value = 0
        with patch.object(saver.Preview, "_background_changed"), \
                patch.object(saver.Preview, "_poll_alarm"), \
                patch.object(saver.Gdk.Display, "get_default", return_value=display):
            preview = saver.Preview(Mock())
        try:
            preview.background = saver.GdkPixbuf.Pixbuf.new(
                saver.GdkPixbuf.Colorspace.RGB, False, 8, 32, 32)
            preview.background.fill(0x303030ff)
            preview.font_settings = Mock()
            canvas = Mock()
            canvas.get_allocated_width.return_value = 640
            canvas.get_allocated_height.return_value = 360
            for fonts in (("Sans 20", "Sans 10", "Sans 9"),
                          ("Monospace 120", "Sans 80", "Serif 70")):
                preview.font_settings.get_string.side_effect = dict(zip(
                    ("font-time", "font-date", "font-message"), fonts)).get
                surface = saver.cairo.ImageSurface(saver.cairo.FORMAT_ARGB32, 640, 360)
                with patch.object(preview, "_text", wraps=preview._text) as text:
                    preview._draw(canvas, saver.cairo.Context(surface))
                self.assertEqual([call.args[3] for call in text.call_args_list],
                                 [fonts[0], fonts[1], fonts[2], fonts[2]])
                self.assertEqual([call.kwargs.get("haze", 0) for call in text.call_args_list],
                                 [2.4, 1.15, 1.15, 0])
        finally:
            preview.close()

    def test_alarm_poll_uses_async_status_request(self):
        preview = saver.Preview.__new__(saver.Preview)
        preview.bus = Mock()
        preview.closed = False
        preview.status_pending = False
        preview.status_cancel = saver.Gio.Cancellable()
        with patch.object(saver, "read_alarm", return_value=None):
            preview._poll_alarm()
            preview._poll_alarm()
        preview.bus.call.assert_called_once()
        preview.bus.call_sync.assert_not_called()
        self.assertTrue(preview.status_pending)
        preview.bus.call_finish.return_value = saver.GLib.Variant("(b)", (False,))
        preview._status_ready(preview.bus, Mock())
        self.assertFalse(preview.status_pending)
        self.assertTrue(preview.warning)

    def test_frame_does_not_poll_status(self):
        preview = saver.Preview.__new__(saver.Preview)
        preview.last_frame = 10
        preview.effects = Mock()
        preview.canvases = [Mock()]
        preview._poll_alarm = Mock()
        preview._frame(10.033)
        preview._poll_alarm.assert_not_called()
        preview.effects.render.assert_called_once()
        preview.canvases[0].queue_draw.assert_called_once()

    def test_frame_clock_limits_fps_without_drift(self):
        preview = saver.Preview.__new__(saver.Preview)
        preview.next_frame = 100
        preview.effects = Mock(settings={"fps": 30})
        preview._frame = Mock()
        clock = Mock()
        for frame in range(600):
            clock.get_frame_time.return_value = round((100 + frame / 60) * 1e6)
            preview._tick(None, clock)
        self.assertEqual(preview._frame.call_count, 300)
        self.assertAlmostEqual(preview.next_frame, 110)

    def test_cancelled_status_does_not_update_closed_preview(self):
        preview = saver.Preview.__new__(saver.Preview)
        preview.closed = True
        preview.warning = "unchanged"
        bus = Mock()
        bus.call_finish.side_effect = saver.GLib.Error("cancelled")
        with patch.object(saver.LOG, "error") as log:
            preview._status_ready(bus, Mock())
        log.assert_not_called()
        self.assertEqual(preview.warning, "unchanged")

    def test_desktop_master_switch_does_not_disable_preview_effects(self):
        settings = saver.read_weather(Path("/nonexistent-nebel-test-config"))
        settings.update(active=False, rain=True, leaves=False, snow=False, sun=False, seasonal=False)
        display = Mock()
        display.get_n_monitors.return_value = 0
        with patch.object(saver, "read_weather", return_value=settings), \
                patch.object(saver.Preview, "_background_changed"), \
                patch.object(saver.Preview, "_poll_alarm"), \
                patch.object(saver.Gdk.Display, "get_default", return_value=display):
            preview = saver.Preview(Mock())
        try:
            preview.effects.step(0.1, datetime(2026, 11, 6, 19))
            self.assertTrue(preview.effects.settings["active"])
            self.assertEqual(preview.effects.kind, "rain")
            self.assertFalse(preview.effects.settings["leaves"])
            self.assertFalse(preview.effects.settings["sun"])
        finally:
            preview.close()

    def test_native_activation_closes_preview(self):
        preview = saver.Preview.__new__(saver.Preview)
        preview.close = Mock()
        preview._screensaver_changed(None, None, None, None, None, saver.GLib.Variant("(b)", (False,)))
        preview.close.assert_not_called()
        preview._screensaver_changed(None, None, None, None, None, saver.GLib.Variant("(b)", (True,)))
        preview.close.assert_called_once()

    def test_mouse_grace_and_threshold(self):
        preview = saver.Preview.__new__(saver.Preview)
        preview.close = Mock()
        preview.started = 10
        preview.pointer = None
        event = Mock(x_root=100, y_root=100)
        with patch.object(saver.time, "monotonic", return_value=10.2):
            preview._motion(None, event)
        preview.close.assert_not_called()
        with patch.object(saver.time, "monotonic", return_value=12):
            event.x_root = 105
            preview._motion(None, event)
            preview.close.assert_not_called()
            event.x_root = 120
            preview._motion(None, event)
        preview.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()

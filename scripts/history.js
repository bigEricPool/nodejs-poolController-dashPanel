(function ($) {
    // The History panel: charts of anything njsPC keeps or works out over time, read from njsPC's history registry (GET /state/history/kinds
    // and GET /state/history). Each part of njsPC that has history registers its kinds there (each body's water temperature, a chlorinator's
    // output, the PoolMath data chosen as Of Interest, and whatever other features add), so this panel names none of them.
    //
    // The panel shows one view at a time. Views (a name and the kinds it shows, in order) are set up with the gear in the panel's title and
    // saved in dashPanel's own configuration (the historyPanel section), so every browser shows the same views. Until views are set up, the
    // panel offers one view for each default view name njsPC gives its kinds (a Temperature view and, where there are FC tests, an FC
    // view). The chosen view and period are remembered in this browser.
    //
    // It sits where the Water panel was (div.picWater, the same place in the layout) and is started through the same initWater call; the
    // Water panel's remembered choices (its FC view, its open explanation) carry over the first time.
    var DAY = 86400000;
    var COLORS = ['#2b8cbe', '#e6550d', '#31a354', '#756bb1', '#d6616b', '#8c6d31', '#17becf', '#bcbd22'];
    var NS = 'http://www.w3.org/2000/svg';
    var num = function (v) { return typeof v === 'number' && isFinite(v); };
    var store = {
        get: function (key) { try { return window.localStorage.getItem(key); } catch (err) { return null; } },
        set: function (key, val) { try { window.localStorage.setItem(key, val); } catch (err) { /* not remembered */ } }
    };
    $.widget('pic.historyPanel', {
        options: { refreshMs: 60 * 1000, slowRefreshMs: 10 * 60 * 1000, kindsRefreshMs: 10 * 60 * 1000, range: 'day', popup: false },
        _ranges: [['day', 'Day', 1], ['week', 'Week', 7], ['month', 'Month', 30], ['year', 'Year', 365]],
        _create: function () {
            var self = this, el = self.element;
            el[0].initWater = function (data) { self._init(data); };
            el.addClass('picWaterOff picHistory');
        },
        _destroy: function () {
            var o = this.options;
            if (o.timer) clearInterval(o.timer);
            o.timer = null;
        },
        _url: function (path) {
            var useProxy = makeBool($('body').attr('data-apiproxy'));
            return useProxy ? 'njsPC' + path : $('body').attr('data-apiserviceurl') + path;
        },
        // The first time, the Water panel's choices are carried over: its FC view opens the FC view, and its explanation stays open or closed.
        _migrate: function () {
            if (store.get('picHistoryMigrated') === '1') return;
            if (store.get('picWaterView') === 'fc' && store.get('picHistoryView') === null) this.options.pendingView = 'FC';
            var note = store.get('picWaterNote');
            if (note !== null && store.get('picHistoryNote') === null) store.set('picHistoryNote', note);
            store.set('picHistoryMigrated', '1');
        },
        _init: function (data) {
            var self = this, o = self.options, el = self.element;
            if (o.timer) clearInterval(o.timer);
            o.timer = null;
            el.empty();
            // Called without data when the dashboard is being cleared.
            if (typeof data === 'undefined') { el.addClass('picWaterOff'); return; }
            self._migrate();
            o.viewId = store.get('picHistoryView');
            var r = store.get('picHistoryRange');
            if (self._ranges.some(function (x) { return x[0] === r; })) o.range = r;
            o.kinds = undefined; o.cfg = undefined; o.data = undefined;
            var title = $('<div class="picCircuitTitle control-panel-title"></div>').appendTo(el);
            // The larger copy in its popup has the dialog's title, and neither the enlarge button nor the settings.
            if (!o.popup) {
                $('<span class="picCircuitTitle">History</span>').appendTo(title);
                var btn = function (icon, tip, fn) {
                    $('<span class="picHistoryGear" role="button" tabindex="0"></span>').attr('title', tip).append($('<i></i>').addClass(icon)).appendTo(title)
                        .on('click keydown', function (evt) {
                            if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                            evt.preventDefault();
                            fn();
                        });
                };
                btn('fas fa-expand-alt', 'Show larger', function () { self._openLarge(); });
                btn('fas fa-cog', 'Set up the views of this panel', function () { self._openSettings(); });
            }
            var tabs = $('<span class="picWaterTabs"></span>').appendTo(title);
            self._ranges.forEach(function (x) { $('<span class="picWaterTab" role="button" tabindex="0"></span>').attr('data-range', x[0]).text(x[1]).appendTo(tabs); });
            tabs.on('click keydown', 'span.picWaterTab', function (evt) {
                if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                evt.preventDefault();
                o.range = $(evt.currentTarget).attr('data-range');
                store.set('picHistoryRange', o.range);
                self._showTabs();
                self._loadData();
            });
            $('<div class="picHistoryViews"></div>').appendTo(el).on('click keydown', 'span.picWaterTab', function (evt) {
                if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                evt.preventDefault();
                o.viewId = $(evt.currentTarget).attr('data-view');
                o.pendingView = undefined;
                store.set('picHistoryView', o.viewId);
                self._showTabs();
                self._loadData();
            });
            $('<div class="picWaterBody"></div>').appendTo(el);
            self._showTabs();
            self._loadConfig();
            self._loadKinds();
            o.timer = setInterval(function () {
                if (document.hidden) return;
                var now = Date.now();
                if (!o.kindsAt || now - o.kindsAt > o.kindsRefreshMs) self._loadKinds();
                else if (!o.dataAt || now - o.dataAt > (o.range === 'day' ? o.refreshMs : o.slowRefreshMs)) self._loadData();
            }, o.refreshMs);
        },
        // The views saved in dashPanel's configuration (an empty answer when none were saved).
        _loadConfig: function () {
            var self = this, o = self.options;
            $.ajax({ url: 'config/historyPanel', type: 'get', dataType: 'json' })
                .done(function (cfg) { o.cfg = cfg && typeof cfg === 'object' ? cfg : {}; self._ready(); })
                .fail(function () { o.cfg = {}; self._ready(); });
        },
        // Quiet when it fails: an njsPC without the history registry answers 404, and the panel then stays hidden.
        _loadKinds: function () {
            var self = this, o = self.options;
            o.kindsAt = Date.now();
            $.ajax({ url: self._url('/state/history/kinds'), type: 'get', dataType: 'json' })
                .done(function (kinds) { o.kinds = Array.isArray(kinds) ? kinds.filter(function (k) { return k && typeof k.id === 'string'; }) : []; self._ready(); })
                .fail(function () { if (typeof o.kinds === 'undefined') { o.kinds = null; self._ready(); } });
        },
        _kindMap: function () {
            var map = {};
            (this.options.kinds || []).forEach(function (k) { map[k.id] = k; });
            return map;
        },
        // The saved views, or one view for each default view name njsPC gives its kinds, in the order the kinds come.
        _views: function () {
            var o = this.options;
            var saved = o.cfg && Array.isArray(o.cfg.views) ? o.cfg.views.filter(function (v) { return v && typeof v.name === 'string' && Array.isArray(v.kinds); }) : [];
            if (saved.length > 0) return saved.map(function (v, i) { return { id: String(v.id || ('v' + i)), name: v.name, kinds: v.kinds.filter(function (k) { return typeof k === 'string'; }) }; });
            return this._defaultViews();
        },
        _defaultViews: function () {
            var out = [], byName = {};
            (this.options.kinds || []).forEach(function (k) {
                if (typeof k.view !== 'string' || !k.view) return;
                if (!byName[k.view]) { byName[k.view] = { id: 'default:' + k.view, name: k.view, kinds: [] }; out.push(byName[k.view]); }
                byName[k.view].kinds.push(k.id);
            });
            return out;
        },
        _currentView: function () {
            var o = this.options, views = o.views || [];
            var v = views.find(function (x) { return x.id === o.viewId; });
            if (!v && o.pendingView) v = views.find(function (x) { return x.name === o.pendingView; });
            return v || views[0];
        },
        _ready: function () {
            var self = this, o = self.options, el = self.element;
            if (typeof o.cfg === 'undefined' || typeof o.kinds === 'undefined') return;
            if (o.kinds === null) { el.addClass('picWaterOff'); return; }
            o.views = self._views();
            var bar = el.find('div.picHistoryViews').empty();
            o.views.forEach(function (v) { $('<span class="picWaterTab" role="button" tabindex="0"></span>').attr('data-view', v.id).text(v.name).appendTo(bar); });
            bar.toggle(o.views.length > 1);
            self._showTabs();
            self._loadData();
        },
        _showTabs: function () {
            var self = this, o = self.options, el = self.element;
            el.find('span.picWaterTabs span.picWaterTab').each(function () { var on = $(this).attr('data-range') === o.range; $(this).toggleClass('selected', on).attr('aria-pressed', on); });
            var v = self._currentView();
            el.find('div.picHistoryViews span.picWaterTab').each(function () { var on = !!v && $(this).attr('data-view') === v.id; $(this).toggleClass('selected', on).attr('aria-pressed', on); });
        },
        _days: function () {
            var o = this.options, days = 1;
            this._ranges.forEach(function (r) { if (r[0] === o.range) days = r[2]; });
            return days;
        },
        // The view's points over the period; a view with a kind that runs ahead of now (a projection) asks for a quarter of the period ahead too.
        _loadData: function () {
            var self = this, o = self.options;
            if (!Array.isArray(o.views)) return;
            var v = self._currentView(), map = self._kindMap();
            var ids = v ? v.kinds.filter(function (id) { return !!map[id]; }) : [];
            o.dataAt = Date.now();
            var seq = o.loadSeq = (o.loadSeq || 0) + 1;
            if (ids.length === 0) { o.data = { series: {} }; self._render(); return; }
            var days = self._days(), now = Date.now();
            var future = ids.some(function (id) { return map[id].future === true; });
            var from = now - days * DAY, to = future ? now + Math.max(DAY / 4, days * DAY / 4) : now;
            var path = '/state/history?kinds=' + encodeURIComponent(ids.join(',')) + '&from=' + Math.round(from) + '&to=' + Math.round(to);
            $.ajax({ url: self._url(path), type: 'get', dataType: 'json' })
                .done(function (d) { if (seq !== o.loadSeq) return; o.data = d && typeof d === 'object' ? d : { series: {} }; o.data.reqFrom = from; o.data.reqTo = to; self._render(); })
                .fail(function () { if (seq !== o.loadSeq) return; o.data = null; self._render(); });
        },
        _fmt: function (v, unit) {
            if (!num(v)) return '--';
            var a = Math.abs(v);
            var s = a >= 1000 ? Math.round(v).toString() : a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(a >= 1 ? 1 : 2);
            if (!unit) return s;
            return s + (unit.charAt(0) === '°' || unit === '%' ? '' : ' ') + unit;
        },
        _time: function (t) {
            var d = new Date(t);
            if (isNaN(d.getTime())) return '';
            return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        },
        _when: function (t) {
            var d = new Date(t);
            if (isNaN(d.getTime())) return '';
            return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + this._time(t);
        },
        _step: function (span, steps, most) {
            for (var i = 0; i < steps.length; i++) if (span / steps[i] <= most) return steps[i];
            return steps[steps.length - 1];
        },
        _icon: function (k) {
            var u = k.unit || '';
            if (u.charAt(0) === '°') return 'fas fa-thermometer-half';
            if (k.group === 'test' || u === 'ppm' || k.style === 'dots') return 'fas fa-vial';
            if (u === '%') return 'fas fa-percent';
            return 'fas fa-chart-line';
        },
        _render: function () {
            var self = this, o = self.options, el = self.element;
            var body = el.find('div.picWaterBody').empty();
            el.removeClass('picWaterOff');
            var v = self._currentView(), map = self._kindMap();
            if (!v) {
                $('<div class="picWaterNote"></div>').text('Nothing to show yet. Use the gear in the title to set up a view.').appendTo(body);
                return;
            }
            if (o.data === null) { $('<div class="picWaterNote"></div>').text('The history could not be read from njsPC.').appendTo(body); return; }
            var kinds = v.kinds.map(function (id) { return map[id]; }).filter(function (k) { return !!k; });
            if (kinds.length === 0) { $('<div class="picWaterNote"></div>').text('None of the items of this view are available now. Use the gear in the title to choose others.').appendTo(body); return; }
            var series = (o.data && o.data.series) || {};
            var now = Date.now(), days = self._days();
            var from = o.data && num(o.data.reqFrom) ? o.data.reqFrom : now - days * DAY;
            var to = o.data && num(o.data.reqTo) ? o.data.reqTo : now;
            // A colour for each item: the first one drawn in the text colour (as the Water panel drew the water temperature), the others from the palette.
            var color = {}, ci = 0;
            kinds.forEach(function (k) { color[k.id] = ci === 0 ? 'currentColor' : COLORS[(ci - 1) % COLORS.length]; ci++; });
            // The latest value of each item that has values, with the high, the low and the average of the period.
            kinds.forEach(function (k) {
                if (k.style === 'band' || k.style === 'markers') return;
                var pts = (series[k.id] || []).filter(function (p) { return num(p.v) && !p.o && p.t >= from && p.t <= now; });
                if (pts.length === 0) return;
                var row = $('<div class="picWaterRow"></div>').appendTo(body);
                $('<span class="picWaterIcon"></span>').appendTo(row).append($('<i></i>').addClass(self._icon(k))).css('color', color[k.id] === 'currentColor' ? '' : color[k.id]);
                $('<label class="picWaterLabel"></label>').text(k.name).attr('title', k.sourceName ? k.sourceName + ': ' + k.name : k.name).appendTo(row);
                var last = pts[pts.length - 1];
                $('<span class="picWaterValue"></span>').text(self._fmt(last.v, k.unit)).attr('title', 'At ' + self._when(last.t)).appendTo(row);
                var hi = pts[0], lo = pts[0], sum = 0;
                pts.forEach(function (p) { if (p.v >= hi.v) hi = p; if (p.v <= lo.v) lo = p; sum += p.v; });
                $('<span class="picWaterExtra"></span>').text('high ' + self._fmt(hi.v) + ' / low ' + self._fmt(lo.v) + ' · avg ' + self._fmt(sum / pts.length))
                    .attr('title', pts.length + ' value' + (pts.length === 1 ? '' : 's') + ' in the period. High at ' + self._when(hi.t) + ', low at ' + self._when(lo.t) + '.')
                    .appendTo(row);
            });
            // The charts: up to two units in each (a scale at the left and one at the right), in the order of the items. Markers (additions,
            // notes) go along the bottom of the first chart.
            var charts = [], markers = [];
            kinds.forEach(function (k) {
                if (k.style === 'markers') { markers.push(k); return; }
                var u = k.unit || '';
                var c = charts.find(function (x) { return x.units.indexOf(u) !== -1; }) || charts.find(function (x) { return x.units.length < 2; });
                if (!c) { c = { units: [], kinds: [] }; charts.push(c); }
                if (c.units.indexOf(u) === -1) c.units.push(u);
                c.kinds.push(k);
            });
            if (charts.length === 0) charts.push({ units: [], kinds: [] });
            charts[0].markers = markers;
            // The period: the last 24 hours for Day; a longer one starts at its first point (with half a day of room), so a short record is
            // not squeezed against the right edge. It runs past now to the last point of an item that looks ahead.
            var tMin = Infinity, tMax = -Infinity;
            kinds.forEach(function (k) { (series[k.id] || []).forEach(function (p) { if (p.t < tMin) tMin = p.t; if (p.t > tMax) tMax = p.t; }); });
            var t1 = Math.min(to, Math.max(now, tMax));
            var t0 = days === 1 || tMin === Infinity ? from : Math.max(from, tMin - DAY / 2);
            // In the popup the charts are taller, and the drawing keeps the proportions of the space it fills, so dots stay round.
            if (o.popup) {
                var rem = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
                var wpx = Math.max(150, body.width() - 4.5 * rem), hpx = rem * (window.innerWidth < 600 ? 12 : 18);
                o.chartH = Math.max(20, Math.min(160, 200 * hpx / wpx));
            }
            var styles = {};
            charts.forEach(function (c) { self._chart(body, c, series, color, t0, t1, styles); });
            self._note(body, self._noteText(styles, days));
        },
        _noteText: function (s, days) {
            var parts = [];
            if (s.line) parts.push('Lines follow a value over time' + (s.lineBand ? '; the shaded band around a line runs from the low to the high of each ' + (days <= 7 ? 'hour' : 'day') : '') + '.');
            if (s.gap) parts.push('A line breaks where nothing was recorded (for example while the pump was off).');
            if (s.steps) parts.push('A stepped line is a setting, held until it changed.');
            if (s.dots) parts.push('Dots are single readings, such as tests.');
            if (s.band) parts.push('A shaded band with dotted edges is a range in force at the time; it steps where it changed.');
            if (s.markers) parts.push('The marks along the bottom are additions and notes: hover over one for its text; the newest are listed under the chart.');
            if (s.segs) parts.push('Where a line was worked out again (a new calculation), each one is its own line.');
            if (s.future) parts.push('The part right of the "now" line is projected.');
            if (s.right) parts.push('Items in colour on a second unit use the scale at the right.');
            return parts.join(' ') || 'Nothing recorded in this period yet.';
        },
        // The explanation under the charts, closed until the viewer opens it; the choice is remembered in this browser and survives the redraws.
        _note: function (body, text) {
            var o = this.options;
            if (typeof o.noteOpen === 'undefined') o.noteOpen = store.get('picHistoryNote') === 'open';
            var toggle = $('<div class="picWaterNoteToggle" role="button" tabindex="0"></div>').appendTo(body);
            var icon = $('<i class="fas"></i>').appendTo(toggle);
            $('<span></span>').text('About this chart').appendTo(toggle);
            var note = $('<div class="picWaterNote"></div>').text(text).appendTo(body);
            var show = function () {
                icon.toggleClass('fa-chevron-right', !o.noteOpen).toggleClass('fa-chevron-down', o.noteOpen);
                toggle.attr('aria-expanded', o.noteOpen ? 'true' : 'false');
                note.toggle(o.noteOpen);
            };
            toggle.on('click keydown', function (evt) {
                if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                evt.preventDefault();
                o.noteOpen = !o.noteOpen;
                store.set('picHistoryNote', o.noteOpen ? 'open' : 'closed');
                show();
            });
            show();
        },
        // The marks of the time scale between t0 and t1: their times and labels, suited to the span shown.
        _ticks: function (t0, t1) {
            var self = this, out = [];
            var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            var d0 = new Date(t0), span = (t1 - t0) / DAY;
            if (span <= 2) {
                var stepMin = self._step((t1 - t0) / 60000, [15, 30, 60, 120, 180, 360, 720], 6);
                var day = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate());
                for (var t = day.getTime(); t <= t1; t += stepMin * 60000) { if (t >= t0) out.push({ t: t, text: self._time(t) }); }
            }
            else if (span <= 62) {
                // Each midnight for up to ten days (by weekday up to a week, else by date); each Monday beyond.
                for (var dd = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 1); dd.getTime() <= t1; dd = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate() + 1)) {
                    if (span <= 8) out.push({ t: dd.getTime(), text: wd[dd.getDay()] });
                    else if (span <= 10 || dd.getDay() === 1) out.push({ t: dd.getTime(), text: (dd.getMonth() + 1) + '/' + dd.getDate() });
                }
            }
            else {
                for (var m = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); m.getTime() <= t1; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) out.push({ t: m.getTime(), text: names[m.getMonth()] });
            }
            return out;
        },
        // A scale for some values: its ends and its marks. A narrow spread is widened so a flat line sits in the middle.
        _scale: function (min, max) {
            if (!(max >= min)) return null;
            if (max - min < 2) { var mid = (max + min) / 2; min = mid - 1; max = mid + 1; if (min < 0 && mid >= 0) { min = 0; max = 2; } }
            var st = this._step(max - min, [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000], 4);
            min = Math.floor(min / st) * st;
            max = Math.ceil(max / st) * st;
            var ticks = [];
            for (var v = min; v <= max + 1e-9; v += st) ticks.push(Math.round(v * 1000) / 1000);
            return { min: min, max: max, ticks: ticks };
        },
        // One chart: the items of up to two units, each on its own scale (the first at the left, the second at the right).
        //   line     a path through the values, broken where the points are further apart than the period allows, with a shaded band from
        //            lo to hi where the points carry them; a point with none next to it is a dot; points taken while off (o) are not drawn
        //   steps    the value held until the next point
        //   band     lo to hi held until the next point, shaded with dotted edges
        //   dots     each value a dot
        //   markers  a mark along the bottom for each point, with its text as the tooltip
        _chart: function (parent, c, series, color, t0, t1, styles) {
            var self = this, now = Date.now();
            var W = 200, H = this.options.chartH || 46, pad = 2;
            var box = $('<div class="picWaterChart"></div>').appendTo(parent);
            var head = $('<div class="picWaterChartLabel"></div>').appendTo(box);
            var names = $('<span></span>').appendTo(head);
            c.kinds.forEach(function (k, i) {
                if (i > 0) names.append(document.createTextNode(' · '));
                $('<span></span>').text(k.name + (k.unit ? ' (' + k.unit + ')' : '')).css('color', color[k.id] === 'currentColor' ? '' : color[k.id]).appendTo(names);
            });
            var inSpan = function (p) { return p && num(p.t) && p.t >= t0 && p.t <= t1; };
            // A range or a setting in force when the period starts comes as the last point before it; it is drawn from the start.
            var held = function (k) {
                var all = (series[k.id] || []).filter(function (p) { return p && num(p.t) && p.t <= t1; }), out = all.filter(inSpan);
                var before = all.filter(function (p) { return p.t < t0; }).pop();
                if (before && (k.style === 'band' || k.style === 'steps') && !(out.length && out[0].t <= t0)) out.unshift($.extend({}, before, { t: t0 }));
                return out;
            };
            // The spread of each unit's values in the period.
            var scales = c.units.map(function (u) {
                var min = Infinity, max = -Infinity;
                c.kinds.forEach(function (k) {
                    if ((k.unit || '') !== u) return;
                    held(k).forEach(function (p) {
                        if (p.o) return;
                        [p.v, p.lo, p.hi].forEach(function (v) { if (num(v)) { if (v < min) min = v; if (v > max) max = v; } });
                    });
                });
                return min === Infinity ? null : self._scale(min, max);
            });
            var any = scales.some(function (s) { return !!s; }) || (c.markers || []).some(function (k) { return (series[k.id] || []).some(inSpan); });
            if (!any || !(t1 > t0)) { $('<div class="picWaterNote"></div>').text('Nothing recorded in this period yet.').appendTo(box); return box; }
            if (scales[0]) $('<span class="picWaterChartRange"></span>').text(self._fmt(scales[0].min) + '–' + self._fmt(scales[0].max) + (c.units[0] ? ' ' + c.units[0] : '')).appendTo(head);
            var svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.setAttribute('class', 'picWaterSvg');
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-label', c.kinds.map(function (k) { return k.name; }).join(', '));
            var x = function (t) { return W * (t - t0) / (t1 - t0); };
            var yOf = function (s) { return function (v) { return pad + (H - 2 * pad) * (1 - (v - s.min) / (s.max - s.min)); }; };
            var add = function (tag, attrs, style, title) {
                var e = document.createElementNS(NS, tag);
                for (var a in attrs) e.setAttribute(a, attrs[a]);
                if (style) e.setAttribute('style', style);
                if (title) { var tt = document.createElementNS(NS, 'title'); tt.textContent = title; e.appendChild(tt); }
                svg.appendChild(e);
                return e;
            };
            var xTicks = self._ticks(t0, t1);
            var left = scales[0] || scales[1];
            if (left) left.ticks.forEach(function (v) { var yy = yOf(left)(v); add('line', { x1: 0, x2: W, y1: yy, y2: yy, 'class': 'picWaterGrid' }); });
            xTicks.forEach(function (tk) { var xx = x(tk.t); add('line', { x1: xx, x2: xx, y1: 0, y2: H, 'class': 'picWaterGrid' }); });
            if (t1 > now + 60000) { styles.future = true; add('line', { x1: x(now), x2: x(now), y1: 0, y2: H, 'class': 'picHistoryNow' }); }
            // The longest step between two points a line runs across: the period's own (a few minutes for a day, two hours for a week, two
            // days beyond), or two and a half times the usual step of that item, whichever is longer.
            var span = (t1 - t0) / DAY;
            var baseGap = span <= 2 ? 5 * 60000 : span <= 8 ? 2 * 3600000 + 60000 : 2 * DAY + 3600000;
            var gapOf = function (pts) {
                if (pts.length < 3) return baseGap;
                var d = [];
                for (var i = 1; i < pts.length; i++) d.push(pts[i].t - pts[i - 1].t);
                d.sort(function (a, b) { return a - b; });
                return Math.max(baseGap, 2.5 * d[Math.floor(d.length / 2)]);
            };
            // Bands under lines, lines over them, dots on top.
            var order = { band: 0, line: 1, steps: 1, dots: 2 };
            c.kinds.slice().sort(function (a, b) { return (order[a.style] || 1) - (order[b.style] || 1); }).forEach(function (k) {
                var si = c.units.indexOf(k.unit || ''), s = scales[si];
                if (!s) return;
                if (si === 1) styles.right = true;
                var y = yOf(s), col = color[k.id];
                var pts = held(k);
                var stroke = col === 'currentColor' ? '' : 'stroke:' + col;
                var fill = col === 'currentColor' ? '' : 'fill:' + col;
                if (k.style === 'band') {
                    var bandD = '', edgeD = '';
                    pts.forEach(function (p, i) {
                        if (!num(p.lo) || !num(p.hi)) return;
                        var a = p.t, b = i + 1 < pts.length ? pts[i + 1].t : Math.min(t1, Math.max(now, p.t));
                        if (b <= a) b = a + (t1 - t0) / 400;
                        var xa = x(a).toFixed(1), xb = x(b).toFixed(1), yl = y(Math.min(p.lo, p.hi)).toFixed(1), yh = y(Math.max(p.lo, p.hi)).toFixed(1);
                        if (p.hi !== p.lo) bandD += 'M' + xa + ' ' + yh + 'L' + xb + ' ' + yh + 'L' + xb + ' ' + yl + 'L' + xa + ' ' + yl + 'Z';
                        edgeD += 'M' + xa + ' ' + yh + 'L' + xb + ' ' + yh;
                        if (p.hi !== p.lo) edgeD += 'M' + xa + ' ' + yl + 'L' + xb + ' ' + yl;
                    });
                    if (bandD) add('path', { d: bandD, 'class': 'picWaterFcBand' }, fill);
                    if (edgeD) add('path', { d: edgeD, 'class': 'picWaterFcEdge' }, stroke);
                    if (bandD || edgeD) styles.band = true;
                    return;
                }
                if (k.style === 'dots') {
                    pts.forEach(function (p) {
                        if (!num(p.v)) return;
                        add('ellipse', { cx: x(p.t).toFixed(1), cy: y(p.v).toFixed(1), rx: 1.8, ry: 1.8, 'class': 'picWaterFcDot' }, fill || 'fill:currentColor',
                            k.name + ' ' + self._fmt(p.v, k.unit) + ' at ' + self._when(p.t) + (p.text ? ': ' + p.text : ''));
                        styles.dots = true;
                    });
                    return;
                }
                var allVals = pts.filter(function (p) { return num(p.v) && !p.o; });
                if (allVals.length < pts.filter(function (p) { return num(p.v); }).length) styles.gap = true;
                // Points with different seg values are separate lines (a projection remade by each calculation).
                var segs = [], bySeg = {};
                allVals.forEach(function (p) { var key = num(p.seg) ? String(p.seg) : ''; if (!bySeg[key]) { bySeg[key] = []; segs.push(key); } bySeg[key].push(p); });
                if (segs.length > 1) styles.segs = true;
                segs.forEach(function (key) {
                    var vals = bySeg[key];
                    var gap = gapOf(vals);
                    // The band from the low to the high of each hour or day, one shape for each run of points.
                    if (k.style !== 'steps' && vals.some(function (p) { return num(p.lo) && num(p.hi) && p.hi > p.lo; })) {
                        var run = [], d = '';
                        var flush = function () {
                            if (run.length === 1) add('line', { x1: x(run[0].t), x2: x(run[0].t), y1: y(run[0].hi), y2: y(run[0].lo), 'class': 'picWaterBandBar' }, stroke);
                            if (run.length > 1) d += 'M' + run.map(function (p) { return x(p.t).toFixed(1) + ' ' + y(p.hi).toFixed(1); }).join('L')
                                + 'L' + run.slice().reverse().map(function (p) { return x(p.t).toFixed(1) + ' ' + y(p.lo).toFixed(1); }).join('L') + 'Z';
                            run = [];
                        };
                        vals.forEach(function (p) {
                            if (!num(p.lo) || !num(p.hi)) { flush(); return; }
                            if (run.length > 0 && p.t - run[run.length - 1].t > gap) flush();
                            run.push(p);
                        });
                        flush();
                        if (d) add('path', { d: d, 'class': 'picWaterBand' }, fill);
                        styles.lineBand = true;
                    }
                    var path = '', prev;
                    vals.forEach(function (p, i) {
                        var before = i > 0 && p.t - vals[i - 1].t <= gap, after = i < vals.length - 1 && vals[i + 1].t - p.t <= gap;
                        if (k.style !== 'steps' && !before && !after)
                            add('ellipse', { cx: x(p.t).toFixed(1), cy: y(p.v).toFixed(1), rx: 1.5, ry: 1.5, 'class': 'picWaterDot' }, fill);
                        if (i > 0 && !before) styles.gap = true;
                        if (k.style === 'steps') {
                            // A setting holds until the next one, so the line runs flat to it and then jumps; the last one holds until now.
                            path += (i === 0 ? 'M' : 'L') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1);
                            var next = i + 1 < vals.length ? vals[i + 1].t : Math.min(t1, Math.max(now, p.t));
                            path += 'L' + x(next).toFixed(1) + ' ' + y(p.v).toFixed(1);
                        }
                        else path += (before ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1);
                        prev = p;
                    });
                    if (path) add('path', { d: path, 'class': 'picWaterLine' + (k.style === 'steps' ? ' picHistorySteps' : '') }, stroke);
                });
                if (k.style === 'steps') styles.steps = true; else styles.line = true;
            });
            // Additions and notes along the bottom, each with its text as the tooltip; the newest are listed under the chart.
            var list = [];
            (c.markers || []).forEach(function (k) {
                (series[k.id] || []).filter(inSpan).forEach(function (p) {
                    var text = p.text || (num(p.v) ? self._fmt(p.v, k.unit) : '');
                    var xx = x(p.t);
                    add('line', { x1: xx, x2: xx, y1: H, y2: H - 7, 'class': 'picHistoryMark' }, color[k.id] === 'currentColor' ? '' : 'stroke:' + color[k.id],
                        self._when(p.t) + ' · ' + k.name + (text && text !== k.name ? ': ' + text : ''));
                    list.push({ t: p.t, k: k, text: text });
                    styles.markers = true;
                });
            });
            var plot = $('<div class="picWaterPlot"></div>').appendTo(box);
            var ybox = $('<div class="picWaterY"></div>').appendTo(plot);
            if (left) left.ticks.forEach(function (v) { $('<span></span>').text(String(v)).css('top', (100 * yOf(left)(v) / H) + '%').appendTo(ybox); });
            var area = $('<div class="picWaterArea"></div>').appendTo(plot);
            area[0].appendChild(svg);
            if (scales[0] && scales[1]) {
                var rcol = color[(c.kinds.find(function (k) { return (k.unit || '') === c.units[1]; }) || {}).id];
                var rbox = $('<div class="picWaterY picWaterYR"></div>').appendTo(plot);
                scales[1].ticks.forEach(function (v) { $('<span></span>').text(String(v)).css({ top: (100 * yOf(scales[1])(v) / H) + '%', color: rcol === 'currentColor' ? 'inherit' : rcol }).appendTo(rbox); });
            }
            var xbox = $('<div class="picWaterX"></div>').appendTo(area);
            xTicks.forEach(function (tk) {
                var frac = (tk.t - t0) / (t1 - t0);
                // A mark at the very edge keeps its line but not its label, which would hang outside the chart.
                if (frac < 0.04 || frac > 0.96) return;
                $('<span></span>').text(tk.text).css('left', (100 * frac) + '%').appendTo(xbox);
            });
            if (list.length > 0) {
                var ul = $('<div class="picHistoryMarks"></div>').appendTo(box);
                list.sort(function (a, b) { return b.t - a.t; }).slice(0, 5).forEach(function (m) {
                    var line = $('<div></div>').appendTo(ul);
                    $('<span class="picHistoryMarkWhen"></span>').text(self._when(m.t)).appendTo(line);
                    $('<span></span>').text(m.k.name + (m.text && m.text !== m.k.name ? ': ' + m.text : '')).css('color', color[m.k.id] === 'currentColor' ? '' : color[m.k.id]).appendTo(line);
                });
            }
            return box;
        },
        // The settings: the views in order, each with its name and the items it shows, picked from every item njsPC offers (by source).
        _openSettings: function () {
            var self = this, o = self.options, el = self.element;
            if (!Array.isArray(o.kinds)) return;
            var views = (o.views || []).map(function (v) { return { id: v.id.indexOf('default:') === 0 ? self._newId() : v.id, old: v.id, name: v.name, kinds: v.kinds.slice() }; });
            var open = {};
            if (views.length) open[views[0].id] = true;
            var dlg = $.pic.modalDialog.createDialog('dlgHistoryViews', {
                width: '560px',
                height: 'auto',
                title: 'History Views',
                position: { my: 'center top', at: 'center top', of: window },
                close: function () { try { $(this).modalDialog('destroy'); } catch (err) { /* not a dialog any more */ } $(this).remove(); },
                buttons: [
                    {
                        text: 'Save', icon: '<i class="fas fa-save"></i>',
                        click: function () {
                            var out = views.map(function (v, i) { return { id: v.id, name: (v.name || '').trim() || ('View ' + (i + 1)), kinds: v.kinds }; });
                            var dlgEl = this;
                            $.putLocalService('/config/historyPanel', { views: out }, 'Saving views...', function (c) {
                                $.pic.modalDialog.closeDialog(dlgEl);
                                // The view shown stays shown when a default view became a saved one.
                                var cur = views.find(function (v) { return v.old === o.viewId || (!o.viewId && v.old && v.old === (self._currentView() || {}).id); });
                                if (cur) { o.viewId = cur.id; store.set('picHistoryView', cur.id); }
                                o.cfg = c && typeof c === 'object' ? c : { views: out };
                                self._ready();
                            });
                        }
                    },
                    {
                        text: 'Defaults', icon: '<i class="fas fa-undo"></i>',
                        click: function () {
                            var dlgEl = this;
                            $.putLocalService('/config/historyPanel', { views: null }, 'Restoring the default views...', function (c) {
                                $.pic.modalDialog.closeDialog(dlgEl);
                                o.cfg = { views: null };
                                self._ready();
                            });
                        }
                    },
                    {
                        text: 'Cancel', icon: '<i class="far fa-window-close"></i>',
                        click: function () { $.pic.modalDialog.closeDialog(this); }
                    }
                ]
            });
            dlg.addClass('picHistorySettings');
            $('<div class="picHistoryHelp"></div>').appendTo(dlg)
                .text('Each view is a tab of the History panel. Name the views, put them in order, and tick the items each one shows. Items on the same unit share a scale; a chart takes two units, and more start another chart. Saved in dashPanel, so every browser shows the same views.');
            var list = $('<div class="picHistoryViewList"></div>').appendTo(dlg);
            var draw = function () {
                list.empty();
                if (views.length === 0) $('<div class="picHistoryHelp"></div>').text('No views. Add one, or use Defaults.').appendTo(list);
                views.forEach(function (v, i) { self._settingsView(list, views, v, i, open, draw); });
                $('<div class="picHistoryAdd" role="button" tabindex="0"><i class="fas fa-plus"></i> Add View</div>').appendTo(list).on('click keydown', function (evt) {
                    if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                    evt.preventDefault();
                    var nv = { id: self._newId(), name: 'View ' + (views.length + 1), kinds: [] };
                    views.push(nv);
                    open[nv.id] = true;
                    draw();
                });
            };
            draw();
        },
        // A larger copy of the panel in a popup: the same views and periods (a choice made in either is remembered for both), with taller charts.
        _openLarge: function () {
            var self = this, o = self.options;
            if ($('div#dlgHistoryLarge div.picHistoryLarge').length > 0) return;   // already open
            var inner;
            var dlg = $.pic.modalDialog.createDialog('dlgHistoryLarge', {
                width: Math.max(320, Math.min(window.innerWidth - 16, 1200)) + 'px',
                height: 'auto',
                title: 'History',
                position: { my: 'center top', at: 'center top+8', of: window },
                buttons: [{ text: 'Close', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }],
                close: function () {
                    try { if (inner) inner.historyPanel('destroy'); } catch (err) { /* already gone */ }
                    try { $(this).modalDialog('destroy'); } catch (err) { /* not a dialog any more */ } $(this).remove();
                    // The view or period may have been changed in the popup.
                    o.viewId = store.get('picHistoryView');
                    var r = store.get('picHistoryRange');
                    if (self._ranges.some(function (x) { return x[0] === r; })) o.range = r;
                    self._showTabs();
                    self._loadData();
                }
            });
            inner = $('<div class="picHistory picHistoryLarge"></div>').appendTo(dlg).historyPanel({ popup: true });
            inner[0].initWater({});
        },
        _newId: function () { return 'v' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); },
        _settingsView: function (list, views, v, i, open, draw) {
            var self = this, map = self._kindMap();
            var box = $('<div class="picHistoryView"></div>').appendTo(list);
            var head = $('<div class="picHistoryViewHead"></div>').appendTo(box);
            var chev = $('<span class="picHistoryBtn" role="button" tabindex="0"></span>').appendTo(head)
                .append($('<i class="fas"></i>').addClass(open[v.id] ? 'fa-chevron-down' : 'fa-chevron-right')).attr('title', open[v.id] ? 'Hide the items' : 'Choose the items');
            $('<input type="text" maxlength="30" class="picHistoryName">').val(v.name).appendTo(head).on('input change', function () { v.name = $(this).val(); });
            $('<span class="picHistoryCount"></span>').text(v.kinds.length + ' item' + (v.kinds.length === 1 ? '' : 's')).appendTo(head);
            var btn = function (icon, title, enabled, fn) {
                $('<span class="picHistoryBtn" role="button" tabindex="0"></span>').append($('<i></i>').addClass(icon)).attr('title', title).toggleClass('disabled', !enabled).appendTo(head)
                    .on('click keydown', function (evt) {
                        if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                        evt.preventDefault();
                        if (enabled) { fn(); draw(); }
                    });
            };
            btn('fas fa-arrow-up', 'Move up', i > 0, function () { views.splice(i - 1, 0, views.splice(i, 1)[0]); });
            btn('fas fa-arrow-down', 'Move down', i < views.length - 1, function () { views.splice(i + 1, 0, views.splice(i, 1)[0]); });
            btn('fas fa-trash', 'Remove this view', true, function () { views.splice(i, 1); });
            chev.on('click keydown', function (evt) {
                if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                evt.preventDefault();
                open[v.id] = !open[v.id];
                draw();
            });
            if (!open[v.id]) return;
            var items = $('<div class="picHistoryItems"></div>').appendTo(box);
            var groups = [], bySource = {};
            (self.options.kinds || []).forEach(function (k) {
                var g = k.sourceName || k.source || 'Other';
                if (!bySource[g]) { bySource[g] = []; groups.push(g); }
                bySource[g].push(k);
            });
            var missing = v.kinds.filter(function (id) { return !map[id]; });
            if (missing.length) { groups.push('Not available now'); bySource['Not available now'] = missing.map(function (id) { return { id: id, name: id, unit: '' }; }); }
            groups.forEach(function (g) {
                var row = $('<div class="picHistoryGroup"></div>').appendTo(items);
                $('<span class="picHistoryGroupName"></span>').text(g).appendTo(row);
                var cbs = $('<span class="picHistoryChecks"></span>').appendTo(row);
                bySource[g].forEach(function (k) {
                    var lbl = $('<label class="picHistoryCheck"></label>').appendTo(cbs)
                        .attr('title', k.id + (k.count ? ' · ' + k.count + ' entries' : '') + (k.first ? ', ' + new Date(k.first).toLocaleDateString() + ' to ' + new Date(k.last).toLocaleDateString() : ''));
                    $('<input type="checkbox">').prop('checked', v.kinds.indexOf(k.id) !== -1).appendTo(lbl).on('change', function () {
                        var at = v.kinds.indexOf(k.id);
                        if (this.checked && at === -1) v.kinds.push(k.id);
                        else if (!this.checked && at !== -1) v.kinds.splice(at, 1);
                        box.find('span.picHistoryCount').text(v.kinds.length + ' item' + (v.kinds.length === 1 ? '' : 's'));
                    });
                    $('<span></span>').text(' ' + k.name + (k.unit ? ' (' + k.unit + ')' : '')).appendTo(lbl);
                });
            });
        }
    });
})(jQuery);

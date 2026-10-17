(function ($) {
    // The water temperature of each body from njsPC's GET /state/temps/history: the temperature now, the high, the low and the average,
    // and a chart, over the last 24 hours (Day) or, from njsPC's hourly record, the last 7 days (Week, by hour), 30 days (Month, by day) or
    // year (Year, by day).
    // The periods always end now (they are not calendar periods). The panel stays hidden when njsPC does not have that route or has no
    // readings yet.
    $.widget('pic.waterTemp', {
        options: { refreshMs: 60 * 1000, range: 'day' },
        _ranges: [['day', 'Day', 1], ['week', 'Week', 7], ['month', 'Month', 30], ['year', 'Year', 365]],
        _create: function () {
            var self = this, o = self.options, el = self.element;
            el[0].initWater = function (data) { self._initWater(data); };
            el.addClass('picWaterOff');
        },
        _destroy: function () {
            var self = this, o = self.options;
            if (o.timer) clearInterval(o.timer);
            o.timer = null;
        },
        _initWater: function (data) {
            var self = this, o = self.options, el = self.element;
            if (o.timer) clearInterval(o.timer);
            o.timer = null;
            el.empty();
            // Called without data when the dashboard is being cleared.
            if (typeof data === 'undefined') { el.addClass('picWaterOff'); return; }
            var title = $('<div class="picCircuitTitle control-panel-title"></div>').appendTo(el);
            $('<span class="picCircuitTitle">Water</span>').appendTo(title);
            var tabs = $('<span class="picWaterTabs"></span>').appendTo(title);
            self._ranges.forEach(function (r) {
                $('<span class="picWaterTab" role="button" tabindex="0"></span>').attr('data-range', r[0]).text(r[1]).appendTo(tabs);
            });
            tabs.on('click keydown', 'span.picWaterTab', function (evt) {
                if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                evt.preventDefault();
                o.range = $(evt.currentTarget).attr('data-range');
                self._showTabs();
                self._load();
            });
            self._showTabs();
            $('<div class="picWaterBody"></div>').appendTo(el);
            self._load();
            o.timer = setInterval(function () { if (!document.hidden) self._load(); }, o.refreshMs);
        },
        _showTabs: function () {
            var self = this, o = self.options, el = self.element;
            el.find('span.picWaterTab').each(function () { $(this).toggleClass('selected', $(this).attr('data-range') === o.range).attr('aria-pressed', $(this).attr('data-range') === o.range); });
        },
        // A request that stays quiet when it fails: an njsPC without the history answers 404, and that is not an error to show.
        _load: function () {
            var self = this, o = self.options, el = self.element;
            var useProxy = makeBool($('body').attr('data-apiproxy'));
            var path = '/state/temps/history' + (o.range !== 'day' ? '?range=' + o.range : '');
            var url = useProxy ? 'njsPC' + path : $('body').attr('data-apiserviceurl') + path;
            var range = o.range;
            $.ajax({ url: url, type: 'get', dataType: 'json' })
                .done(function (data) { if (range !== o.range) return; o.history = data; self._render(); })
                .fail(function () { if (typeof o.history === 'undefined') el.addClass('picWaterOff'); });
        },
        _fmt: function (v, unit) {
            if (typeof v !== 'number' || isNaN(v)) return '--';
            return v.toFixed(1) + (unit || '');
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
        _render: function () {
            var self = this, o = self.options, el = self.element;
            var h = o.history;
            var isDay = !(h && typeof h.range === 'string' && h.range !== 'day');
            var all = h && Array.isArray(h.bodies) ? h.bodies : [];
            // The day view decides whether the panel shows at all; a longer view shows each body that has a day's readings, even before its first hour is summarized.
            var bodies = all.filter(function (b) { return Array.isArray(b.t) && (b.t.length > 0 || !isDay); });
            if (isDay && bodies.length === 0) { el.addClass('picWaterOff'); return; }
            el.removeClass('picWaterOff');
            var units = $('div.picBodies:first').attr('data-unitsname') || '';
            var deg = '°' + units;
            var body = el.find('div.picWaterBody').empty();
            var days = 1;
            self._ranges.forEach(function (r) { if (r[0] === o.range) days = r[2]; });
            var anyHeld = false, anyProjected = false, anyLevels = false, shortest;
            var has = function (arr) { return Array.isArray(arr) && arr.some(function (v) { return typeof v === 'number'; }); };
            bodies.forEach(function (b) {
                var row = $('<div class="picWaterRow"></div>').appendTo(body);
                $('<span class="picWaterIcon"></span>').appendTo(row).append($('<i></i>').addClass('fas fa-thermometer-half'));
                $('<label class="picWaterLabel"></label>').text(b.name || 'Body').appendTo(row);
                var now = $('<span class="picWaterValue"></span>').text(self._fmt(b.temp, '°') + (makeBool(b.held) ? '*' : '')).appendTo(row);
                if (makeBool(b.held)) now.attr('title', 'The reading taken at the solar pump speed; the sensor reads ' + self._fmt(b.liveTemp, deg) + ' at the speed the pump is running now.');
                var hi = isDay ? b.maxTemp24h : b.maxTemp, lo = isDay ? b.minTemp24h : b.minTemp, avg = isDay ? b.avgTemp24h : b.avgTemp;
                var hiAt = isDay ? b.maxTemp24hAt : b.maxTempAt, loAt = isDay ? b.minTemp24hAt : b.minTempAt, hours = isDay ? b.avgTempHours : b.hours;
                var extra = 'high ' + self._fmt(hi, '°') + ' / low ' + self._fmt(lo, '°') + ' · avg ' + self._fmt(avg, '°');
                var span = isDay ? 'The last 24 hours' : 'The last ' + days + ' days';
                if (typeof hours === 'number' && (typeof shortest === 'undefined' || hours < shortest)) shortest = hours;
                var tip = (typeof hours === 'number' && hours < days * 24 - 0.5 ? 'The last ' + (hours < 48 ? hours.toFixed(1) + ' hours' : (hours / 24).toFixed(1) + ' days') + ' (njsPC has recorded this long so far)' : span)
                    + (hiAt ? '. High at ' + (isDay ? self._time(hiAt) : self._when(hiAt)) : '') + (loAt ? ', low at ' + (isDay ? self._time(loAt) : self._when(loAt)) : '') + '.';
                $('<span class="picWaterExtra"></span>').text(extra).attr('title', tip).appendTo(row);
                var held = isDay && has(b.l);
                if (held) anyHeld = true;
                var series = [];
                if (!isDay && has(b.hi) && has(b.lo)) series.push({ band: { hi: b.hi, lo: b.lo } });
                // The solar levels, from the setpoint of each minute (or hour, or day), so they step where the setpoint was changed: solar stops at
                // the upper one (and a check begins only with the projected reading below it), and after stopping there starts again below the lower one.
                if (typeof b.hysteresis === 'number' && has(b.s)) {
                    anyLevels = true;
                    series.push({ values: b.s.map(function (s) { return typeof s === 'number' ? s + b.hysteresis : null; }), cls: 'picWaterLineLevel', step: true });
                    series.push({ values: b.s.map(function (s) { return typeof s === 'number' ? s - b.hysteresis : null; }), cls: 'picWaterLineLevel', step: true });
                }
                if (has(b.p)) { anyProjected = true; series.push({ values: b.p, cls: 'picWaterLineProjected' }); }
                series.push({ values: b.v });
                if (held) series.push({ values: b.l, cls: 'picWaterLineLive' });
                self._chart(body, (b.name || 'Body') + ' temperature (' + deg + ')', series, b.t, isDay ? { mode: 'day' } : { mode: o.range, days: days });
            });
            var note;
            if (isDay) note = 'One reading a minute while the body is on.';
            else note = (o.range === 'week' ? 'Hourly' : 'Daily') + ' averages while the body is on, with a band from the low to the high of each' + (o.range === 'week' ? ' hour.' : ' day.');
            if (anyHeld) note += ' The faint line is the live reading where the temperature shown is the one taken at the solar pump speed.';
            if (anyProjected) note += ' The dashed line is ' + (isDay ? 'the reading' : 'the average reading') + ' a solar check is expected to see at the solar pump speed (the live reading plus the speed offset the last check measured).';
            if (anyLevels) note += ' The dotted lines are the setpoint plus and minus the solar hysteresis: solar stops at the upper one, and starts again below the lower one after it stopped there.';
            if (!isDay && typeof shortest === 'number' && shortest < days * 24 - 0.5) note += ' njsPC has recorded ' + (shortest < 48 ? shortest.toFixed(1) + ' hours' : (shortest / 24).toFixed(1) + ' days') + ' so far.';
            $('<div class="picWaterNote"></div>').text(note).appendTo(body);
        },
        // The marks of the time scale between t0 and t1 for a view: their times and labels.
        _ticks: function (mode, t0, t1) {
            var self = this, out = [];
            var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            var d0 = new Date(t0);
            if (mode === 'day') {
                var stepMin = self._step((t1 - t0) / 60000, [15, 30, 60, 120, 180, 360, 720], 6);
                var day = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate());
                for (var t = day.getTime(); t <= t1; t += stepMin * 60000) { if (t >= t0) out.push({ t: t, text: self._time(t) }); }
            }
            else if (mode === 'year') {
                for (var m = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); m.getTime() <= t1; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) out.push({ t: m.getTime(), text: names[m.getMonth()] });
            }
            else {
                // Each midnight for a week (named by weekday); for a month each Monday (by date).
                for (var dd = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 1); dd.getTime() <= t1; dd = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate() + 1)) {
                    if (mode === 'week') out.push({ t: dd.getTime(), text: wd[dd.getDay()] });
                    else if (dd.getDay() === 1) out.push({ t: dd.getTime(), text: (dd.getMonth() + 1) + '/' + dd.getDate() });
                }
            }
            return out;
        },
        // A line chart of the readings, placed by time, with a value scale at the left and a time scale under it. A series is `values`
        // (a line; `step` holds each value until the next, for levels) or `band` (`hi` and `lo`, filled between). A missing value, or a
        // step between readings longer than the view allows (the body was off), breaks the line. The day view spans the readings; the
        // longer views span the whole period, so a short record sits at the right.
        _chart: function (parent, label, series, times, opts) {
            var self = this;
            var mode = opts.mode;
            var W = 200, H = 46, pad = 2;
            var gapMs = mode === 'day' ? 5 * 60 * 1000 : mode === 'week' ? 2 * 3600000 + 60000 : 2 * 86400000 + 3600000;
            var n = times.length;
            var min = Infinity, max = -Infinity;
            var see = function (v) { if (typeof v === 'number' && !isNaN(v)) { if (v < min) min = v; if (v > max) max = v; } };
            series.forEach(function (s) { if (s.band) { s.band.hi.forEach(see); s.band.lo.forEach(see); } else s.values.forEach(see); });
            var box = $('<div class="picWaterChart"></div>').appendTo(parent);
            var head = $('<div class="picWaterChartLabel"></div>').appendTo(box);
            $('<span></span>').text(label).appendTo(head);
            var t0, t1;
            if (mode === 'day') { t0 = times[0]; t1 = times[n - 1]; }
            else { t1 = Date.now(); t0 = t1 - opts.days * 86400000; }
            if (n < 2 || min === Infinity || !(t1 > t0)) { $('<div class="picWaterNote"></div>').text('Not enough readings yet.').appendTo(box); return box; }
            $('<span class="picWaterChartRange"></span>').text(min.toFixed(1) + '–' + max.toFixed(1) + '°').appendTo(head);
            if (max - min < 2) { var mid = (max + min) / 2; min = mid - 1; max = mid + 1; }
            var ys = self._step(max - min, [0.5, 1, 2, 5, 10, 20], 4);
            min = Math.floor(min / ys) * ys;
            max = Math.ceil(max / ys) * ys;
            var yTicks = [];
            for (var v = min; v <= max + 1e-9; v += ys) yTicks.push(v);
            var xTicks = self._ticks(mode, t0, t1);
            var ns = 'http://www.w3.org/2000/svg';
            var svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.setAttribute('class', 'picWaterSvg');
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-label', label);
            var y = function (v) { return pad + (H - 2 * pad) * (1 - (v - min) / (max - min)); };
            var xt = function (t) { return W * (t - t0) / (t1 - t0); };
            var x = function (i) { return xt(times[i]); };
            var line = function (x1, y1, x2, y2, cls) {
                var ln = document.createElementNS(ns, 'line');
                ln.setAttribute('x1', x1); ln.setAttribute('x2', x2); ln.setAttribute('y1', y1); ln.setAttribute('y2', y2);
                ln.setAttribute('class', cls);
                svg.appendChild(ln);
            };
            var addPath = function (d, cls) {
                var p = document.createElementNS(ns, 'path');
                p.setAttribute('d', d);
                p.setAttribute('class', cls);
                svg.appendChild(p);
            };
            yTicks.forEach(function (v) { line(0, y(v), W, y(v), 'picWaterGrid'); });
            xTicks.forEach(function (tk) { var xx = xt(tk.t); line(xx, 0, xx, H, 'picWaterGrid'); });
            var num = function (v) { return typeof v === 'number' && !isNaN(v); };
            series.forEach(function (s) {
                if (s.band) {
                    // One filled shape for each run of readings: along the highs, then back along the lows.
                    var run = [], d = '';
                    var flush = function () {
                        if (run.length > 1) {
                            d += 'M' + run.map(function (i) { return x(i).toFixed(1) + ' ' + y(s.band.hi[i]).toFixed(1); }).join('L')
                                + 'L' + run.slice().reverse().map(function (i) { return x(i).toFixed(1) + ' ' + y(s.band.lo[i]).toFixed(1); }).join('L') + 'Z';
                        }
                        run = [];
                    };
                    for (var i = 0; i < n; i++) {
                        if (!num(s.band.hi[i]) || !num(s.band.lo[i])) { flush(); continue; }
                        if (run.length > 0 && times[i] - times[run[run.length - 1]] > gapMs) flush();
                        run.push(i);
                    }
                    flush();
                    addPath(d, 'picWaterBand');
                    return;
                }
                var d = '', pen = false, prev;
                s.values.forEach(function (v, i) {
                    if (!num(v)) { pen = false; return; }
                    if (pen && i > 0 && times[i] - times[i - 1] > gapMs) pen = false;
                    // A level holds until it changes, so a step line runs flat to the change and then jumps.
                    if (pen && s.step && v !== prev) d += 'L' + x(i).toFixed(1) + ' ' + y(prev).toFixed(1);
                    d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
                    pen = true;
                    prev = v;
                });
                addPath(d, 'picWaterLine ' + (s.cls || ''));
            });
            var plot = $('<div class="picWaterPlot"></div>').appendTo(box);
            var ybox = $('<div class="picWaterY"></div>').appendTo(plot);
            yTicks.forEach(function (v) { $('<span></span>').text(String(Math.round(v * 10) / 10)).css('top', (100 * y(v) / H) + '%').appendTo(ybox); });
            var area = $('<div class="picWaterArea"></div>').appendTo(plot);
            area[0].appendChild(svg);
            var xbox = $('<div class="picWaterX"></div>').appendTo(area);
            xTicks.forEach(function (tk) {
                var frac = (tk.t - t0) / (t1 - t0);
                // A mark at the very edge keeps its line but not its label, which would hang outside the chart.
                if (frac < 0.04 || frac > 0.96) return;
                $('<span></span>').text(tk.text).css('left', (100 * frac) + '%').appendTo(xbox);
            });
            return box;
        }
    });
})(jQuery);

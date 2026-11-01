(function ($) {
    // The water temperature of each body from njsPC's GET /state/temps/history: the temperature now, the high, the low and the average,
    // and a chart, over the last 24 hours (Day) or, from njsPC's hourly record, the last 7 days (Week, by hour), 30 days (Month, by day) or
    // year (Year, by day).
    // The periods always end now (they are not calendar periods). The panel stays hidden when njsPC does not have that route or has no
    // readings yet. Where AutoSwg is set up (GET /state/autoSwg/fc), a Temp | FC switch shows instead the FC tests as dots, the FC
    // AutoSwg projected as a line and, where the route sends them, the FC range or target in force at each time; the choice is
    // remembered in this browser.
    $.widget('pic.waterTemp', {
        options: { refreshMs: 60 * 1000, fcRefreshMs: 10 * 60 * 1000, range: 'day' },
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
            try { if (window.localStorage.getItem('picWaterView') === 'fc') o.view = 'fc'; } catch (err) { /* the temperature view */ }
            var views = $('<span class="picWaterViews"></span>').appendTo(title).hide();
            [['temp', 'Temp'], ['fc', 'FC']].forEach(function (v) {
                $('<span class="picWaterTab picWaterView" role="button" tabindex="0"></span>').attr('data-view', v[0]).text(v[1]).appendTo(views);
            });
            views.on('click keydown', 'span.picWaterView', function (evt) {
                if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                evt.preventDefault();
                o.view = $(evt.currentTarget).attr('data-view');
                try { window.localStorage.setItem('picWaterView', o.view); } catch (err) { /* not remembered */ }
                self._showTabs();
                self._render();
            });
            var tabs = $('<span class="picWaterTabs"></span>').appendTo(title);
            self._ranges.forEach(function (r) {
                $('<span class="picWaterTab" role="button" tabindex="0"></span>').attr('data-range', r[0]).text(r[1]).appendTo(tabs);
            });
            tabs.on('click keydown', 'span.picWaterTab:not(.picWaterView)', function (evt) {
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
            el.find('span.picWaterTab:not(.picWaterView)').each(function () { $(this).toggleClass('selected', $(this).attr('data-range') === o.range).attr('aria-pressed', $(this).attr('data-range') === o.range); });
            var fc = self._fcOn();
            el.find('span.picWaterViews').toggle(!!o.fc);
            el.find('span.picWaterView').each(function () { var on = $(this).attr('data-view') === (fc ? 'fc' : 'temp'); $(this).toggleClass('selected', on).attr('aria-pressed', on); });
        },
        // The FC view is shown when it was chosen and the FC can be read.
        _fcOn: function () {
            var o = this.options;
            return o.view === 'fc' && !!o.fc && (Array.isArray(o.fc.tests) || Array.isArray(o.fc.projection));
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
            // The FC tests and projection change a few times a day, so they are asked for when the view changes and every ten minutes.
            // Without AutoSwg the route answers 404 and the chart has no FC.
            if (o.fcRange !== range || !o.fcAt || Date.now() - o.fcAt > o.fcRefreshMs) {
                var days = 1;
                self._ranges.forEach(function (r) { if (r[0] === range) days = r[2]; });
                var fcPath = '/state/autoSwg/fc?days=' + days;
                o.fcRange = range; o.fcAt = Date.now();
                $.ajax({ url: useProxy ? 'njsPC' + fcPath : $('body').attr('data-apiserviceurl') + fcPath, type: 'get', dataType: 'json' })
                    .done(function (data) { if (range !== o.range) return; o.fc = data; self._showTabs(); if (typeof o.history !== 'undefined') self._render(); })
                    .fail(function () { if (range !== o.range) return; o.fc = null; self._showTabs(); if (typeof o.history !== 'undefined') self._render(); });
            }
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
            if (self._fcOn()) { self._renderFc(body, days); return; }
            var anyHeld = false, anyProjected = false, anyLevels = false, anyFc = false, anyOff = false, shortest;
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
                // Readings taken while the body was off (the sensor in the still water of the pipes, which follows the air more than the pool)
                // are recorded but not drawn, so the chart has a gap while the pump is off.
                var main = b.v, off = isDay ? null : b.ov;
                if (isDay && has(b.o)) {
                    off = b.v.map(function (v, i) { return b.o[i] ? v : null; });
                    main = b.v.map(function (v, i) { return b.o[i] ? null : v; });
                }
                if (has(off)) anyOff = true;
                series.push({ values: main });
                if (held) series.push({ values: b.l, cls: 'picWaterLineLive' });
                var copts = isDay ? { mode: 'day' } : { mode: o.range, days: days };
                var c = self._chart(body, (b.name || 'Body') + ' temperature (' + deg + ')', series, b.t, copts);
                if (c && c.attr('data-fc')) anyFc = true;
            });
            var note;
            if (isDay) note = 'One reading a minute while the body is on.';
            else note = (o.range === 'week' ? 'Hourly' : 'Daily') + ' averages while the body is on, with a band from the low to the high of each' + (o.range === 'week' ? ' hour.' : ' day.');
            if (anyHeld) note += ' The faint line is the live reading where the temperature shown is the one taken at the solar pump speed.';
            if (anyProjected) note += ' The dashed line is ' + (isDay ? 'the reading' : 'the average reading') + ' a solar check is expected to see at the solar pump speed (the live reading plus the speed offset the last check measured).';
            if (anyLevels) note += ' The dotted lines are the setpoint plus and minus the solar hysteresis: solar stops at the upper one, and starts again below the lower one after it stopped there.';
            if (anyOff) note += ' Nothing is drawn while the pump is off: the sensor then reads the water standing in the pipes, not the pool.';
            if (anyFc) note += ' FC is on the scale at the right (ppm): the dots are the tests, and the line is the FC AutoSwg projected, through each value it calculated; each new calculation starts a new line.';
            if (!isDay && typeof shortest === 'number' && shortest < days * 24 - 0.5) note += ' njsPC has recorded ' + (shortest < 48 ? shortest.toFixed(1) + ' hours' : (shortest / 24).toFixed(1) + ' days') + ' so far.';
            self._note(body, note);
        },
        // The explanation under a chart, closed until the viewer opens it; the choice is remembered in this browser and survives the redraws.
        _note: function (body, text) {
            var self = this, o = self.options;
            if (typeof o.noteOpen === 'undefined') {
                o.noteOpen = false;
                try { o.noteOpen = window.localStorage.getItem('picWaterNote') === 'open'; } catch (err) { /* closed */ }
            }
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
                try { window.localStorage.setItem('picWaterNote', o.noteOpen ? 'open' : 'closed'); } catch (err) { /* not remembered */ }
                show();
            });
            show();
        },
        // The FC view: the latest test and the high, low and average of the tests in the period, and a chart of the tests as dots and the FC
        // AutoSwg projected as a line through each value it calculated, one line for each calculation run (in the order given: the value
        // it gave when applied, what it expected at each test, and what it expected when the next one replaced it).
        _renderFc: function (body, days) {
            var self = this, o = self.options;
            var now = Date.now(), from = now - days * 86400000;
            var num = function (v) { return typeof v === 'number' && !isNaN(v); };
            var inView = function (p) { return p && num(p.fc) && typeof p.t === 'number' && p.t >= from; };
            var tests = (o.fc.tests || []).filter(inView), proj = (o.fc.projection || []).filter(inView);
            var row = $('<div class="picWaterRow"></div>').appendTo(body);
            $('<span class="picWaterIcon"></span>').appendTo(row).append($('<i></i>').addClass('fas fa-vial'));
            $('<label class="picWaterLabel"></label>').text('FC').appendTo(row);
            var last = tests[tests.length - 1];
            $('<span class="picWaterValue"></span>').text(last ? self._fmt(last.fc, ' ppm') : '--').appendTo(row);
            if (tests.length > 0) {
                var hi = tests[0], lo = tests[0], sum = 0;
                tests.forEach(function (p) { if (p.fc >= hi.fc) hi = p; if (p.fc <= lo.fc) lo = p; sum += p.fc; });
                $('<span class="picWaterExtra"></span>').text('high ' + self._fmt(hi.fc) + ' / low ' + self._fmt(lo.fc) + ' · avg ' + self._fmt(sum / tests.length))
                    .attr('title', tests.length + ' test' + (tests.length === 1 ? '' : 's') + ' in the period; the latest at ' + self._when(last.t) + '. High at ' + self._when(hi.t) + ', low at ' + self._when(lo.t) + '.')
                    .appendTo(row);
            }
            var box = $('<div class="picWaterChart"></div>').appendTo(body);
            var head = $('<div class="picWaterChartLabel"></div>').appendTo(box);
            $('<span></span>').text('FC (ppm)').appendTo(head);
            var pts = tests.concat(proj);
            if (pts.length === 0) { $('<div class="picWaterNote"></div>').text('No FC tests in this period.').appendTo(box); return; }
            var tMin = Infinity, tMax = -Infinity, min = Infinity, max = -Infinity;
            pts.forEach(function (p) { if (p.t < tMin) tMin = p.t; if (p.t > tMax) tMax = p.t; if (p.fc < min) min = p.fc; if (p.fc > max) max = p.fc; });
            $('<span class="picWaterChartRange"></span>').text(min.toFixed(1) + '–' + max.toFixed(1)).appendTo(head);
            // The period, from its first point (with half a day of room) to now; the day view is always its 24 hours.
            var t1 = Math.max(now, tMax), t0 = days === 1 ? from : Math.max(from, tMin - 43200000);
            // The FC range (low and high) or single target in force over the period: each step holds from its time until the next one's.
            // The scale is widened to take them in.
            var steps = [], allSteps = (o.fc.steps || []).filter(function (s) { return s && typeof s.t === 'number'; });
            allSteps.forEach(function (s, i) {
                var a = Math.max(s.t, t0), b = i + 1 < allSteps.length ? Math.min(allSteps[i + 1].t, t1) : t1;
                if (b <= a) return;
                if (num(s.low) && num(s.high)) steps.push({ a: a, b: b, low: Math.min(s.low, s.high), high: Math.max(s.low, s.high) });
                else if (num(s.target)) steps.push({ a: a, b: b, low: s.target, high: s.target });
            });
            steps.forEach(function (s) { if (s.low < min) min = s.low; if (s.high > max) max = s.high; });
            var span = (t1 - t0) / 86400000;
            var mode = span <= 2 ? 'day' : span <= 10 ? 'week' : span <= 62 ? 'month' : 'year';
            if (max - min < 2) { var mid = (max + min) / 2; min = Math.max(0, mid - 1); max = min + 2; }
            var ys = self._step(max - min, [0.5, 1, 2, 5, 10], 4);
            min = Math.floor(min / ys) * ys;
            max = Math.ceil(max / ys) * ys;
            var yTicks = [];
            for (var v = min; v <= max + 1e-9; v += ys) yTicks.push(v);
            var xTicks = self._ticks(mode, t0, t1);
            var W = 200, H = 46, pad = 2, ns = 'http://www.w3.org/2000/svg';
            var svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.setAttribute('class', 'picWaterSvg');
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-label', 'FC (ppm)');
            var y = function (v) { return pad + (H - 2 * pad) * (1 - (v - min) / (max - min)); };
            var x = function (t) { return W * (t - t0) / (t1 - t0); };
            var line = function (x1, y1, x2, y2, cls) {
                var ln = document.createElementNS(ns, 'line');
                ln.setAttribute('x1', x1); ln.setAttribute('x2', x2); ln.setAttribute('y1', y1); ln.setAttribute('y2', y2);
                ln.setAttribute('class', cls);
                svg.appendChild(ln);
            };
            yTicks.forEach(function (v) { line(0, y(v), W, y(v), 'picWaterGrid'); });
            xTicks.forEach(function (tk) { line(x(tk.t), 0, x(tk.t), H, 'picWaterGrid'); });
            // The range as a shaded band with dotted edges, a single target as one dotted line; the edges step where a setting changed.
            if (steps.length > 0) {
                var band = '', edges = '';
                steps.forEach(function (s) {
                    var xa = x(s.a).toFixed(1), xb = x(s.b).toFixed(1), yl = y(s.low).toFixed(1), yh = y(s.high).toFixed(1);
                    if (s.high > s.low) band += 'M' + xa + ' ' + yh + 'L' + xb + ' ' + yh + 'L' + xb + ' ' + yl + 'L' + xa + ' ' + yl + 'Z';
                    edges += 'M' + xa + ' ' + yh + 'L' + xb + ' ' + yh;
                    if (s.high > s.low) edges += 'M' + xa + ' ' + yl + 'L' + xb + ' ' + yl;
                });
                [[band, 'picWaterFcBand'], [edges, 'picWaterFcEdge']].forEach(function (d) {
                    if (!d[0]) return;
                    var path = document.createElementNS(ns, 'path');
                    path.setAttribute('d', d[0]);
                    path.setAttribute('class', d[1]);
                    svg.appendChild(path);
                });
            }
            var runs = {}, order = [];
            proj.forEach(function (p) { var k = String(p.run); if (!runs[k]) { runs[k] = []; order.push(k); } runs[k].push(p); });
            order.forEach(function (k) {
                if (runs[k].length < 2) return;
                var path = document.createElementNS(ns, 'path');
                path.setAttribute('d', runs[k].map(function (p, i) { return (i === 0 ? 'M' : 'L') + x(p.t).toFixed(1) + ' ' + y(p.fc).toFixed(1); }).join(''));
                path.setAttribute('class', 'picWaterFcLine');
                svg.appendChild(path);
            });
            tests.forEach(function (p) {
                var c = document.createElementNS(ns, 'ellipse');
                c.setAttribute('cx', x(p.t).toFixed(1)); c.setAttribute('cy', y(p.fc).toFixed(1));
                c.setAttribute('rx', 1.8); c.setAttribute('ry', 1.8);
                c.setAttribute('class', 'picWaterFcDot');
                svg.appendChild(c);
            });
            var plot = $('<div class="picWaterPlot"></div>').appendTo(box);
            var ybox = $('<div class="picWaterY"></div>').appendTo(plot);
            yTicks.forEach(function (v) { $('<span></span>').text(String(Math.round(v * 10) / 10)).css('top', (100 * y(v) / H) + '%').appendTo(ybox); });
            var area = $('<div class="picWaterArea"></div>').appendTo(plot);
            area[0].appendChild(svg);
            var xbox = $('<div class="picWaterX"></div>').appendTo(area);
            xTicks.forEach(function (tk) {
                var frac = (tk.t - t0) / (t1 - t0);
                if (frac < 0.04 || frac > 0.96) return;
                $('<span></span>').text(tk.text).css('left', (100 * frac) + '%').appendTo(xbox);
            });
            var note = 'The dots are the FC tests (from PoolMath)' + (proj.length > 0 ? ', and the line is the FC AutoSwg projected, through each value it calculated; each new calculation starts a new line.' : '. AutoSwg\'s projected FC appears after its next calculation.');
            if (steps.length > 0) note += ' The shaded band is the FC range in force at the time (FC Low to FC High), and a single dotted line a single target FC (the Target FC, or the Vacation Target FC while Away protection is on); they step where a setting changed.';
            self._note(body, note);
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
            else if (mode === 'dates') {
                // Each day, marked at its noon with its date.
                for (var dn = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 12); dn.getTime() <= t1; dn = new Date(dn.getFullYear(), dn.getMonth(), dn.getDate() + 1, 12)) {
                    if (dn.getTime() >= t0) out.push({ t: dn.getTime(), text: (dn.getMonth() + 1) + '/' + dn.getDate() });
                }
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
        // step between readings longer than the view allows (the body was off), breaks the line. The chart spans the readings, up to the
        // whole period, and the time scale suits the span shown, so a record shorter than the period is not squeezed against the right edge.
        // A reading with none next to it is drawn as a dot.
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
            var t0, t1, at = times;
            // The FC tests and projected values of the period (the last 24 hours for the day view) widen the span, so one taken while the
            // pump was off, or on a day before the first temperature recorded, still shows.
            var fcFrom = Date.now() - (opts.days || 1) * 86400000, fcMin = Infinity, fcMax = -Infinity;
            if (opts.fc) (opts.fc.tests || []).concat(opts.fc.projection || []).forEach(function (p) {
                if (p && typeof p.t === 'number' && typeof p.fc === 'number' && !isNaN(p.fc) && p.t >= fcFrom) { if (p.t < fcMin) fcMin = p.t; if (p.t > fcMax) fcMax = p.t; }
            });
            if (mode === 'day') { t0 = Math.min(times[0], fcMin); t1 = Math.max(times[n - 1], fcMax); }
            else if (mode === 'week') {
                // Hourly rows, each placed at the middle of its hour, with the whole of the first and last hour shown.
                at = times.map(function (t) { return t + 1800000; });
                t1 = Math.max(Date.now(), times[n - 1] + 3600000);
                t0 = Math.max(t1 - opts.days * 86400000, Math.min(times[0], fcMin));
                mode = (t1 - t0) / 86400000 <= 2 ? 'day' : 'week';
            }
            else {
                // Daily rows (a row starts at midnight), each placed at noon of its day, with whole days shown.
                at = times.map(function (t) { return t + 43200000; });
                t1 = Math.max(Date.now(), times[n - 1] + 86400000);
                var fcDay = fcMin === Infinity ? Infinity : new Date(new Date(fcMin).getFullYear(), new Date(fcMin).getMonth(), new Date(fcMin).getDate()).getTime();
                t0 = Math.max(t1 - opts.days * 86400000, Math.min(times[0], fcDay));
                var spanDays = (t1 - t0) / 86400000;
                mode = spanDays <= 10 ? 'dates' : spanDays <= 62 ? 'month' : 'year';
            }
            if (n < (opts.mode === 'day' ? 2 : 1) || min === Infinity || !(t1 > t0)) { $('<div class="picWaterNote"></div>').text('Not enough readings yet.').appendTo(box); return box; }
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
            var x = function (i) { return xt(at[i]); };
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
                    // One filled shape for each run of readings: along the highs, then back along the lows. A lone row is a bar from its low to its high.
                    var run = [], d = '';
                    var flush = function () {
                        if (run.length === 1) line(x(run[0]), y(s.band.hi[run[0]]), x(run[0]), y(s.band.lo[run[0]]), 'picWaterBandBar');
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
                var alone = function (i) {
                    var before = i > 0 && num(s.values[i - 1]) && times[i] - times[i - 1] <= gapMs;
                    var after = i < n - 1 && num(s.values[i + 1]) && times[i + 1] - times[i] <= gapMs;
                    return !before && !after;
                };
                s.values.forEach(function (v, i) {
                    if (num(v) && !s.step && alone(i)) {
                        var c = document.createElementNS(ns, 'ellipse');
                        c.setAttribute('cx', x(i).toFixed(1)); c.setAttribute('cy', y(v).toFixed(1));
                        c.setAttribute('rx', 1.5); c.setAttribute('ry', 1.5);
                        c.setAttribute('class', 'picWaterDot ' + (s.cls || ''));
                        svg.appendChild(c);
                    }
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
            // FC on its own scale at the right: the projection as a line for each calculation run (in the order given: the value it gave when
            // applied, what it expected at each test, and what it expected when the next one replaced it), and the tests as dots.
            var fcTicks = [], yf;
            if (opts.fc) {
                var inView = function (p) { return p && num(p.fc) && typeof p.t === 'number' && p.t >= t0 && p.t <= t1; };
                var tests = (opts.fc.tests || []).filter(inView), proj = (opts.fc.projection || []).filter(inView);
                if (tests.length + proj.length > 0) {
                    var fmin = Infinity, fmax = -Infinity;
                    tests.concat(proj).forEach(function (p) { if (p.fc < fmin) fmin = p.fc; if (p.fc > fmax) fmax = p.fc; });
                    if (fmax - fmin < 2) { var fmid = (fmax + fmin) / 2; fmin = Math.max(0, fmid - 1); fmax = fmin + 2; }
                    var fs = self._step(fmax - fmin, [0.5, 1, 2, 5, 10], 4);
                    fmin = Math.floor(fmin / fs) * fs;
                    fmax = Math.ceil(fmax / fs) * fs;
                    for (var fv = fmin; fv <= fmax + 1e-9; fv += fs) fcTicks.push(fv);
                    yf = function (v) { return pad + (H - 2 * pad) * (1 - (v - fmin) / (fmax - fmin)); };
                    var runs = {}, order = [];
                    proj.forEach(function (p) { var k = String(p.run); if (!runs[k]) { runs[k] = []; order.push(k); } runs[k].push(p); });
                    order.forEach(function (k) {
                        var pts = runs[k];
                        if (pts.length === 1) return;
                        addPath(pts.map(function (p, i) { return (i === 0 ? 'M' : 'L') + xt(p.t).toFixed(1) + ' ' + yf(p.fc).toFixed(1); }).join(''), 'picWaterFcLine');
                    });
                    tests.forEach(function (p) {
                        var c = document.createElementNS(ns, 'ellipse');
                        c.setAttribute('cx', xt(p.t).toFixed(1)); c.setAttribute('cy', yf(p.fc).toFixed(1));
                        c.setAttribute('rx', 1.8); c.setAttribute('ry', 1.8);
                        c.setAttribute('class', 'picWaterFcDot');
                        svg.appendChild(c);
                    });
                    box.attr('data-fc', '1');
                    head.find('span:first').append($('<span class="picWaterFcLabel"></span>').text(' · FC (ppm)'));
                }
            }
            var plot = $('<div class="picWaterPlot"></div>').appendTo(box);
            var ybox = $('<div class="picWaterY"></div>').appendTo(plot);
            yTicks.forEach(function (v) { $('<span></span>').text(String(Math.round(v * 10) / 10)).css('top', (100 * y(v) / H) + '%').appendTo(ybox); });
            var area = $('<div class="picWaterArea"></div>').appendTo(plot);
            area[0].appendChild(svg);
            if (fcTicks.length > 0) {
                var fbox = $('<div class="picWaterY picWaterYR"></div>').appendTo(plot);
                fcTicks.forEach(function (v) { $('<span></span>').text(String(Math.round(v * 10) / 10)).css('top', (100 * yf(v) / H) + '%').appendTo(fbox); });
            }
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

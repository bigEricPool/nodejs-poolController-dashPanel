(function ($) {
    // The water temperature of each body over the last 24 hours, from njsPC's GET /state/temps/history: the temperature now, the high,
    // the low and the average, and a chart. The 24 hours always end now (they are not a calendar day). The panel stays hidden when njsPC
    // does not have that route or has no readings yet.
    $.widget('pic.waterTemp', {
        options: { refreshMs: 60 * 1000 },
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
            $('<span class="picWaterSpan">last 24 hours</span>').appendTo(title);
            $('<div class="picWaterBody"></div>').appendTo(el);
            self._load();
            o.timer = setInterval(function () { self._load(); }, o.refreshMs);
        },
        // A request that stays quiet when it fails: an njsPC without the history answers 404, and that is not an error to show.
        _load: function () {
            var self = this, o = self.options, el = self.element;
            var useProxy = makeBool($('body').attr('data-apiproxy'));
            var url = useProxy ? 'njsPC/state/temps/history' : $('body').attr('data-apiserviceurl') + '/state/temps/history';
            $.ajax({ url: url, type: 'get', dataType: 'json' })
                .done(function (data) { o.history = data; self._render(); })
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
        _step: function (span, steps, most) {
            for (var i = 0; i < steps.length; i++) if (span / steps[i] <= most) return steps[i];
            return steps[steps.length - 1];
        },
        _render: function () {
            var self = this, o = self.options, el = self.element;
            var h = o.history;
            var bodies = h && Array.isArray(h.bodies) ? h.bodies.filter(function (b) { return Array.isArray(b.t) && b.t.length > 0; }) : [];
            if (bodies.length === 0) { el.addClass('picWaterOff'); return; }
            el.removeClass('picWaterOff');
            var units = $('div.picBodies:first').attr('data-unitsname') || '';
            var deg = '°' + units;
            var body = el.find('div.picWaterBody').empty();
            var anyHeld = false;
            bodies.forEach(function (b) {
                var row = $('<div class="picWaterRow"></div>').appendTo(body);
                $('<span class="picWaterIcon"></span>').appendTo(row).append($('<i></i>').addClass('fas fa-thermometer-half'));
                $('<label class="picWaterLabel"></label>').text(b.name || 'Body').appendTo(row);
                var now = $('<span class="picWaterValue"></span>').text(self._fmt(b.temp, '°') + (makeBool(b.held) ? '*' : '')).appendTo(row);
                if (makeBool(b.held)) now.attr('title', 'The reading taken at the solar pump speed; the sensor reads ' + self._fmt(b.liveTemp, deg) + ' at the speed the pump is running now.');
                var extra = 'high ' + self._fmt(b.maxTemp24h, '°') + ' / low ' + self._fmt(b.minTemp24h, '°') + ' · avg ' + self._fmt(b.avgTemp24h, '°');
                var tip = (typeof b.avgTempHours === 'number' && b.avgTempHours < 24 ? 'The last ' + b.avgTempHours.toFixed(1) + ' hours (njsPC has recorded this long so far)' : 'The last 24 hours')
                    + (b.maxTemp24hAt ? '. High at ' + self._time(b.maxTemp24hAt) : '') + (b.minTemp24hAt ? ', low at ' + self._time(b.minTemp24hAt) : '') + '.';
                $('<span class="picWaterExtra"></span>').text(extra).attr('title', tip).appendTo(row);
                var held = b.l.some(function (v) { return typeof v === 'number'; });
                if (held) anyHeld = true;
                var series = [{ values: b.v }];
                if (held) series.push({ values: b.l, cls: 'picWaterLineLive' });
                self._chart(body, (b.name || 'Body') + ' temperature (' + deg + ')', series, b.t);
            });
            var note = 'One reading a minute while the body is on.';
            if (anyHeld) note += ' The faint line is the live reading where the temperature shown is the one taken at the solar pump speed.';
            $('<div class="picWaterNote"></div>').text(note).appendTo(body);
        },
        // A line chart of the readings, placed by time, with a value scale at the left and a time scale under it. A missing value, or a
        // step of more than five minutes between readings (the body was off), breaks the line.
        _chart: function (parent, label, series, times) {
            var self = this;
            var W = 200, H = 46, pad = 2, gapMs = 5 * 60 * 1000;
            var n = times.length;
            var min = Infinity, max = -Infinity;
            series.forEach(function (s) { s.values.forEach(function (v) { if (typeof v === 'number' && !isNaN(v)) { if (v < min) min = v; if (v > max) max = v; } }); });
            var box = $('<div class="picWaterChart"></div>').appendTo(parent);
            var head = $('<div class="picWaterChartLabel"></div>').appendTo(box);
            $('<span></span>').text(label).appendTo(head);
            if (n < 2 || min === Infinity || !(times[n - 1] > times[0])) { $('<div class="picWaterNote"></div>').text('Not enough readings yet.').appendTo(box); return box; }
            $('<span class="picWaterChartRange"></span>').text(min.toFixed(1) + '–' + max.toFixed(1) + '°').appendTo(head);
            if (max - min < 2) { var mid = (max + min) / 2; min = mid - 1; max = mid + 1; }
            var ys = self._step(max - min, [0.5, 1, 2, 5, 10, 20], 4);
            min = Math.floor(min / ys) * ys;
            max = Math.ceil(max / ys) * ys;
            var yTicks = [];
            for (var v = min; v <= max + 1e-9; v += ys) yTicks.push(v);
            var t0 = times[0], t1 = times[n - 1];
            var stepMin = self._step((t1 - t0) / 60000, [15, 30, 60, 120, 180, 360, 720], 6);
            var d0 = new Date(t0), day = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate());
            var xTicks = [];
            for (var t = day.getTime(); t <= t1; t += stepMin * 60000) { if (t >= t0) xTicks.push(t); }
            var ns = 'http://www.w3.org/2000/svg';
            var svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.setAttribute('class', 'picWaterSvg');
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-label', label);
            var y = function (v) { return pad + (H - 2 * pad) * (1 - (v - min) / (max - min)); };
            var x = function (i) { return W * (times[i] - t0) / (t1 - t0); };
            var line = function (x1, y1, x2, y2, cls) {
                var ln = document.createElementNS(ns, 'line');
                ln.setAttribute('x1', x1); ln.setAttribute('x2', x2); ln.setAttribute('y1', y1); ln.setAttribute('y2', y2);
                ln.setAttribute('class', cls);
                svg.appendChild(ln);
            };
            yTicks.forEach(function (v) { line(0, y(v), W, y(v), 'picWaterGrid'); });
            xTicks.forEach(function (t) { var xx = W * (t - t0) / (t1 - t0); line(xx, 0, xx, H, 'picWaterGrid'); });
            series.forEach(function (s) {
                var d = '', pen = false;
                s.values.forEach(function (v, i) {
                    if (typeof v !== 'number' || isNaN(v)) { pen = false; return; }
                    if (pen && i > 0 && times[i] - times[i - 1] > gapMs) pen = false;
                    d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
                    pen = true;
                });
                var p = document.createElementNS(ns, 'path');
                p.setAttribute('d', d);
                p.setAttribute('class', 'picWaterLine ' + (s.cls || ''));
                svg.appendChild(p);
            });
            var plot = $('<div class="picWaterPlot"></div>').appendTo(box);
            var ybox = $('<div class="picWaterY"></div>').appendTo(plot);
            yTicks.forEach(function (v) { $('<span></span>').text(String(Math.round(v * 10) / 10)).css('top', (100 * y(v) / H) + '%').appendTo(ybox); });
            var area = $('<div class="picWaterArea"></div>').appendTo(plot);
            area[0].appendChild(svg);
            var xbox = $('<div class="picWaterX"></div>').appendTo(area);
            xTicks.forEach(function (t) {
                var frac = (t - t0) / (t1 - t0);
                // A mark at the very edge keeps its line but not its label, which would hang outside the chart.
                if (frac < 0.04 || frac > 0.96) return;
                $('<span></span>').text(self._time(t)).css('left', (100 * frac) + '%').appendTo(xbox);
            });
            return box;
        }
    });
})(jQuery);

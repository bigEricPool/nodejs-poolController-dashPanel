(function ($) {
    // The condition of the computer njsPC runs on (njsPC's /state/system): processor temperature, processor and memory use, storage, Wi-Fi,
    // power and heat warnings, the installed software and other services, with the last hour as small charts. The buttons in the title switch
    // to the longer record njsPC keeps (/state/system/log). The panel stays hidden when njsPC has no system status or it is turned off.
    $.widget('pic.systemStatus', {
        options: { refreshMs: 30 * 1000, view: 'now' },
        _create: function () {
            var self = this, o = self.options, el = self.element;
            el[0].initSystem = function (data) { self._initSystem(data); };
            el.addClass('picSystemOff');
        },
        _destroy: function () {
            var self = this, o = self.options;
            if (o.timer) clearInterval(o.timer);
            o.timer = null;
        },
        _initSystem: function (data) {
            var self = this, o = self.options, el = self.element;
            if (o.timer) clearInterval(o.timer);
            o.timer = null;
            el.empty();
            // Called without data when the dashboard is being cleared.
            if (typeof data === 'undefined') { el.addClass('picSystemOff'); return; }
            var title = $('<div class="picCircuitTitle control-panel-title"></div>').appendTo(el);
            $('<span class="picCircuitTitle">System</span>').appendTo(title);
            $('<span class="picSystemBadge"></span>').appendTo(title).hide();
            var tabs = $('<span class="picSystemTabs"></span>').appendTo(title);
            [['now', 'Now'], ['1', 'Day'], ['7', 'Week'], ['30', 'Month']].forEach(function (t) {
                $('<span class="picSystemTab" role="button" tabindex="0"></span>').attr('data-view', t[0]).text(t[1]).appendTo(tabs);
            });
            tabs.on('click keydown', 'span.picSystemTab', function (evt) {
                if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                evt.preventDefault();
                o.view = $(evt.currentTarget).attr('data-view');
                self._render();
                if (o.view !== 'now') self._loadLog();
            });
            $('<div class="picSystemBody"></div>').appendTo(el);
            self._load();
            // Nothing is asked for while the page is not being looked at.
            o.timer = setInterval(function () { if (!document.hidden) self._load(); }, o.refreshMs);
        },
        _url: function (path) {
            return makeBool($('body').attr('data-apiproxy')) ? 'njsPC' + path : $('body').attr('data-apiserviceurl') + path;
        },
        // A request that stays quiet when it fails: an njsPC without the system status answers 404, and that is not an error to show.
        _load: function () {
            var self = this, o = self.options, el = self.element;
            $.ajax({ url: self._url('/state/system'), type: 'get', dataType: 'json' })
                .done(function (data) { o.status = data; self._render(); })
                .fail(function () { if (typeof o.status === 'undefined') el.addClass('picSystemOff'); });
        },
        _loadLog: function () {
            var self = this, o = self.options;
            var days = o.view;
            $.ajax({ url: self._url('/state/system/log?days=' + encodeURIComponent(days)), type: 'get', dataType: 'json' })
                .done(function (data) { o.logs = o.logs || {}; o.logs[days] = data; if (o.view === days) self._render(); });
        },
        _num: function (v, places, unit) {
            if (typeof v !== 'number' || isNaN(v)) return '--';
            return v.toFixed(places) + (unit || '');
        },
        _bytes: function (v) {
            if (typeof v !== 'number' || isNaN(v)) return '--';
            if (v >= 1073741824) return (v / 1073741824).toFixed(v >= 10737418240 ? 0 : 1) + ' GB';
            return Math.round(v / 1048576) + ' MB';
        },
        _duration: function (sec) {
            if (typeof sec !== 'number' || isNaN(sec)) return '--';
            var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
            if (d > 0) return d + ' d ' + h + ' h';
            if (h > 0) return h + ' h ' + m + ' min';
            return m + ' min';
        },
        _time: function (t, withDate) {
            if (typeof t !== 'number') return '';
            var d = new Date(t);
            var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
            return withDate ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm : hm;
        },
        _flagName: function (e) {
            return { underVoltage: 'Supply voltage too low', frequencyCapped: 'Processor speed capped', throttled: 'Processor slowed down', softTempLimit: 'Soft temperature limit' }[e] || e;
        },
        // The smallest of `steps` that needs no more than `most` marks over `span`.
        _step: function (span, steps, most) {
            for (var i = 0; i < steps.length; i++) if (span / steps[i] <= most) return steps[i];
            return steps[steps.length - 1];
        },
        // A line chart of one or more series. A series is { values, cls }; a missing value breaks its line. Options: `times` (the time of each
        // value, which places the values by time and adds a time scale), `gapMs` (a longer step between two times breaks the line), `axes` (a
        // value scale at the left with round marks), `mark` (a dashed line at that value when it is inside the range shown).
        _chart: function (parent, label, series, opts) {
            opts = opts || {};
            var self = this;
            var W = 200, H = 46, pad = 2;
            var min = Infinity, max = -Infinity, n = 0;
            series.forEach(function (s) {
                n = Math.max(n, s.values.length);
                s.values.forEach(function (v) { if (typeof v === 'number' && !isNaN(v)) { if (v < min) min = v; if (v > max) max = v; } });
            });
            var box = $('<div class="picSystemChart"></div>').appendTo(parent);
            var head = $('<div class="picSystemChartLabel"></div>').appendTo(box);
            $('<span></span>').text(label).appendTo(head);
            if (n < 2 || min === Infinity) { $('<div class="picSystemNote"></div>').text('Not enough readings yet.').appendTo(box); return box; }
            if (typeof opts.min === 'number') min = Math.min(min, opts.min);
            if (typeof opts.max === 'number') max = Math.max(max, opts.max);
            $('<span class="picSystemChartRange"></span>').text(min.toFixed(opts.places || 0) + '–' + max.toFixed(opts.places || 0) + (opts.unit || '')).appendTo(head);
            if (max - min < (opts.span || 1)) { var mid = (max + min) / 2; min = mid - (opts.span || 1) / 2; max = mid + (opts.span || 1) / 2; }
            // Widening a narrow range does not take the scale below the lowest value the chart can have.
            if (typeof opts.min === 'number' && min < opts.min) { max += opts.min - min; min = opts.min; }
            var yTicks = [];
            if (opts.axes) {
                var ys = self._step(max - min, [1, 2, 5, 10, 20, 25, 50, 100], 4);
                min = Math.floor(min / ys) * ys;
                max = Math.ceil(max / ys) * ys;
                for (var v = min; v <= max + 1e-9; v += ys) yTicks.push(v);
            }
            var times = opts.times && opts.times.length === n && opts.times[n - 1] > opts.times[0] ? opts.times : undefined;
            var t0 = times ? times[0] : 0, t1 = times ? times[n - 1] : n - 1;
            var xTicks = [], stepMin = 0;
            if (times) {
                stepMin = self._step((t1 - t0) / 60000, [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080], opts.xTicks || 6);
                // The marks fall on round local times: whole days at midnight, shorter steps counted from the start of the first day.
                var d0 = new Date(t0), day = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate());
                if (stepMin >= 1440) {
                    while (day.getTime() <= t1) { if (day.getTime() >= t0) xTicks.push(day.getTime()); day.setDate(day.getDate() + stepMin / 1440); }
                }
                else for (var t = day.getTime(); t <= t1; t += stepMin * 60000) { if (t >= t0) xTicks.push(t); }
            }
            var ns = 'http://www.w3.org/2000/svg';
            var svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.setAttribute('class', 'picSystemSvg');
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-label', label);
            var y = function (v) { return pad + (H - 2 * pad) * (1 - (v - min) / (max - min)); };
            var x = function (i) { return W * ((times ? times[i] : i) - t0) / (t1 - t0); };
            var line = function (x1, y1, x2, y2, cls) {
                var ln = document.createElementNS(ns, 'line');
                ln.setAttribute('x1', x1); ln.setAttribute('x2', x2); ln.setAttribute('y1', y1); ln.setAttribute('y2', y2);
                ln.setAttribute('class', cls);
                svg.appendChild(ln);
            };
            yTicks.forEach(function (v) { line(0, y(v), W, y(v), 'picSystemGrid'); });
            xTicks.forEach(function (t) { var xx = W * (t - t0) / (t1 - t0); line(xx, 0, xx, H, 'picSystemGrid'); });
            if (typeof opts.mark === 'number' && opts.mark > min && opts.mark < max) line(0, y(opts.mark), W, y(opts.mark), 'picSystemMark');
            series.forEach(function (s) {
                var d = '', pen = false;
                s.values.forEach(function (v, i) {
                    if (typeof v !== 'number' || isNaN(v)) { pen = false; return; }
                    if (pen && times && typeof opts.gapMs === 'number' && i > 0 && times[i] - times[i - 1] > opts.gapMs) pen = false;
                    d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
                    pen = true;
                });
                var p = document.createElementNS(ns, 'path');
                p.setAttribute('d', d);
                p.setAttribute('class', 'picSystemLine ' + (s.cls || ''));
                svg.appendChild(p);
            });
            var plot = $('<div class="picSystemPlot"></div>').appendTo(box);
            if (opts.axes) {
                var ybox = $('<div class="picSystemY"></div>').appendTo(plot);
                yTicks.forEach(function (v) { $('<span></span>').text(String(Math.round(v * 10) / 10)).css('top', (100 * y(v) / H) + '%').appendTo(ybox); });
            }
            var area = $('<div class="picSystemArea"></div>').appendTo(plot);
            area[0].appendChild(svg);
            if (xTicks.length > 0) {
                var xbox = $('<div class="picSystemX"></div>').appendTo(area);
                xTicks.forEach(function (t) {
                    var frac = (t - t0) / (t1 - t0);
                    // A mark at the very edge keeps its line but not its label, which would hang outside the chart.
                    if (frac < 0.04 || frac > 0.96) return;
                    var dt = new Date(t);
                    var txt = stepMin >= 1440 || (dt.getHours() === 0 && dt.getMinutes() === 0) ? (dt.getMonth() + 1) + '/' + dt.getDate() : self._time(t);
                    $('<span></span>').text(txt).css('left', (100 * frac) + '%').appendTo(xbox);
                });
            }
            return box;
        },
        _tile: function (parent, label, value, extra) {
            var t = $('<div class="picSystemTile"></div>').appendTo(parent);
            $('<div class="picSystemTileLabel"></div>').text(label).appendTo(t);
            $('<div class="picSystemTileValue"></div>').text(value).appendTo(t);
            $('<div class="picSystemTileExtra"></div>').text(extra || '').appendTo(t);
            return t;
        },
        _row: function (parent, label, value, cls) {
            var r = $('<div class="picSystemRow"></div>').appendTo(parent);
            $('<label></label>').text(label).appendTo(r);
            $('<span></span>').text(value).addClass(cls || '').appendTo(r);
            return r;
        },
        // The branch and commit of one piece of software, and under them where it comes from and whether files differ from the commit.
        _softwareText: function (sw) {
            var parts = [];
            if (sw.branch) parts.push(sw.branch);
            if (sw.commit) parts.push(sw.commit.substring(0, 8));
            else if (sw.version) parts.push('version ' + sw.version);
            return parts.join('  ');
        },
        _softwareNote: function (sw) {
            var parts = [];
            if (sw.fork) parts.push(sw.fork);
            if (typeof sw.modified === 'number' && sw.modified > 0) parts.push(sw.modified + ' modified file' + (sw.modified === 1 ? '' : 's'));
            else if (typeof sw.modified !== 'number' && typeof sw.changed === 'number' && sw.changed > 0) parts.push(sw.changed + ' changed or extra file' + (sw.changed === 1 ? '' : 's'));
            return parts.join(', ');
        },
        // Periods of one flag that follow each other within half an hour become one entry: a reading that hovers at its limit turns the flag on
        // and off many times, and that is one event to the person reading it. The newest entry comes first.
        _groupPeriods: function (periods) {
            var groups = [], last = {};
            periods.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (p) {
                var end = typeof p.end === 'number' ? p.end : p.start;
                var open = typeof p.end !== 'number' && !p.brief;
                var g = last[p.e];
                if (g && p.start - g.end <= 30 * 60000) {
                    g.count++;
                    g.end = Math.max(g.end, end);
                    g.open = open;
                    g.brief = g.brief && !!p.brief;
                    if (typeof p.tempStart === 'number' && (typeof g.temp !== 'number' || p.tempStart > g.temp)) g.temp = p.tempStart;
                }
                else {
                    g = { e: p.e, start: p.start, end: end, count: 1, temp: p.tempStart, brief: !!p.brief, open: open };
                    last[p.e] = g;
                    groups.push(g);
                }
            });
            return groups.sort(function (a, b) { return b.start - a.start; });
        },
        _softwareRow: function (parent, label, sw, extra, cls) {
            var self = this;
            var r = self._row(parent, label, self._softwareText(sw) + (extra || ''), cls);
            var note = self._softwareNote(sw);
            if (note) $('<div class="picSystemSub"></div>').text(note).appendTo(parent);
            if (sw.subject) r.attr('title', (sw.date ? sw.date.substring(0, 10) + '  ' : '') + sw.subject);
            return r;
        },
        _render: function () {
            var self = this, o = self.options, el = self.element;
            var s = o.status;
            if (!s || !makeBool(s.enabled)) { el.addClass('picSystemOff'); return; }
            el.removeClass('picSystemOff');
            el.find('span.picSystemTab').each(function () { $(this).toggleClass('selected', $(this).attr('data-view') === o.view).attr('aria-pressed', $(this).attr('data-view') === o.view); });
            var warnings = s.warnings || [];
            var alert = warnings.filter(function (w) { return w.level === 'alert'; }).length > 0;
            var badge = el.find('span.picSystemBadge');
            if (warnings.length > 0) badge.text(warnings.length + (warnings.length === 1 ? ' warning' : ' warnings')).toggleClass('picSystemAlert', alert).show();
            else badge.hide();
            var body = el.find('div.picSystemBody').empty();
            if (o.view === 'now') self._renderNow(body, s);
            else self._renderLog(body, s, o.view);
        },
        _renderNow: function (body, s) {
            var self = this;
            (s.warnings || []).forEach(function (w) {
                var line = $('<div class="picSystemWarning"></div>').toggleClass('picSystemAlert', w.level === 'alert').appendTo(body);
                $('<i class="fas fa-exclamation-triangle"></i>').appendTo(line);
                $('<span></span>').text(' ' + w.message).appendTo(line);
            });
            var day = s.day || {};
            var tiles = $('<div class="picSystemTiles"></div>').appendTo(body);
            self._tile(tiles, 'Processor', self._num(s.cpuTemp, 1, ' C'), typeof day.tempMax === 'number' ? day.hours + ' h max ' + self._num(day.tempMax, 1) : '');
            self._tile(tiles, 'Processor use', self._num(s.cpuUse, 0, '%'), s.load ? 'load ' + s.load.map(function (v) { return v.toFixed(2); }).join(' ') : '');
            self._tile(tiles, 'Memory', self._num(s.memUse, 0, '%'), typeof s.memAvailable === 'number' ? self._bytes(s.memAvailable) + ' free of ' + self._bytes(s.memTotal) : '');
            self._tile(tiles, 'Storage', s.storage ? self._num(s.storage.use, 0, '%') : '--', s.storage ? self._bytes(s.storage.free) + ' free' : '');
            var h = s.history;
            if (h && h.t && h.t.length > 1) {
                var charts = $('<div class="picSystemCharts picSystemChartsWide picSystemChartsNow"></div>').appendTo(body);
                var mins = Math.max(1, Math.round((h.t[h.t.length - 1] - h.t[0]) / 60000));
                var gap = (h.sampleSeconds || 10) * 3000;
                if (h.temp.some(function (v) { return typeof v === 'number'; })) self._chart(charts, 'Temperature (C)', [{ values: h.temp }], { unit: ' C', span: 4, mark: 60, axes: true, times: h.t, gapMs: gap });
                self._chart(charts, 'Processor use (%)', [{ values: h.cpu }], { unit: '%', min: 0, span: 10, axes: true, times: h.t, gapMs: gap });
                self._chart(charts, 'Memory (%)', [{ values: h.mem }], { unit: '%', span: 10, axes: true, times: h.t, gapMs: gap });
                $('<div class="picSystemNote"></div>').text('The last ' + (mins >= 60 ? Math.round(mins / 60) + ' h' : mins + ' min') + '. A dashed line marks 60 C when the chart reaches it.').appendTo(body);
            }
            var rows = $('<div class="picSystemRows"></div>').appendTo(body);
            var info = s.info || {};
            if (info.model) self._row(rows, 'Model', info.model);
            if (info.os) self._row(rows, 'System', info.os + (info.arch ? ', ' + info.arch : ''));
            if (info.storageDevice && (info.storageDevice.name || info.storageDevice.date)) self._row(rows, 'Card', [info.storageDevice.name, info.storageDevice.date ? 'made ' + info.storageDevice.date : ''].filter(function (x) { return x; }).join(', ') + (s.storage ? ', ' + self._bytes(s.storage.total) : ''));
            if (s.wifi) self._row(rows, 'Wi-Fi', typeof s.wifi.signal === 'number' ? s.wifi.signal + ' dBm' : typeof s.wifi.quality === 'number' ? 'quality ' + s.wifi.quality : s.wifi.iface);
            self._row(rows, 'Uptime', self._duration(s.uptime) + ', njsPC ' + self._duration(s.appUptime));
            if (s.throttled) {
                var t = s.throttled, bad = t.now.underVoltage || t.sinceBoot.underVoltage;
                self._row(rows, 'Power', t.now.underVoltage ? 'Supply voltage too low now' : t.sinceBoot.underVoltage ? 'Supply voltage was too low since start' : 'No low voltage since start', bad ? 'picSystemWarn' : 'picSystemGood');
            }
            if (typeof day.lagMax === 'number') self._row(rows, 'Longest pause', (day.lagMax / 1000).toFixed(1) + ' s' + (day.lagMax >= 1000 && day.lagMaxAt ? ' at ' + self._time(day.lagMaxAt) : '') + ' in ' + day.hours + ' h', day.lagMax >= 5000 ? 'picSystemWarn' : '');
            var software = s.software || [];
            if (software.length > 0) {
                var sw = $('<div class="picSystemRows picSystemSoftware"></div>').appendTo(body);
                software.forEach(function (x) {
                    var stale = x.runningCommit && x.commit && x.runningCommit !== x.commit;
                    self._softwareRow(sw, x.name, x, stale ? '  running ' + x.runningCommit.substring(0, 8) : '', stale ? 'picSystemWarn' : '');
                });
            }
            var services = s.services || [];
            if (services.length > 0) {
                var chips = $('<div class="picSystemChips"></div>').appendTo(body);
                services.forEach(function (svc) {
                    $('<span class="picSystemChip"></span>').addClass(svc.isUp ? 'picSystemUp' : 'picSystemDown').text(svc.name + (svc.isUp ? '' : ' not answering')).appendTo(chips);
                });
            }
        },
        _renderLog: function (body, s, days) {
            var self = this, o = self.options;
            var log = o.logs ? o.logs[days] : undefined;
            if (!log) { $('<div class="picSystemNote"></div>').text('Reading the record...').appendTo(body); return; }
            var rows = log.rows || [];
            if (rows.length === 0) { $('<div class="picSystemNote"></div>').text('Nothing has been logged for this period yet.').appendTo(body); }
            else {
                var tempMax = -Infinity, tempMaxAt, lagMax = 0, lagMaxAt, tempSum = 0, tempN = 0;
                rows.forEach(function (r) {
                    if (typeof r.tempMax === 'number' && r.tempMax > tempMax) { tempMax = r.tempMax; tempMaxAt = r.t; }
                    if (typeof r.temp === 'number') { tempSum += r.temp * (r.n || 1); tempN += (r.n || 1); }
                    if (typeof r.lag === 'number' && r.lag > lagMax) { lagMax = r.lag; lagMaxAt = r.t; }
                });
                var tiles = $('<div class="picSystemTiles picSystemTiles3"></div>').appendTo(body);
                self._tile(tiles, 'Highest', tempMax === -Infinity ? '--' : tempMax.toFixed(1) + ' C', tempMaxAt ? self._time(tempMaxAt, true) : '');
                self._tile(tiles, 'Average', tempN > 0 ? (tempSum / tempN).toFixed(1) + ' C' : '--', '');
                self._tile(tiles, 'Longest pause', (lagMax / 1000).toFixed(1) + ' s', lagMax >= 1000 && lagMaxAt ? self._time(lagMaxAt, true) : '');
                var charts = $('<div class="picSystemCharts picSystemChartsWide"></div>').appendTo(body);
                var times = rows.map(function (r) { return r.t; }), gap = (log.rowMinutes || 5) * 60000 * 2.5;
                self._chart(charts, 'Temperature (C), average and highest', [{ values: rows.map(function (r) { return r.tempMax; }), cls: 'picSystemLineMax' }, { values: rows.map(function (r) { return r.temp; }) }], { unit: ' C', span: 4, mark: 60, axes: true, times: times, gapMs: gap });
                self._chart(charts, 'Processor use (%), average and highest', [{ values: rows.map(function (r) { return r.cpuMax; }), cls: 'picSystemLineMax' }, { values: rows.map(function (r) { return r.cpu; }) }], { unit: '%', min: 0, span: 10, axes: true, times: times, gapMs: gap });
            }
            var periods = log.periods || [];
            var list = $('<div class="picSystemRows"></div>').appendTo(body);
            if (periods.length === 0) self._row(list, 'Power and heat', 'No flag came on in this period', 'picSystemGood');
            else {
                // No more than fit a panel.
                var groups = self._groupPeriods(periods);
                groups.slice(0, 12).forEach(function (g) {
                    var how;
                    if (g.count > 1) how = g.count + ' times until ' + self._time(g.end, true) + (g.open ? ', the last with no end recorded' : '');
                    else how = g.brief ? 'briefly' : g.open ? 'no end recorded' : 'for ' + self._duration(Math.max(60, Math.round((g.end - g.start) / 1000)));
                    self._row(list, self._time(g.start, true), self._flagName(g.e) + ', ' + how + (typeof g.temp === 'number' ? ' (' + (g.count > 1 ? 'up to ' : '') + g.temp.toFixed(1) + ' C)' : ''), 'picSystemWarn');
                });
                if (groups.length > 12) $('<div class="picSystemNote"></div>').text((groups.length - 12) + ' earlier ones are not shown.').appendTo(body);
            }
            var software = (log.software || []).filter(function (x) { return !x.start; });
            if (software.length > 0) {
                var sw = $('<div class="picSystemRows picSystemSoftware"></div>').appendTo(body);
                software.slice().reverse().slice(0, 8).forEach(function (x) { self._softwareRow(sw, self._time(x.t, true), x, '  ' + x.name); });
            }
            $('<div class="picSystemNote"></div>').text((rows.length > 0 ? self._time(rows[0].t, true) + ' to ' + self._time(rows[rows.length - 1].t, true) + '. ' : '') + 'One reading ' + (log.rowMinutes >= 1440 ? 'a day' : log.rowMinutes >= 60 ? 'an hour' : 'every ' + log.rowMinutes + ' minutes') + '.').appendTo(body);
        }
    });
})(jQuery);

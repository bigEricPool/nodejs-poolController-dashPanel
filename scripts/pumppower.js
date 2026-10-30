(function ($) {
    // The electricity a relay driven pump uses (njsPC's /state/pumpPower): the speed it is at, today and this month, and a chart of the energy
    // by speed. A pump on relays reports no power, so the figures are the time at each speed times the watts set for that speed. The gear in the
    // title opens the settings. The panel stays hidden when njsPC does not have this.
    $.widget('pic.pumpPower', {
        options: { refreshMs: 60 * 1000, range: 'week' },
        _create: function () {
            var self = this, o = self.options, el = self.element;
            el[0].initPumpPower = function (data) { self._initPumpPower(data); };
            el.addClass('picPowerOff');
        },
        _destroy: function () {
            var self = this, o = self.options;
            if (o.timer) clearInterval(o.timer);
            o.timer = null;
        },
        _initPumpPower: function (data) {
            var self = this, o = self.options, el = self.element;
            if (o.timer) clearInterval(o.timer);
            o.timer = null;
            el.empty();
            // Called without data when the dashboard is being cleared.
            if (typeof data === 'undefined') { el.addClass('picPowerOff'); return; }
            var title = $('<div class="picCircuitTitle control-panel-title"></div>').appendTo(el);
            $('<span class="picCircuitTitle">Pump Power</span>').appendTo(title);
            $('<span class="picPowerGear" role="button" tabindex="0" title="Pump power settings"><i class="fas fa-cog"></i></span>').appendTo(title)
                .on('click keydown', function (evt) {
                    if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                    evt.preventDefault();
                    self._openSettings();
                });
            var tabs = $('<span class="picPowerTabs"></span>').appendTo(title);
            [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']].forEach(function (t) {
                $('<span class="picPowerTab" role="button" tabindex="0"></span>').attr('data-range', t[0]).text(t[1]).appendTo(tabs);
            });
            tabs.on('click keydown', 'span.picPowerTab', function (evt) {
                if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                evt.preventDefault();
                o.range = $(evt.currentTarget).attr('data-range');
                self._load();
            });
            $('<div class="picPowerBody"></div>').appendTo(el);
            self._load();
            // Nothing is asked for while the page is not being looked at.
            o.timer = setInterval(function () { if (!document.hidden) self._load(); }, o.refreshMs);
        },
        _url: function (path) {
            return makeBool($('body').attr('data-apiproxy')) ? 'njsPC' + path : $('body').attr('data-apiserviceurl') + path;
        },
        // A request that stays quiet when it fails: an njsPC without this answers 404, and that is not an error to show.
        _load: function () {
            var self = this, o = self.options, el = self.element;
            $.ajax({ url: self._url('/state/pumpPower?range=' + o.range), type: 'get', dataType: 'json' })
                .done(function (data) { o.report = data; el.removeClass('picPowerOff'); self._render(); })
                .fail(function () { if (typeof o.report === 'undefined') el.addClass('picPowerOff'); });
        },
        _kwh: function (v) {
            if (typeof v !== 'number' || isNaN(v)) return '--';
            return v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0) + ' kWh';
        },
        _money: function (v) { return typeof v === 'number' ? ' · $' + v.toFixed(2) : ''; },
        _hours: function (sec) {
            var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
            return h > 0 ? h + ' h ' + m + ' min' : m + ' min';
        },
        // The colors go by the order of the speeds' watts, lowest first.
        _colors: function (speeds) {
            var c = ['#4a9fd4', '#e0a030', '#d0553a', '#6aa84f', '#8e6fc1', '#3fa7a0', '#c2709b', '#8a8a8a'], map = {};
            speeds.slice().sort(function (a, b) { return a.watts - b.watts; }).forEach(function (s, i) { map[s.key] = c[i % c.length]; });
            return map;
        },
        _periodLabel: function (t, range) {
            var d = new Date(t);
            if (range === 'day') return ('0' + d.getHours()).slice(-2) + ':00';
            if (range === 'year') return d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
            return (d.getMonth() + 1) + '/' + d.getDate();
        },
        _render: function () {
            var self = this, o = self.options, el = self.element, r = o.report;
            var body = el.find('div.picPowerBody').empty();
            el.find('span.picPowerTab').each(function () { $(this).toggleClass('picPowerTabOn', $(this).attr('data-range') === o.range); });
            if (!r.enabled || !r.configured) {
                $('<div class="picPowerNote"></div>').text(r.configured ? 'Pump power tracking is turned off.' : 'Enter the watts for each pump speed to start.').appendTo(body);
                return;
            }
            r.now.forEach(function (n) {
                var text = !n.on ? 'Off' : n.speed ? n.speed + (n.rpm > 0 ? ' · ' + n.rpm + ' rpm' : '') + ' · ' + n.watts + ' W' : 'Running, no speed matches';
                self._row(body, r.now.length > 1 ? n.pumpName : 'Now', text);
            });
            self._row(body, 'Today', self._kwh(r.today.kwh) + self._money(r.today.cost));
            self._row(body, 'This month', self._kwh(r.month.kwh) + self._money(r.month.cost));
            var colors = self._colors(r.speeds);
            self._bars(body, r, colors);
            var legend = $('<div class="picPowerLegend"></div>').appendTo(body);
            r.speeds.forEach(function (s) {
                var sec = r.total.seconds[s.key] || 0;
                var line = $('<div></div>').appendTo(legend);
                $('<span class="picPowerSwatch"></span>').css({ backgroundColor: colors[s.key] }).appendTo(line);
                $('<span></span>').text(s.name + ': ' + self._hours(sec) + ', ' + self._kwh(sec * s.watts / 3600000)).appendTo(line);
            });
            r.speeds.filter(function (s) { return s.relay === 'none'; }).forEach(function (s) {
                $('<div class="picPowerWarn"></div>').text('No pump relay or circuit uses the relay set for ' + s.name + ', so that speed is never counted.').appendTo(body);
            });
            $('<div class="picPowerNote"></div>').text('Estimated: the time at each speed times the watts set for it.').appendTo(body);
        },
        _row: function (parent, label, value) {
            var line = $('<div class="picPowerRow"></div>').appendTo(parent);
            $('<span class="picPowerLabel"></span>').text(label).appendTo(line);
            $('<span class="picPowerValue"></span>').text(value).appendTo(line);
        },
        // Stacked bars of the energy in each period, one color for each speed.
        _bars: function (parent, r, colors) {
            var self = this, W = 200, H = 60, base = H - 1, top = 2;
            var max = 0;
            r.buckets.forEach(function (b) { if (b.kwh > max) max = b.kwh; });
            var box = $('<div class="picPowerChart"></div>').appendTo(parent);
            var head = $('<div class="picPowerChartLabel"></div>').appendTo(box);
            $('<span></span>').text('Total ' + self._kwh(r.total.kwh) + self._money(r.total.cost)).appendTo(head);
            if (!(max > 0)) { $('<div class="picPowerNote"></div>').text('Nothing recorded for this period yet.').appendTo(box); return; }
            $('<span class="picPowerChartRange"></span>').text('peak ' + self._kwh(max)).appendTo(head);
            var n = r.buckets.length, step = W / n, gap = Math.min(1, step * 0.15), svg = '';
            var esc = function (t) { return $('<div></div>').text(t).html(); };
            r.buckets.forEach(function (b, i) {
                var y = base, tip = self._periodLabel(b.t, r.range) + ': ' + self._kwh(b.kwh);
                r.speeds.forEach(function (s) {
                    var kwh = (b.seconds[s.key] || 0) * s.watts / 3600000;
                    if (!(kwh > 0)) return;
                    var h = kwh / max * (base - top);
                    y -= h;
                    svg += '<rect x="' + (i * step).toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + (step - gap).toFixed(2) + '" height="' + h.toFixed(2) + '" fill="' + colors[s.key] + '"><title>' + esc(tip + ' (' + s.name + ' ' + self._kwh(kwh) + ')') + '</title></rect>';
                });
            });
            $('<svg class="picPowerBars" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + svg + '</svg>').appendTo(box);
            var scale = $('<div class="picPowerScale"></div>').appendTo(box);
            $('<span></span>').text(self._periodLabel(r.buckets[0].t, r.range)).appendTo(scale);
            $('<span></span>').text(self._periodLabel(r.buckets[n - 1].t, r.range)).appendTo(scale);
        },
        _openSettings: function () {
            var self = this;
            $.getApiService('/config/pumpPower/settings', null, function (data) { self._settingsDialog(data); });
        },
        // One section for each pump, one row for each speed.
        _settingsDialog: function (data) {
            var self = this, o = self.options, el = self.element;
            var settings = data.settings || {}, pumps = data.pumps || [], servers = data.servers || [];
            var dlg = $.pic.modalDialog.createDialog('dlgPumpPower', {
                width: '900px',
                height: 'auto',
                title: 'Pump Power Settings',
                position: { my: 'center top', at: 'center top', of: window },
                buttons: [
                    {
                        text: 'Save', icon: '<i class="fas fa-save"></i>',
                        click: function () {
                            var dialog = this;
                            $.putApiService('/config/pumpPower/settings', self._readSettings(dlg), function () {
                                $.pic.modalDialog.closeDialog(dialog);
                                self._load();
                            });
                        }
                    },
                    {
                        text: 'Cancel', icon: '<i class="far fa-window-close"></i>',
                        click: function () { $.pic.modalDialog.closeDialog(this); }
                    }
                ]
            });
            var general = $('<div class="picPowerGeneral"></div>').appendTo(dlg);
            var line = $('<div></div>').appendTo(general);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Track pump power', binding: 'enabled' });
            line = $('<div></div>').appendTo(general);
            $('<div></div>').appendTo(line).valueSpinner({ labelText: 'Rate', binding: 'ratePerKwh', min: 0, max: 10, step: .01, fmtMask: '#,##0.00', units: '$ per kWh (0 for no cost)', labelAttrs: { style: { width: '4rem' } }, inputAttrs: { maxlength: 5 } });
            $('<div class="picPowerNote"></div>').text('Each speed names the relay that selects it, the same connection and device as a pump relay or circuit. Leave one speed with No Connection as the default: it counts whenever the pump is on. When several apply, the one with the most watts counts.').appendTo(dlg);
            dataBinder.bind(general, { enabled: settings.enabled === true, ratePerKwh: settings.ratePerKwh || 0 });
            if (pumps.length === 0) $('<div class="picPowerNote"></div>').text('There are no pumps set up.').appendTo(dlg);
            pumps.forEach(function (p) {
                var sec = $('<div class="picPowerPump"></div>').attr('data-pump', p.id).appendTo(dlg);
                $('<div class="picPowerPumpName"></div>').text(p.name || 'Pump ' + p.id).appendTo(sec);
                var rows = $('<div class="picPowerSpeeds"></div>').appendTo(sec);
                var cfg = (settings.pumps || []).find(function (x) { return x.pump === p.id; });
                ((cfg && cfg.speeds) || []).forEach(function (s) { self._speedRow(rows, s, servers); });
                $('<div></div>').appendTo(sec).actionButton({ text: 'Add Speed', icon: '<i class="fas fa-plus"></i>' }).on('click', function () {
                    var id = 0;
                    rows.find('div.picPowerSpeed').each(function () { id = Math.max(id, parseInt($(this).attr('data-id'), 10)); });
                    self._speedRow(rows, { id: id + 1 }, servers);
                });
            });
            dlg.css({ overflow: 'visible' });
        },
        _speedRow: function (rows, s, servers) {
            var row = $('<div class="picPowerSpeed"></div>').attr('data-id', s.id).appendTo(rows);
            $('<div></div>').appendTo(row).inputField({ labelText: 'Name', binding: 'name', inputAttrs: { maxlength: 20, style: { width: '5rem' } }, labelAttrs: { style: { width: '2.7rem' } } });
            $('<div></div>').appendTo(row).valueSpinner({ labelText: 'RPM', binding: 'rpm', min: 0, max: 10000, step: 50, labelAttrs: { style: { marginLeft: '.5rem' } }, inputAttrs: { maxlength: 5 } });
            $('<div></div>').appendTo(row).valueSpinner({ labelText: 'Watts', binding: 'watts', min: 0, max: 20000, step: 1, labelAttrs: { style: { marginLeft: '.5rem' } }, inputAttrs: { maxlength: 5 } });
            $('<div></div>').appendTo(row).REMBinding({ binding: '', servers: servers, horizontal: true, showLabel: false }).css({ marginLeft: '.5rem', display: 'inline-block' });
            $('<span class="picPowerRemove" role="button" tabindex="0" title="Remove this speed"><i class="fas fa-trash"></i></span>').appendTo(row).on('click', function () { row.remove(); });
            dataBinder.bind(row, { name: s.name || '', rpm: s.rpm || 0, watts: s.watts || 0 });
            row.find('div[data-bind$=connectionId]').each(function () { this.val(s.connectionId || ''); });
            row.find('div[data-bind$=deviceBinding]').each(function () { this.val(s.deviceBinding || ''); });
        },
        _readSettings: function (dlg) {
            var out = dataBinder.fromElement(dlg.find('div.picPowerGeneral'));
            out.pumps = [];
            dlg.find('div.picPowerPump').each(function () {
                var speeds = [];
                $(this).find('div.picPowerSpeed').each(function () {
                    var s = dataBinder.fromElement($(this));
                    s.id = parseInt($(this).attr('data-id'), 10);
                    speeds.push(s);
                });
                if (speeds.length > 0) out.pumps.push({ pump: parseInt($(this).attr('data-pump'), 10), speeds: speeds });
            });
            return out;
        }
    });
})(jQuery);

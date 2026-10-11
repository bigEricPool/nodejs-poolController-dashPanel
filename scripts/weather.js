(function ($) {
    // The weather at the station njsPC logs (its hourly weather log): today or yesterday, switched with the two buttons in the title.
    // The panel stays hidden when njsPC has no weather log or it is not turned on.
    $.widget('pic.weather', {
        options: { refreshMs: 5 * 60 * 1000, day: 'today' },
        _create: function () {
            var self = this, o = self.options, el = self.element;
            el[0].initWeather = function (data) { self._initWeather(data); };
            el.addClass('picWeatherOff');
        },
        _destroy: function () {
            var self = this, o = self.options;
            if (o.timer) clearInterval(o.timer);
            o.timer = null;
        },
        _initWeather: function (data) {
            var self = this, o = self.options, el = self.element;
            if (o.timer) clearInterval(o.timer);
            o.timer = null;
            el.empty();
            // Called without data when the dashboard is being cleared.
            if (typeof data === 'undefined') { el.addClass('picWeatherOff'); return; }
            var title = $('<div class="picCircuitTitle control-panel-title"></div>').appendTo(el);
            $('<span class="picCircuitTitle">Weather</span>').appendTo(title);
            $('<a class="picWeatherStation" target="_blank" rel="noopener" title="Open this station on Weather Underground"></a>').appendTo(title).hide();
            var tabs = $('<span class="picWeatherTabs"></span>').appendTo(title);
            $('<span class="picWeatherTab" data-day="today" role="button" tabindex="0">Today</span>').appendTo(tabs);
            $('<span class="picWeatherTab" data-day="yesterday" role="button" tabindex="0">Yesterday</span>').appendTo(tabs);
            tabs.on('click keydown', 'span.picWeatherTab', function (evt) {
                if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ') return;
                evt.preventDefault();
                o.day = $(evt.currentTarget).attr('data-day');
                self._render();
            });
            $('<div class="picWeatherBody"></div>').appendTo(el);
            self._load();
            o.timer = setInterval(function () { self._load(); }, o.refreshMs);
        },
        // A request that stays quiet when it fails: an njsPC without the weather log answers 404, and that is not an error to show.
        _load: function () {
            var self = this, o = self.options, el = self.element;
            var useProxy = makeBool($('body').attr('data-apiproxy'));
            var url = useProxy ? 'njsPC/state/weather/summary' : $('body').attr('data-apiserviceurl') + '/state/weather/summary';
            $.ajax({ url: url, type: 'get', dataType: 'json' })
                .done(function (data) { o.summary = data; self._render(); })
                .fail(function () { if (typeof o.summary === 'undefined') el.addClass('picWeatherOff'); });
        },
        _fmt: function (v, places, unit) {
            if (typeof v !== 'number' || isNaN(v)) return '--';
            return v.toFixed(places) + (unit || '');
        },
        _uvName: function (uv) {
            if (typeof uv !== 'number' || isNaN(uv)) return '';
            return uv < 3 ? 'low' : uv < 6 ? 'moderate' : uv < 8 ? 'high' : uv < 11 ? 'very high' : 'extreme';
        },
        _compass: function (deg) {
            if (typeof deg !== 'number' || isNaN(deg)) return '';
            return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
        },
        _row: function (body, icon, label, value, extra) {
            var row = $('<div class="picWeatherRow"></div>').appendTo(body);
            $('<span class="picWeatherIcon"></span>').appendTo(row).append($('<i></i>').addClass(icon));
            $('<label class="picWeatherLabel"></label>').text(label).appendTo(row);
            $('<span class="picWeatherValue"></span>').text(value).appendTo(row);
            if (extra) $('<span class="picWeatherExtra"></span>').text(extra).appendTo(row);
            return row;
        },
        _render: function () {
            var self = this, o = self.options, el = self.element;
            var s = o.summary;
            if (!s || !makeBool(s.enabled) || !makeBool(s.configured)) { el.addClass('picWeatherOff'); return; }
            el.removeClass('picWeatherOff');
            var metric = s.units === 'm';
            var deg = '°', len = metric ? ' mm' : ' in', lenPlaces = metric ? 1 : 2, spd = metric ? ' km/h' : ' mph';
            var link = el.find('a.picWeatherStation');
            if (s.stationUrl) link.attr('href', s.stationUrl).text(s.stationId).show(); else link.hide();
            el.find('span.picWeatherTab').each(function () { $(this).toggleClass('selected', $(this).attr('data-day') === o.day).attr('aria-pressed', $(this).attr('data-day') === o.day); });
            var body = el.find('div.picWeatherBody').empty();
            var isToday = o.day !== 'yesterday';
            var day = isToday ? s.today : s.yesterday, cur = isToday ? s.current : undefined;
            if (!day && !cur) {
                $('<div class="picWeatherNote"></div>').text(s.lastError ? 'The station could not be read: ' + s.lastError : 'Nothing has been reported for ' + (isToday ? 'today' : 'yesterday') + ' yet.').appendTo(body);
                return;
            }
            day = day || {};
            // Air temperature: now (today only), then the high and the low.
            var temp = self._row(body, 'fas fa-thermometer-half', 'Air', cur ? self._fmt(cur.temp, 0, deg) : self._fmt(day.tempAvg, 0, deg), (cur ? '' : 'avg, ') + 'high ' + self._fmt(day.tempHigh, 0, deg) + ' / low ' + self._fmt(day.tempLow, 0, deg));
            temp.find('span.picWeatherValue').addClass('picWeatherBig');
            if (cur && typeof cur.heatIndex === 'number' && typeof cur.temp === 'number' && Math.abs(cur.heatIndex - cur.temp) >= 2) self._row(body, 'fas fa-temperature-high', 'Feels like', self._fmt(cur.heatIndex, 0, deg));
            self._row(body, 'fas fa-sun', 'UV index', cur ? self._fmt(cur.uv, 0) : self._fmt(day.uvHigh, 0), cur ? 'peak ' + self._fmt(day.uvHigh, 0) + (self._uvName(day.uvHigh) ? ' (' + self._uvName(day.uvHigh) + ')' : '') : (self._uvName(day.uvHigh) ? 'peak, ' + self._uvName(day.uvHigh) : 'peak'));
            var raining = cur && typeof cur.precipRate === 'number' && cur.precipRate > 0;
            self._row(body, 'fas fa-cloud-rain', 'Rain', self._fmt(day.precipTotal, lenPlaces, len),
                raining ? 'raining now, ' + self._fmt(cur.precipRate, lenPlaces, len + '/hr') : (typeof s.precip7Days === 'number' ? '7 days: ' + self._fmt(s.precip7Days, lenPlaces, len) : ''));
            // What else moves a pool: wind and dry air (evaporation, heat loss, debris), and sun (solar heat, chlorine loss).
            if (cur) self._row(body, 'fas fa-wind', 'Wind', self._fmt(cur.windSpeed, 0, spd) + (self._compass(cur.windDir) ? ' ' + self._compass(cur.windDir) : ''), 'gusts to ' + self._fmt(day.windGustHigh, 0, spd));
            else self._row(body, 'fas fa-wind', 'Wind', self._fmt(day.windSpeedAvg, 0, spd), 'avg, gusts to ' + self._fmt(day.windGustHigh, 0, spd));
            if (cur) self._row(body, 'fas fa-tint', 'Humidity', self._fmt(cur.humidity, 0, '%'), 'dew point ' + self._fmt(cur.dewpt, 0, deg));
            else self._row(body, 'fas fa-tint', 'Humidity', self._fmt(day.humidityAvg, 0, '%'), 'avg, dew point ' + self._fmt(day.dewptAvg, 0, deg));
            if (typeof day.solarRadHigh === 'number' || (cur && typeof cur.solarRad === 'number'))
                self._row(body, 'fas fa-solar-panel', 'Sun', cur ? self._fmt(cur.solarRad, 0, ' W/m²') : self._fmt(day.solarRadHigh, 0, ' W/m²'), cur ? 'peak ' + self._fmt(day.solarRadHigh, 0) : 'peak');
            var note = '';
            if (cur) note = 'Reported at ' + cur.lt.slice(11, 16) + ' station time.';
            else if (isToday) note = 'No report in the last hour; these are the hours logged today.';
            else if (typeof day.hours === 'number' && day.hours < 24) note = day.hours + ' of 24 hours were reported.';
            if (s.lastError) note += (note ? ' ' : '') + 'Last read failed: ' + s.lastError + '.';
            if (note) $('<div class="picWeatherNote"></div>').text(note).appendTo(body);
        }
    });
})(jQuery);

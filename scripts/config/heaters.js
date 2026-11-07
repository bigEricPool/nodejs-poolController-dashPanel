(function ($) {
    $.widget('pic.configHeaters', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.addClass('picConfigCategory');
            el.addClass('cfgHeaters');
            $.getApiService('/config/options/heaters', null, 'Loading Options...', function (opts, status, xhr) {
                console.log(opts);
                for (var i = 0; i < opts.heaters.length; i++) {
                    $('<div></div>').appendTo(el).pnlHeaterConfig(opts)[0].dataBind(opts.heaters[i]);
                }
                // The solar decision's settings (njsPC config.json controller.solar) are shown on a Nixie controller with a solar heater.
                var solarVal = (opts.heaterTypes || []).filter(function (t) { return t.name === 'solar'; }).map(function (t) { return t.val; })[0];
                var hasSolar = opts.heaters.some(function (h) { var tv = typeof h.type === 'object' && h.type !== null ? h.type.val : h.type; return tv === solarVal; });
                var ctlType = ($('div.dashOuter').attr('data-controllertype') || $('body').attr('data-controllertype') || '').toLowerCase();
                if (hasSolar && ctlType === 'nixie') self._buildSolarSettings(el, opts);
                var btnPnl = $('<div class="picBtnPanel btn-panel"></div>').appendTo(el);
                var btnAdd = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Add Heater', icon: '<i class="fas fa-plus" ></i>' });
                if (opts.heaters.length >= 5) btnAdd.addClass('disabled');
                btnAdd.on('click', function (e) {
                    if ($(this).hasClass('disabled')) return;
                    var heaters = el.find('div.picConfigCategory.cfgHeater');
                    var pnl = $('<div></div>').insertBefore(btnPnl).pnlHeaterConfig(opts);
                    pnl[0].dataBind({ id: -1, name: 'Heater ' + (heaters.length + 1), master: parseInt($('div.picDashboard').attr('data-masterid') || 0, 10) });
                    pnl.find('div.picAccordian:first')[0].expanded(true);
                    heaters = el.find('div.picConfigCategory.cfgHeater');
                    if (heaters.length >= 5) $(this).addClass('disabled');
                });
            });
        },
        _buildSolarSettings: function (parent, opts) {
            var pnl = $('<div></div>').addClass('pnl-solar-settings').css({ margin: '1rem 0' }).appendTo(parent);
            $('<div></div>').appendTo(pnl).css({ fontWeight: 'bold', marginBottom: '.25rem' }).text('Solar Controls')
                .attr('title', 'Settings for the solar decision on this controller (njsPC config.json, controller.solar). A change applies at once.');
            var units = '&deg;' + ((opts.tempUnits || {}).name || '');
            // The solar settings are bound inside fields; the set points below are body values and are saved through the body set point route.
            var fields = $('<div></div>').addClass('pnl-solar-fields').appendTo(pnl);
            var line = $('<div></div>').appendTo(fields);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Settle Delay', binding: 'settleMinutes', min: 0, max: 60, step: 1, units: 'min', inputAttrs: { style: { width: '3rem' } } })
                .attr('title', 'After the pump starts or solar turns off, solar waits this long before starting. Solar stops for the water temperature only after the water has stayed past the stop level this long. 0 turns the delay off.');
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Hysteresis', binding: 'hysteresis', min: 0, max: 5, step: 0.5, units: '&deg;' + ((opts.tempUnits || {}).name || ''), inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'Solar stops once the water has stayed this many degrees above the Heat Point (for the settle delay) and restarts when the water is this many degrees below it. 0 turns it off. Raise it to 1 if solar still switches off and on around the Heat Point.');
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Valve Delay', binding: 'valveDelaySeconds', min: 0, max: 600, step: 15, units: 'sec', inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'When solar should start, the pump first runs at its solar speed for this long with the valve relay still off, and the start is checked again with the readings taken at that speed. The valve relay turns on only if it is still worthwhile. Needs a pump speed tied to the solar circuit. 0 turns it off. To see whether your pool needs it: with solar off, compare the water reading at the normal pump speed with the reading two minutes after switching to the solar pump speed. If they differ by more than the hysteresis, set this to 120.');
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Check Period', binding: 'checkPeriodMinutes', min: 0, max: 1440, step: 5, units: 'min', inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'After the valve delay check turns a start down, solar does not check again for this long, so the pump is not sped up to test the water more often than that. A change of the Heat Point is checked at once. While it waits, the pool temperature shown is the reading taken at the solar pump speed, marked with * and the time it was read.');
            line = $('<div></div>').appendTo(fields);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Start Margin', binding: 'startMargin', min: 0, max: 10, step: 0.5, units: units, inputAttrs: { style: { width: '3rem' } } })
                .attr('title', 'How much more than the Stop Temp Delta the collector must lead the water before a valve delay check starts solar: warmer than the water for heating, colder for nocturnal cooling. It leaves room for the collector reading to move toward the water once water flows through it, so solar does not stop again for the collector straight after starting. Default 2.');
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Minimum Run', binding: 'minRunMinutes', min: 0, max: 60, step: 1, units: 'min', inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'For this long after solar turns on, it is not stopped because the collector lead has fallen to the Stop Temp Delta, while the collector reading settles. Stops for the water temperature still apply. 0 turns it off. Default 5.');
            line = $('<div></div>').addClass('pnl-solar-return').appendTo(fields);
            $('<div></div>').appendTo(line).pickList({
                bindColumn: 0, displayColumn: 1, labelText: 'Return Sensor', binding: 'returnSensor',
                columns: [{ binding: 'val', hidden: true, text: 'val', style: { whiteSpace: 'nowrap' } }, { binding: 'desc', text: 'Sensor', style: { whiteSpace: 'nowrap' } }],
                items: [{ val: '', desc: 'None' }, { val: 'solarSensor2', desc: 'Solar Sensor 2' }, { val: 'solarSensor3', desc: 'Solar Sensor 3' }, { val: 'solarSensor4', desc: 'Solar Sensor 4' }],
                inputAttrs: { style: { width: '9rem' } }
            }).attr('title', 'The temperature input that is on the pipe coming back from the solar collector, if there is one. Its reading, and how much warmer it is than the pool water while solar runs, are shown on the dashboard and written to the solar log. It takes no part in deciding when solar runs.');
            // The Heat Point and Cool Point of each body solar heats: the same values as the Heat Settings on the dashboard body card, so a change in either place
            // shows in the other. A body no solar heater serves is not listed. The Cool Point has the card's limit: at least the Heat Point + 1, except on a body
            // heated by solar only.
            var sps = $('<div></div>').addClass('pnl-solar-setpoints').css({ marginTop: '.5rem' }).appendTo(pnl);
            var isC = (opts.tempUnits || {}).name === 'C', minT = isC ? 5 : 40, maxT = isC ? 41 : 104;
            // Nocturnal cooling stops at the Cool Point less the hysteresis, as heating stops at the Heat Point plus it. The level is shown next to the
            // Cool Point while a solar heater has cooling enabled, and follows the spinners. With the Cool Point below the Heat Point plus the hysteresis,
            // night cooling takes the water below where daytime heating restarts, so a note says heating and cooling can both run.
            var typeVal = function (h) { return typeof h.type === 'object' && h.type !== null ? h.type.val : h.type; };
            var typeName = function (h) { var t = (opts.heaterTypes || []).find(function (ht) { return ht.val === typeVal(h); }); return t ? t.name : ''; };
            // The heaters on a body, as njsPC matches them: the heater's body is the body id, or names it (pool, spa, poolspa, body1 to body4).
            var heatersOn = function (bodyId) {
                return (opts.heaters || []).filter(function (h) {
                    if (h.isActive === false) return false;
                    var hb = typeof h.body === 'object' && h.body !== null ? h.body.val : h.body;
                    if (hb === bodyId) return true;
                    var bn = ((opts.bodies || []).find(function (x) { return x.val === hb; }) || {}).name;
                    return bn === 'body' + bodyId || (bn === 'pool' && bodyId === 1) || (bn === 'spa' && bodyId === 2) || (bn === 'poolspa' && (bodyId === 1 || bodyId === 2));
                });
            };
            // How far past the Heat Point another heater on the body heats in this heat mode (gas by its Stop Temp Delta, MasterTemp 0, hybrid 1), as
            // njsPC starts them; nocturnal cooling works to no lower than that plus the hysteresis. undefined when no other heater can heat in the mode.
            var backupOver = function (bodyHeaters, mode) {
                var over;
                bodyHeaters.forEach(function (h) {
                    var tn = typeName(h), o;
                    if (['gas', 'maxetherm', 'jxi', 'lxi'].indexOf(tn) >= 0 && ['heater', 'solarpref', 'heatpumppref', 'ultratemppref'].indexOf(mode) >= 0) o = typeof h.stopTempDelta === 'number' ? h.stopTempDelta : 0;
                    else if (tn === 'mastertemp' && ['mtheater', 'heatpumppref', 'ultratemppref', 'solarpref'].indexOf(mode) >= 0) o = 0;
                    else if (tn === 'hybrid' && mode !== 'off') o = 1;
                    if (typeof o === 'number' && (typeof over === 'undefined' || o > over.by)) over = { by: o, name: h.name };
                });
                return over;
            };
            var showCoolStop = function () {
                var hs = fields.find('div.picValueSpinner[data-bind="hysteresis"]');
                var hyst = hs.length ? parseFloat(hs[0].val()) : 0.5;
                if (isNaN(hyst)) hyst = 0.5;
                sps.find('div.pnl-solar-setpoint').each(function () {
                    var bl = $(this), cs = bl.find('div.picValueSpinner[data-bind="coolSetpoint"]'), hp = bl.find('div.picValueSpinner[data-bind="heatSetpoint"]');
                    var cool = cs.length ? parseFloat(cs[0].val()) : NaN;
                    var heat = hp.length ? parseFloat(hp[0].val()) : NaN;
                    var note = bl.find('span.pnl-solar-coolstop');
                    if (!note.length) note = $('<span></span>').addClass('pnl-solar-coolstop').css({ marginLeft: '.5rem', opacity: .75 }).appendTo(bl);
                    // Only for a body a solar heater with cooling enabled serves.
                    if (isNaN(cool) || bl.attr('data-cooling') !== 'true') { note.text('').removeAttr('title'); return; }
                    var r1 = function (v) { return Math.round(v * 10) / 10; };
                    var bk = bl.data('backup');
                    var target = cool, kept = '';
                    if (bk && !isNaN(heat) && heat + bk.by + hyst > cool) {
                        target = heat + bk.by + hyst;
                        kept = ' In this heat mode ' + bk.name + ' can heat this body, to ' + r1(heat + bk.by) + ', so cooling works to no lower than that + the Hysteresis (' + r1(target) + ') in place of the Cool Point, and the two do not take turns.';
                    }
                    var both = kept === '' && !isNaN(heat) && cool < heat + hyst;
                    note.html('(cooling stops at ' + r1(target - hyst) + units + ')' + (both ? ' <span style="color:#c77700">heating and cooling can both run</span>' : ''))
                        .attr('title', (kept === '' ? 'Cool Point − Hysteresis: ' + cool + ' − ' + hyst + '.' : 'Cooling target − Hysteresis: ' + r1(target) + ' − ' + hyst + '.')
                            + ' Nocturnal cooling starts when the water is above ' + (kept === '' ? 'the Cool Point' : 'that target') + ', stops when it falls to this, and after that restarts above ' + (kept === '' ? 'the Cool Point' : 'the target') + ' + Hysteresis.' + kept
                            + (both ? ' The Cool Point is below the Heat Point + Hysteresis (' + r1(heat + hyst) + '), so night cooling takes the water below where daytime heating restarts, and the two can undo each other every day.' : ''));
                });
            };
            fields.find('div.picValueSpinner[data-bind="hysteresis"]').on('change', showCoolStop);
            $.getApiService('/state/temps', null, function (t) {
                var bodies = (t && t.bodies) || [];
                for (var i = 0; i < bodies.length; i++) {
                    var b = bodies[i];
                    var onBody = heatersOn(b.id);
                    var solarHeaters = onBody.filter(function (h) { return typeName(h) === 'solar'; });
                    if (solarHeaters.length === 0) continue;
                    var solarOnly = solarHeaters.length === onBody.length;
                    var cooling = solarHeaters.some(function (h) { return h.coolingEnabled; });
                    var mode = typeof b.heatMode === 'object' && b.heatMode !== null ? b.heatMode.name : '';
                    var coolMin = function (heat) { return solarOnly ? minT : heat + 1; };
                    var cool = typeof b.coolSetpoint === 'number' ? b.coolSetpoint : b.setPoint + 1;
                    var bl = $('<div></div>').addClass('pnl-solar-setpoint').attr('data-bodyid', b.id).attr('data-heat', b.setPoint).attr('data-cool', cool).attr('data-cooling', cooling ? 'true' : 'false').appendTo(sps);
                    bl.data('backup', backupOver(onBody.filter(function (h) { return typeName(h) !== 'solar'; }), mode));
                    var hpS = $('<div></div>').appendTo(bl).valueSpinner({ canEdit: true, labelText: (b.name || 'Body ' + b.id) + ' Heat Point', val: b.setPoint, min: minT, max: maxT, step: 1, binding: 'heatSetpoint', units: units, inputAttrs: { style: { width: '3rem' } } })
                        .attr('title', 'The temperature solar heats this body to. The same setting as Heat Point in the Heat Settings on the dashboard.');
                    var cpS = $('<div></div>').appendTo(bl).valueSpinner({ canEdit: true, labelText: 'Cool Point', val: cool, min: coolMin(b.setPoint), max: maxT, step: 1, binding: 'coolSetpoint', units: units, inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                        .attr('title', solarOnly ? 'With Nocturnal Cooling on, solar cools this body at night to this temperature, as it heats it to the Heat Point by day. The same setting as Cool Point in the Heat Settings on the dashboard. Below the Heat Point plus the Hysteresis, heating and cooling can both run and undo each other.'
                            : 'With Nocturnal Cooling on, solar cools this body at night to this temperature. The same setting as Cool Point in the Heat Settings on the dashboard. With another heater on this body it must be at least the Heat Point + 1.')
                        .on('change', showCoolStop);
                    // A non-solar-only body keeps the Cool Point at least the Heat Point + 1 as the Heat Point moves, as the Heat Settings popup does.
                    (function (cp, minFn) { hpS.on('change', function (e) { cp[0].minVal(minFn(e.value)); showCoolStop(); }); })(cpS, coolMin);
                }
                if (sps.find('div.pnl-solar-setpoint').length === 0) sps.hide();
                showCoolStop();
            });
            var btnPnl = $('<div></div>').addClass('picBtnPanel btn-panel').appendTo(pnl);
            var btnSave = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Save Solar Controls', icon: '<i class="fas fa-save"></i>' });
            // njsPC leaves a setting out of config.json until it is changed; its default is shown then.
            var bindSettings = function (c) {
                if (!c) return;
                if (typeof c.startMargin === 'undefined' || c.startMargin === null) c.startMargin = 2;
                if (typeof c.minRunMinutes === 'undefined' || c.minRunMinutes === null) c.minRunMinutes = 5;
                dataBinder.bind(fields, c);
                showCoolStop();
            };
            btnSave.on('click', function () {
                if (dataBinder.checkRequired(pnl, true)) {
                    $.putApiService('/config/solar/settings', dataBinder.fromElement(fields), 'Saving Solar Controls...', function (c) { bindSettings(c); });
                    // Only a set point that was changed here is sent, so a change made on the dashboard meanwhile is not put back.
                    sps.find('div.pnl-solar-setpoint').each(function () {
                        var bl = $(this), v = dataBinder.fromElement(bl), put = { id: parseInt(bl.attr('data-bodyid'), 10) };
                        if (String(v.heatSetpoint) !== bl.attr('data-heat')) put.heatSetpoint = v.heatSetpoint;
                        if (String(v.coolSetpoint) !== bl.attr('data-cool')) put.coolSetpoint = v.coolSetpoint;
                        if (typeof put.heatSetpoint === 'undefined' && typeof put.coolSetpoint === 'undefined') return;
                        $.putApiService('state/body/setPoint', put, function () {
                            if (typeof put.heatSetpoint !== 'undefined') bl.attr('data-heat', put.heatSetpoint);
                            if (typeof put.coolSetpoint !== 'undefined') bl.attr('data-cool', put.coolSetpoint);
                        });
                    });
                }
            });
            // njsPC offers the return sensor only on a system with one body (returnSensorAvailable); an older njsPC does not say, and it is shown.
            $.getApiService('/config/solar/settings', null, function (c) { bindSettings(c); if (c && c.returnSensorAvailable === false) pnl.find('div.pnl-solar-return').hide(); });
        }
    });
    $.widget('pic.pnlHeaterConfig', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            var isIntelliCenter = (($('body').attr('data-controllertype') || '').toLowerCase() === 'intellicenter');
            var maxNameLength = isIntelliCenter ? 15 : 16;
            el.empty();
            el.addClass('picConfigCategory cfgHeater');
            var binding = '';
            var acc = $('<div></div>').appendTo(el).accordian({
                columns: [{ binding: 'name', glyph: 'fas fa-dumpster-fire', style: { width: '14rem' } },
                    { binding: 'type', glyph: '', style: { width: '10rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow:'ellipsis' } },
                    { binding: 'body', glyph: '', style: { width: '10rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' } }]
            });
            var pnl = acc.find('div.picAccordian-contents');
            var line = $('<div></div>').appendTo(pnl);
            $('<input type="hidden" data-datatype="int"></input>').attr('data-bind', 'id').appendTo(line);
            $('<div></div>').appendTo(line).inputField({ required: true, labelText: 'Name', binding: binding + 'name', inputAttrs: { maxlength: maxNameLength }, labelAttrs: { style: { width:'4rem'} } });
            $('<div></div>').appendTo(line).pickList({
                required: true, bindColumn: 0, displayColumn: 2, labelText: 'Type', binding: binding + 'type',
                columns: [{ binding: 'val', hidden: true, text: 'Id', style: { whiteSpace: 'nowrap' } }, { binding: 'name', hidden: true, text: 'Code', style: { whiteSpace: 'nowrap' } }, { binding: 'desc', text: 'Heater Type', style: { whiteSpace: 'nowrap' } }],
                items: o.heaterTypes, inputAttrs: { style: { width: '7.7rem' } }, labelAttrs: { style: { marginLeft: '.25rem' } }
            }).on('selchanged', function (evt) { self._setOptionsPanel(evt.newItem); });
            // $('<div></div>').appendTo(line).checkbox({ labelText: 'Virtual Controller', binding: 'isVirtual' }).attr('title', 'Check this only if the heater is not being controlled by\r\na pool automation system.').hide();
            $('<div></div>').appendTo(line).pickList({
                required: true,
                bindColumn: 0, displayColumn: 2, labelText: 'Body', binding: binding + 'body',
                columns: [{ binding: 'val', hidden: true, text: 'Id', style: { whiteSpace: 'nowrap' } }, { binding: 'name', hidden: true, text: 'Code', style: { whiteSpace: 'nowrap' } }, { binding: 'desc', text: 'Body', style: { whiteSpace: 'nowrap' } }],
                items: o.bodies, inputAttrs: { style: { width: '7rem' } }, labelAttrs: { style: { marginLeft:'1rem' } }
            });
            $('<hr></hr>').appendTo(pnl);
            $('<div></div>').appendTo(pnl).addClass('pnl-heater-options');
            line = $('<div></div>').appendTo(pnl);
            var bindpnl = $('<div></div>').addClass('pnlDeviceBinding').REMBinding({ servers: o.servers }).appendTo(pnl).hide();
            $('<hr></hr>').prependTo(bindpnl);


            var btnPnl = $('<div class="picBtnPanel btn-panel"></div>').appendTo(pnl);
            var btnSave = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Save Heater', icon: '<i class="fas fa-save"></i>' });
            btnSave.on('click', function (e) {
                var p = $(e.target).parents('div.picAccordian-contents:first');
                if (dataBinder.checkRequired(p,true)) {
                    var v = dataBinder.fromElement(p);
                    if (isIntelliCenter && typeof v.name === 'string') v.name = v.name.substring(0, 15);
                    console.log(v);
                    $.putApiService('/config/heater', v, 'Saving Heater...', function (c, status, xhr) {
                        console.log(c);
                        self.dataBind(c);
                    });
                }
            });
            var btnDelete = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Delete Heater', icon: '<i class="fas fa-trash"></i>' });
            btnDelete.on('click', function (e) {
                var p = $(e.target).parents('div.picAccordian-contents:first');
                var v = dataBinder.fromElement(p);
                $.pic.modalDialog.createConfirm('dlgConfirmDeleteHeater', {
                    message: 'Are you sure you want to delete Heater ' + v.name + '?',
                    width: '350px',
                    height: 'auto',
                    title: 'Confirm Delete Heater',
                    buttons: [{
                        text: 'Yes', icon: '<i class="fas fa-trash"></i>',
                        click: function () {
                            $.pic.modalDialog.closeDialog(this);
                            if (v.id <= 0) p.parents('div.picConfigCategory.cfgHeater:first').remove();
                            else {
                                $.deleteApiService('/config/heater', v, 'Deleting Heater...', function (c, status, xhr) {
                                    p.parents('div.picConfigCategory.cfgHeater:first').remove();
                                });
                            }
                        }
                    },
                    {
                        text: 'No', icon: '<i class="far fa-window-close"></i>',
                        click: function () { $.pic.modalDialog.closeDialog(this); }
                    }]
                });
            });

        },
        _setOptionsPanel(type) {
            var self = this, o = self.options, el = self.element;
            var pnl = el.find('div.pnl-heater-options:first');
            if (pnl.attr('data-heatertype') !== type.val.toString()) {
                pnl.attr('data-heatertype', type.val);
                pnl.empty();
                var acc = el.find('div.picAccordian:first');
                var cols = acc[0].columns();
                switch (type.name) {
                    case 'solar':
                        cols[0].elGlyph().removeClass().addClass('fas').addClass('fa-sun');
                        pnlOpts = $('<div></div>').appendTo(pnl);
                        pnlOpts.pnlSolarHeaterOptions({ type: type, tempUnits: o.tempUnits });
                        break;
                    case 'gas':
                        cols[0].elGlyph().removeClass().addClass('fas').addClass('fa-burn');
                        pnlOpts = $('<div></div>').appendTo(pnl);
                        pnlOpts.pnlGasHeaterOptions({ type: type, tempUnits: o.tempUnits, coolDownDelay: o.coolDownDelay });
                        break;
                    case 'mastertemp':
                        cols[0].elGlyph().removeClass().addClass('fas').addClass('fa-fire-alt');
                        pnlOpts = $('<div></div>').appendTo(pnl);
                        pnlOpts.pnlMasterTempHeaterOptions({ type: type, tempUnits: o.tempUnits, coolDownDelay: o.coolDownDelay });
                        break;
                    case 'heatpump':
                        cols[0].elGlyph().removeClass().addClass('fas').addClass('fa-x-ray');
                        pnlOpts = $('<div></div>').appendTo(pnl);
                        pnlOpts.pnlHeatPumpHeaterOptions({ type: type, tempUnits: o.tempUnits });
                        break;
                    case 'ultratemp':
                        cols[0].elGlyph().removeClass().addClass('fas').addClass('fa-x-ray');
                        pnlOpts = $('<div></div>').appendTo(pnl);
                        pnlOpts.pnlUltraTempHeaterOptions({ type: type, tempUnits: o.tempUnits });
                        break;
                    case 'maxetherm':
                        cols[0].elGlyph().removeClass().addClass('fas').addClass('fa-fire-alt');
                        pnlOpts = $('<div></div>').appendTo(pnl);
                        pnlOpts.pnlMaxEThermHeaterOptions({ type: type, tempUnits: o.tempUnits, coolDownDelay: o.coolDownDelay });
                        break;
                    case 'hybrid':
                        cols[0].elGlyph().removeClass().addClass('fas').addClass('fa-fire');
                        pnlOpts = $('<div></div>').appendTo(pnl);
                        pnlOpts.pnlHybridHeaterOptions({ type: type, tempUnits: o.tempUnits });
                        break;
                    case 'jxi':
                        cols[0].elGlyph().removeClass().addClass('fas').addClass('fa-fire-alt');
                        pnlOpts = $('<div></div>').appendTo(pnl);
                        pnlOpts.pnlJxiHeaterOptions({ type: type, tempUnits: o.tempUnits });
                        break;
                    case 'lxi':
                        cols[0].elGlyph().removeClass().addClass('fas').addClass('fa-fire-alt');
                        pnlOpts = $('<div></div>').appendTo(pnl);
                        pnlOpts.pnlLxiHeaterOptions({ type: type, tempUnits: o.tempUnits });
                        break;
                }
            }
            return pnl;
        },
        dataBind: function (obj) {
            var self = this, o = self.options, el = self.element;
            var acc = el.find('div.picAccordian:first');
            var cols = acc[0].columns();
            cols[0].elText().text(obj.name || 'Heater');

           
            var htype = o.heaterTypes.find(elem => elem.val === obj.type) || { val: 0, name: 'unknown', desc: 'Unknown' };
            var body = o.bodies.find(elem => elem.val === obj.body) || { val: 0, name: '', desc: 'No Body' };
            var pnl = el.find('div.pnl-heater-options:first');
            var hasId = typeof obj.id !== 'undefined' && obj.id > 0;
            cols[1].elText().text(htype.desc);
            cols[2].elText().text(body.desc);
            el.find('div[data-bind="type"]').each(function () { this.disabled(hasId); });
            // el.find('div[data-bind="isVirtual"]').each(function () { this.disabled(hasId); });
            self._setOptionsPanel(htype);
            if (obj.master === 1) el.find('div.pnlDeviceBinding').show();
            else el.find('div.pnlDeviceBinding').hide();
            dataBinder.bind(el, obj);
        }
    });
    $.widget('pic.pnlSolarHeaterOptions', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty();
            el.addClass('pnl-solar-heater');
            var binding = '';
            var line = $('<div></div>').appendTo(el);
            $('<div></div>').appendTo(line).valueSpinner({ value:6, labelText: 'Start Temp Delta', binding: binding + 'startTempDelta', min: 4, max: 9, step: 1, units: '&deg;' + o.tempUnits.name, inputAttrs: { maxlength: 4 }, labelAttrs: { style: { marginRight: '.25rem' } } });
            $('<div></div>').appendTo(line).valueSpinner({ value:3, labelText: 'Stop Temp Delta', binding: binding + 'stopTempDelta', min: 2, max: 5, step: 1, units: '&deg;' + o.tempUnits.name, inputAttrs: { maxlength: 4 }, labelAttrs: { style: { marginLeft:'2rem', marginRight: '.25rem' } } });
            line = $('<div></div>').appendTo(el);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Nocturnal Cooling', binding: 'coolingEnabled' }).attr('title', 'Check this to enable cooling when the body is on/r/nand the solar temperature is less than the water temperature.');
        },
        dataBind: function (obj) {
            var self = this, o = self.options, el = self.element;
            dataBinder.bind(el, obj);
        }
    });
    $.widget('pic.pnlGasHeaterOptions', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            var controller = $('body').attr('data-controllertype');
            el.empty();
            el.addClass('pnl-gas-heater');
            var binding = '';
            var line = $('<div></div>').appendTo(el);
            // Alright if this is a Nixie heater then we should allow a few more options.
            if (controller === 'nixie') {
                $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Cooldown Delay', binding: binding + 'cooldownDelay', min: 0, max: 10, step: 1, fmtMask: '#,##0.#', units: 'min', inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { width: '7.5rem', marginLeft: '1rem', marginRight: '.25rem' } } });
                line = $('<div></div>').appendTo(el);
                $('<div></div>').appendTo(line).valueSpinner({ value: 1, canEdit: true, labelText: 'Stop Temp Delta', binding: binding + 'stopTempDelta', min: 0, max: 10, step: 1, fmtMask: '#,##0.#', units: '&deg' + o.tempUnits.name, inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { width: '7.5rem', marginLeft: '1rem', marginRight: '.25rem' } } });
                $('<div></div>').appendTo(line).valueSpinner({ value: 1, canEdit: true, labelText: 'Minimum Cycle Time', binding: binding + 'minCycleTime', min: 0, max: 30, step: 1, fmtMask: '#,##0.#', units: 'min', inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { marginLeft: '1rem', marginRight: '.25rem' } } });
            }
            else {
                $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Cooldown Delay', binding: binding + 'cooldownDelay', min: 0, max: 10, step: 1, units: 'min', inputAttrs: { maxlength: 4 }, labelAttrs: { style: { width: '7.5rem', marginLeft: '1rem', marginRight: '.25rem' } } });
            }
        },
        dataBind: function (obj) {
            var self = this, o = self.options, el = self.element;
            dataBinder.bind(el, obj);
        }
    });
    $.widget('pic.pnlHeatPumpHeaterOptions', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty();
            el.addClass('pnl-heatpump-heater');
            var controller = $('body').attr('data-controllertype');
            var binding = '';
            var line = $('<div></div>').appendTo(el);
            // Alright if this is a Nixie heater then we should allow a few more options.
            if (controller === 'nixie') {
                //$('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Cooldown Delay', binding: binding + 'cooldownDelay', min: 0, max: 10, step: 1, fmtMask: '#,##0.#', units: 'min', inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { width: '7.5rem', marginLeft: '1rem', marginRight: '.25rem' } } });
                line = $('<div></div>').appendTo(el);
                $('<div></div>').appendTo(line).valueSpinner({ value: 1, canEdit: true, labelText: 'Stop Temp Delta', binding: binding + 'stopTempDelta', min: 0, max: 10, step: 1, fmtMask: '#,##0.#', units: '&deg' + o.tempUnits.name, inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { width: '7.5rem', marginLeft: '1rem', marginRight: '.25rem' } } });
                $('<div></div>').appendTo(line).valueSpinner({ value: 1, canEdit: true, labelText: 'Minimum Cycle Time', binding: binding + 'minCycleTime', min: 0, max: 30, step: 1, fmtMask: '#,##0.#', units: 'min', inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { marginLeft: '1rem', marginRight: '.25rem' } } });
            }
            else {
                $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Cooldown Delay', binding: binding + 'cooldownDelay', min: 0, max: 10, step: 1, units: 'min', inputAttrs: { maxlength: 4 }, labelAttrs: { style: { width: '7.5rem', marginLeft: '1rem', marginRight: '.25rem' } } });
            }
        },
        dataBind: function (obj) {
            var self = this, o = self.options, el = self.element;
            dataBinder.bind(el, obj);
        }
    });

    $.widget('pic.pnlMasterTempHeaterOptions', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty();
            el.addClass('pnl-mastertemp-heater');
            var controller = $('body').attr('data-controllertype');
            var binding = '';
            var line = $('<div></div>').appendTo(el);
            var addresses = [];
            for (var i = 1; i <= 16; i++) addresses.push({ val: i + 111, desc: i });
            $('<div></div>').appendTo(line).pickList({
                required: true,
                bindColumn: 0, displayColumn: 1, labelText: 'Address', binding: binding + 'address',
                columns: [{ binding: 'val', hidden: true, text: 'Address' }, { binding: 'desc', text: 'Address' }],
                items: addresses, inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { width: '4rem', marginLeft: '.25rem' } }
            });
            if (controller === 'nixie') {
                $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Cooldown Delay', binding: binding + 'cooldownDelay', min: 0, max: 10, step: 1, fmtMask: '#,##0.#', units: 'min', inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { width: '7.5rem', marginLeft: '1rem', marginRight: '.25rem' } } });
                line = $('<div></div>').appendTo(el);
                $('<div></div>').appendTo(line).valueSpinner({ value: 1, canEdit: true, labelText: 'Stop Temp Delta', binding: binding + 'stopTempDelta', min: 0, max: 10, step: 1, fmtMask: '#,##0.#', units: '&deg' + o.tempUnits.name, inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { width: '7.5rem', marginLeft: '1rem', marginRight: '.25rem' } } });
                $('<div></div>').appendTo(line).valueSpinner({ value: 1, canEdit: true, labelText: 'Minimum Cycle Time', binding: binding + 'minCycleTime', min: 0, max: 30, step: 1, fmtMask: '#,##0.#', units: 'min', inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { marginLeft: '1rem', marginRight: '.25rem' } } });
            }
            else
                $('<div></div>').appendTo(line).valueSpinner({ labelText: 'Cooldown Delay', binding: binding + 'cooldownDelay', min: 1, max: 10, step: 1, units: 'min', inputAttrs: { maxlength: 4 }, labelAttrs: { style: { marginLeft: '1rem', marginRight: '.25rem' } } });
        },
        dataBind: function (obj) {
            var self = this, o = self.options, el = self.element;
            dataBinder.bind(el, obj);
        }
    });
    $.widget('pic.pnlUltraTempHeaterOptions', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty();
            el.addClass('pnl-ultratemp-heater');
            var binding = '';
            var line = $('<div></div>').appendTo(el);
            var addresses = [];
            for (var i = 1; i <= 16; i++) addresses.push({ val: i + 111, desc: i });
            $('<div></div>').appendTo(line).pickList({
                required: true,
                bindColumn: 0, displayColumn: 1, labelText: 'Address', binding: binding + 'address',
                columns: [{ binding: 'val', hidden: true, text: 'Address' }, { binding: 'desc', text: 'Address' }],
                items: addresses, inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { width: '4rem' } }
            });
            $('<div></div>').appendTo(line).valueSpinner({ labelText: 'Differential Temp', binding: binding + 'differentialTemp', min: 3, max: 9, step: 1, units: '&deg;' + o.tempUnits.name, inputAttrs: { maxlength: 4 }, labelAttrs: { style: { marginLeft:'2rem', marginRight: '.25rem' } } });
            line = $('<div></div>').appendTo(el);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Cooling Enabled', binding: 'coolingEnabled' }).attr('title', 'Check this to enable cooling when the body is on/r/nand the solar temperature is less than the water temperature.');
        },
        dataBind: function (obj) {
            var self = this, o = self.options, el = self.element;
            dataBinder.bind(el, obj);
        }
    });
    $.widget('pic.pnlMaxEThermHeaterOptions', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty();
            el.addClass('pnl-maxetherm-heater');
            var binding = '';
            var line = $('<div></div>').appendTo(el);
            var addresses = [];
            for (var i = 1; i <= 16; i++) addresses.push({ val: i + 111, desc: i });
            $('<div></div>').appendTo(line).pickList({
                required: true,
                bindColumn: 0, displayColumn: 1, labelText: 'Address', binding: binding + 'address',
                columns: [{ binding: 'val', hidden: true, text: 'Address' }, { binding: 'desc', text: 'Address' }],
                items: addresses, inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { width:'4rem', marginLeft: '.25rem' } }
            });
            $('<div></div>').appendTo(line).valueSpinner({ labelText: 'Cooldown Delay', binding: binding + 'cooldownDelay', min: 1, max: 10, step: 1, units: 'min', inputAttrs: { maxlength: 4 }, labelAttrs: { style: { marginLeft:'1rem', marginRight: '.25rem' } } });
        },
        dataBind: function (obj) {
            var self = this, o = self.options, el = self.element;
            dataBinder.bind(el, obj);
        }
    });
    $.widget('pic.pnlHybridHeaterOptions', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty();
            el.addClass('pnl-hybrid-heater');
            var pnlType = $('div.dashOuter').attr('data-controllertype').toLowerCase();
            var binding = '';
            var line = $('<div></div>').appendTo(el);
            $('<input type="hidden"></input>').appendTo(line).attr('data-bind', 'efficiencyMode').attr('data-datatype', 'int').val(3);
            var addresses = [];
            for (var i = 1; i <= 16; i++) addresses.push({ val: i + 111, desc: i });
            $('<div></div>').appendTo(line).pickList({
                required: true,
                bindColumn: 0, displayColumn: 1, labelText: 'Address', binding: binding + 'address',
                columns: [{ binding: 'val', hidden: true, text: 'Address' }, { binding: 'desc', text: 'Address' }],
                items: addresses, inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { width:'4rem' } }
            });
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Boost Temp', binding: binding + 'maxBoostTemp', min: 5, max: 10, step: 1, units: '&deg;' + o.tempUnits.name, inputAttrs: { style: { width: '2.5rem' } }, labelAttrs: { style: { marginLeft: '1rem', marginRight: '.25rem' } } });
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Economy Time', binding: binding + 'economyTime', min: 1, max: 6, step: 1, units: 'hrs', inputAttrs: { style: { width: '2.5rem' } }, labelAttrs: { style: { marginLeft: '1rem', marginRight: '.25rem' } } });
            if (!pnlType.endsWith('touch') && !pnlType.startsWith('intellicenter')) {
                el.find('div[data-bind=maxBoostTemp]').each(function () { this.disabled(true); });
                el.find('div[data-bind=economyTime]').each(function () { this.disabled(true); });
            }
        },
        dataBind: function (obj) {
            var self = this, o = self.options, el = self.element;
            dataBinder.bind(el, obj);
        }
    });

    $.widget('pic.pnlJxiHeaterOptions', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty();
            el.addClass('pnl-jxi-heater');
            var binding = '';
            var line = $('<div></div>').appendTo(el);
            var addresses = [];
            for (var i = 0; i <= 3; i++) addresses.push({ val: 104 + i, desc: (i + 1).toString() });
            $('<div></div>').appendTo(line).pickList({
                required: true,
                bindColumn: 0, displayColumn: 1, labelText: 'Address', binding: binding + 'address',
                columns: [{ binding: 'val', hidden: true, text: 'Address' }, { binding: 'desc', text: 'Address' }],
                items: addresses, inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { width: '4rem', marginLeft: '.25rem' } }
            });
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Cooldown Delay', binding: binding + 'cooldownDelay', min: 0, max: 10, step: 1, fmtMask: '#,##0.#', units: 'min', inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { width: '7.5rem', marginLeft: '1rem', marginRight: '.25rem' } } });
            line = $('<div></div>').appendTo(el);
            $('<div></div>').appendTo(line).valueSpinner({ value: 1, canEdit: true, labelText: 'Start Temp Delta', binding: binding + 'startTempDelta', min: 0, max: 10, step: 1, fmtMask: '#,##0.#', units: '&deg;' + o.tempUnits.name, inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { width: '7.5rem', marginLeft: '1rem', marginRight: '.25rem' } } });
            $('<div></div>').appendTo(line).valueSpinner({ value: 1, canEdit: true, labelText: 'Stop Temp Delta', binding: binding + 'stopTempDelta', min: 0, max: 10, step: 1, fmtMask: '#,##0.#', units: '&deg;' + o.tempUnits.name, inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { marginLeft: '1rem', marginRight: '.25rem' } } });
            line = $('<div></div>').appendTo(el);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Feed Temp to Active Body', binding: 'feedBodyTemp' }).attr('title', 'When enabled, the heater\'s built-in water temperature sensor\r\nfeeds the body\'s water temp display. Only updates while\r\nthe body circuit is running.');
        },
        dataBind: function (obj) {
            var self = this, o = self.options, el = self.element;
            dataBinder.bind(el, obj);
        }
    });
    $.widget('pic.pnlLxiHeaterOptions', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty();
            el.addClass('pnl-lxi-heater');
            var binding = '';
            var line = $('<div></div>').appendTo(el);
            var addresses = [];
            for (var i = 0; i <= 3; i++) addresses.push({ val: 56 + i, desc: (i + 1).toString() });
            $('<div></div>').appendTo(line).pickList({
                required: true,
                bindColumn: 0, displayColumn: 1, labelText: 'Address', binding: binding + 'address',
                columns: [{ binding: 'val', hidden: true, text: 'Address' }, { binding: 'desc', text: 'Address' }],
                items: addresses, inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { width: '4rem', marginLeft: '.25rem' } }
            });
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Cooldown Delay', binding: binding + 'cooldownDelay', min: 0, max: 10, step: 1, fmtMask: '#,##0.#', units: 'min', inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { width: '7.5rem', marginLeft: '1rem', marginRight: '.25rem' } } });
            line = $('<div></div>').appendTo(el);
            $('<div></div>').appendTo(line).valueSpinner({ value: 1, canEdit: true, labelText: 'Start Temp Delta', binding: binding + 'startTempDelta', min: 0, max: 10, step: 1, fmtMask: '#,##0.#', units: '&deg;' + o.tempUnits.name, inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { width: '7.5rem', marginLeft: '1rem', marginRight: '.25rem' } } });
            $('<div></div>').appendTo(line).valueSpinner({ value: 1, canEdit: true, labelText: 'Stop Temp Delta', binding: binding + 'stopTempDelta', min: 0, max: 10, step: 1, fmtMask: '#,##0.#', units: '&deg;' + o.tempUnits.name, inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { marginLeft: '1rem', marginRight: '.25rem' } } });
            line = $('<div></div>').appendTo(el);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Feed Temp to Active Body', binding: 'feedBodyTemp' }).attr('title', 'When enabled, the heater\'s built-in water temperature sensor\r\nfeeds the body\'s water temp display. Only updates while\r\nthe body circuit is running.');
        },
        dataBind: function (obj) {
            var self = this, o = self.options, el = self.element;
            dataBinder.bind(el, obj);
        }
    });

})(jQuery);

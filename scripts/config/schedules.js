(function ($) {
    $.widget('pic.configSchedules', {
        options: { schedGroup: 0 },
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.addClass('picConfigCategory');
            el.addClass('cfgSchedules');
            $.getApiService('/config/options/schedules', null, 'Loading Options...', function (opts, status, xhr) {
                console.log(opts);
                var schedules = opts.schedules.filter(function(s) { return (s.schedGroup || 0) === o.schedGroup; }).sort((a, b) => a.id - b.id);
                for (var i = 0; i < schedules.length; i++) {
                    $('<div></div>').appendTo(el).pnlScheduleConfig({
                        bodies: opts.bodies,
                        scheduleTimeTypes: opts.scheduleTimeTypes, maxSchedules: opts.maxSchedules,
                        scheduleTypes: opts.scheduleTypes, scheduleDays: opts.scheduleDays, heatSources: opts.heatSources,
                        tempUnits: opts.tempUnits, circuits: opts.circuits, clockMode: opts.clockMode, displayTypes: opts.displayTypes,
                        sunWindowPlacements: opts.sunWindowPlacements || []
                    })[0].dataBind(schedules[i]);
                }
                var btnPnl = $('<div class="picBtnPanel btn-panel"></div>').appendTo(el);
                var btnAdd = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Add Schedule', icon: '<i class="fas fa-plus" ></i>' });
                btnAdd.on('click', function (e) {
                    var groups = el.find('div.picConfigCategory.cfgSchedule');
                    var pnl = $('<div></div>').insertBefore(btnPnl).pnlScheduleConfig({
                        scheduleTimeTypes: opts.scheduleTimeTypes, maxSchedules: opts.maxSchedules,
                        scheduleTypes: opts.scheduleTypes, scheduleDays: opts.scheduleDays, heatSources: opts.heatSources, bodies: opts.bodies,
                        tempUnits: opts.tempUnits, circuits: opts.circuits, clockMode: opts.clockMode, displayTypes: opts.displayTypes,
                        sunWindowPlacements: opts.sunWindowPlacements || []
                    });
                    var st = opts.scheduleTypes.find(elem => elem.name === 'repeat') || opts.scheduleTypes[0];
                    var tt = opts.scheduleTimeTypes.find(elem => elem.name === 'manual') || opts.scheduleTimeTypes[0];
                    pnl[0].dataBind({
                        id: -1, startTime: 480, endTime: 1020,
                        scheduleType: st.val, startTimeType: tt.val, endTimeType: tt.val, circuit: 0, display: 0,
                        heatSetpoint: 78, coolSetpoint: 100, heatSource: 0, scheduleDays: 127, schedGroup: o.schedGroup,
                        startDate: (function() { var today = new Date(); today.setHours(0, 0, 0, 0); return today.toISOString(); })()
                       
                    });
                    pnl.find('div.picAccordian:first')[0].expanded(true);
                });
            });
        }
    });
})(jQuery); // Schedules Tab
(function ($) {
    $.widget('pic.pnlScheduleConfig', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty();
            el.addClass('picConfigCategory cfgSchedule');
            var binding = '';
            var acc = $('<div></div>').appendTo(el).accordian({
                columns: [{ binding: 'circuit', glyph: 'far fa-calendar-alt', style: { width: '9rem' } }, { binding: 'timespan', style: { width: '10rem', textAlign: 'center', whiteSpace: 'nowrap' } }, { binding: 'days', style: { width: '16rem', whiteSpace: 'nowrap', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle' } }]
            });
            var pnl = acc.find('div.picAccordian-contents');
            // Figure out our formats.
            o.fmtTime = o.clockMode === 12 ? 'h:mmtt' : 'HH:mm';
            o.fmtTimeEmpty = o.clockMode === 12 ? '12:00am' : '00:00';

            var line = $('<div></div>').addClass('schedule-circuit').appendTo(pnl);
            if ($('div.dashOuter').data('controllertype').includes('Nixie')) {
                $('<div></div>').appendTo(line).checkbox({ labelText: 'Disabled', binding: binding + 'disabled', display: 'inline-block' });
            }
            line = $('<div></div>').addClass('schedule-circuit').appendTo(pnl);
            $('<input type="hidden" data-datatype="int"></input>').attr('data-bind', 'id').appendTo(line);
            $('<input type="hidden" data-datatype="int"></input>').attr('data-bind', 'schedGroup').appendTo(line);
            $('<div></div>').appendTo(line).pickList({
                required: true, bindColumn: 0, displayColumn: 1, labelText: 'Circuit', binding: binding + 'circuit',
                columns: [{ binding: 'id', hidden: true, text: 'Id', style: { whiteSpace: 'nowrap' } }, { binding: 'name', text: 'Circuit', style: { whiteSpace: 'nowrap' } }],
                items: o.circuits, inputAttrs: { style: { width: '9rem' } }, labelAttrs: { style: { marginLeft: '.25rem' } }
            });
            $('<div></div>').appendTo(line).pickList({
                required: true, bindColumn: 0, displayColumn: 1, labelText: 'Occurance', binding: binding + 'scheduleType',
                columns: [{ binding: 'val', hidden: true, text: 'Id', style: { whiteSpace: 'nowrap' } }, { binding: 'desc', text: 'Occurance', style: { whiteSpace: 'nowrap' } }],
                items: o.scheduleTypes, inputAttrs: { style: { width: '5.4rem' } }, labelAttrs: { style: { marginLeft: '.25rem' } }
            });
            if (typeof o.displayTypes !== 'undefined') {
                $('<div></div>').appendTo(line).pickList({
                    required: true, bindColumn: 0, displayColumn: 1, labelText: 'Display', binding: binding + 'display',
                    columns: [{ binding: 'val', hidden: true, text: 'Id', style: { whiteSpace: 'nowrap' } }, { binding: 'desc', text: 'Display', style: { whiteSpace: 'nowrap' } }],
                    items: o.displayTypes, inputAttrs: { style: { width: '6.7rem' } }, labelAttrs: { style: { marginLeft: '.25rem' } }
                });
            }
            var line_outer = $('<div></div>').appendTo(pnl);
            line = $('<div></div>').addClass('schedule-heatsource').css({ display: 'inline-block' }).appendTo(line_outer).hide(); $('<div></div>').appendTo(line).pickList({
                required: true, bindColumn: 0, displayColumn: 1, labelText: 'Heat Source', binding: binding + 'heatSource',
                columns: [{ binding: 'val', hidden: true, text: 'Id', style: { whiteSpace: 'nowrap' } }, { binding: 'desc', text: 'Heat Source', style: { whiteSpace: 'nowrap' } }],
                items: o.heatSources, inputAttrs: { style: { width: '8rem' } }, labelAttrs: { style: { width: '5.75rem', marginLeft: '.25rem' } }
            }).on('selchanged', function (evt) {
                var p = el.find('div.schedule-heatsource');
                if (typeof evt.newItem === 'undefined' || evt.newItem.name === 'nochange' || evt.newItem.name === 'off') {
                    p.find('div.picValueSpinner[data-bind=heatSetpoint]').hide()[0].required(false);
                    p.find('div.picValueSpinner[data-bind=coolSetpoint]').hide()[0].required(false);
                }
                else {
                    p.find('div.picValueSpinner[data-bind=heatSetpoint]').show()[0].required(true);
                    if (evt.newItem.hasCoolSetpoint === true && $('div.dashOuter').data('controllertype').indexOf('touch') === -1)
                        p.find('div.picValueSpinner[data-bind=coolSetpoint]').show()[0].required(true);
                    else
                        p.find('div.picValueSpinner[data-bind=coolSetpoint]').hide()[0].required(false);

                }
            });
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Heat', binding: binding + 'heatSetpoint', min: 0, max: 104, step: 1, maxlength: 5, units: '°' + o.tempUnits.name, labelAttrs: { style: { marginLeft: '1rem', marginRight: '.25rem' } } });
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Cool', binding: binding + 'coolSetpoint', min: 0, max: 104, step: 1, maxlength: 5, units: '°' + o.tempUnits.name, labelAttrs: { style: { marginLeft: '1rem', marginRight: '.25rem' } } }).hide();
            $('<hr></hr>').appendTo(pnl);
            var pnlTime = $('<div></div>').appendTo(pnl).css({ display: 'table-row' });
            var inline = $('<div></div>').addClass('inline-line').appendTo(pnlTime).css({ display: 'table-cell', width: '100%' });

            line = $('<div></div>').addClass('schedule-time').addClass('start-time').appendTo(inline);
            $('<label></label>').appendTo(line).text('Start Time').css({ marginLeft: '.25rem', width: '5rem', display: 'inline-block' });
            $('<div></div>').appendTo(line).pickList({
                required: true, bindColumn: 0, displayColumn: 1, labelText: '', binding: binding + 'startTimeType',
                columns: [{ binding: 'val', hidden: true, text: 'Id', style: { whiteSpace: 'nowrap' } }, { binding: 'desc', text: 'Start Type', style: { whiteSpace: 'nowrap' } }],
                items: o.scheduleTimeTypes, inputAttrs: { style: { width: '4rem' } }, labelAttrs: { style: { display: 'none' } }
            }).css({ marginRight: '.25rem' });
            $('<div></div>').appendTo(line).timeSpinner({ labelText: '', binding: binding + 'startTime', min: 0, max: 1440, step: 30, fmtMask: o.fmtTime, emptyMask: o.fmtTimeEmpty, inputAttrs: { maxlength: 7 }, labelAttrs: {} });
            $('<div></div>').appendTo(line).pickList({
                value: -1,
                bindColumn: 0, displayColumn: 1, labelText: '', binding: binding + 'startTimeMult',
                columns: [{ binding: 'val', hidden: true, text: 'mult' }, { binding: 'direction', text: 'Offset' }, { binding: 'desc', text: 'Description', style: { whiteSpace: 'nowrap' } }],
                items: [{ val: -1, direction: 'minus', desc: 'Shedule time will start before sunrise/sunset' }, { val: 1, direction: 'plus', desc: 'Shedule time will start after sunrise/sunset' }],
                inputAttrs: { style: { width: '4rem' } }, labelAttrs: { style: { display: 'none' } }, style: {}
            });

            var line1 = $('<div></div>').addClass('schedule-time').addClass('timeoffset').appendTo(line);
            $('<div></div>').appendTo(line1).valueSpinner({ canEdit: true, labelText: '', binding: binding + 'startTimeOffsetHours', min: 0, max: 6, step: 1, units: 'hrs', inputAttrs: { maxlength: 2 }, labelAttrs: { style: { marginLeft: '.25rem', width: '5rem' } }, style: { marginRight: '.25rem' } });
            $('<div></div>').appendTo(line1).valueSpinner({ canEdit: true, labelText: '', binding: binding + 'startTimeOffsetMins', min: 0, max: 59, step: 1, units: 'min', inputAttrs: { maxlength: 3 }, labelAttrs: {} });

            line = $('<div></div>').addClass('schedule-time').addClass('end-time').appendTo(inline).css({ marginTop: '3px' });
            $('<label></label>').appendTo(line).text('End Time').css({ marginLeft: '.25rem', width: '5rem', display: 'inline-block' });
            $('<div></div>').appendTo(line).pickList({
                required: true, bindColumn: 0, displayColumn: 1, labelText: '', binding: binding + 'endTimeType',
                columns: [{ binding: 'val', hidden: true, text: 'Id', style: { whiteSpace: 'nowrap' } }, { binding: 'desc', text: 'End Type', style: { whiteSpace: 'nowrap' } }],
                // A sun window is chosen as the start type and sets both ends.
                items: o.scheduleTimeTypes.filter(function (elem) { return elem.name !== 'sunWindow'; }), inputAttrs: { style: { width: '4rem' } }, labelAttrs: { style: { display: 'none' } }
            }).css({ marginRight: '.25rem' });
            $('<div></div>').appendTo(line).timeSpinner({ labelText: '', binding: binding + 'endTime', min: 0, max: 1440, step: 30, fmtMask: o.fmtTime, emptyMask: o.fmtTimeEmpty, inputAttrs: { maxlength: 7 }, labelAttrs: {} });
            $('<div></div>').appendTo(line).pickList({
                value: -1,
                bindColumn: 0, displayColumn: 1, labelText: '', binding: binding + 'endTimeMult',
                columns: [{ binding: 'val', hidden: true, text: 'mult' }, { binding: 'direction', text: 'Offset' }, { binding: 'desc', text: 'Description', style: { whiteSpace: 'nowrap' } }],
                items: [{ val: -1, direction: 'minus', desc: 'Shedule time will end before sunrise/sunset' }, { val: 1, direction: 'plus', desc: 'Shedule time will end after sunrise/sunset' }],
                inputAttrs: { style: { width: '4rem' } }, labelAttrs: { style: { display: 'none' } }, style: {}
            });
            line1 = $('<div></div>').addClass('schedule-time').addClass('timeoffset').appendTo(line);
            $('<div></div>').appendTo(line1).valueSpinner({ canEdit: true, labelText: '', binding: binding + 'endTimeOffsetHours', min: 0, max: 6, step: 1, units: 'hrs', inputAttrs: { maxlength: 2 }, labelAttrs: { style: { marginLeft: '.25rem', width: '5rem' } }, style: { marginRight: '.25rem' } });
            $('<div></div>').appendTo(line1).valueSpinner({ canEdit: true, labelText: '', binding: binding + 'endTimeOffsetMins', min: 0, max: 59, step: 1, units: 'min', inputAttrs: { maxlength: 3 }, labelAttrs: {} });

            // Sun window settings.  Only shown when the start type is Sun Window.
            line = $('<div></div>').addClass('sun-window').appendTo(inline).css({ marginTop: '3px' }).hide();
            $('<label></label>').appendTo(line).text('Length').css({ marginLeft: '.25rem', width: '5rem', display: 'inline-block' });
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Multiple of', binding: binding + 'sunWindowHours', min: 1, max: 24, step: 1, units: 'hrs', inputAttrs: { maxlength: 2 }, labelAttrs: { style: { marginRight: '.25rem' } } });
            line = $('<div></div>').addClass('sun-window').appendTo(inline).css({ marginTop: '3px' }).hide();
            $('<label></label>').appendTo(line).text('Placement').css({ marginLeft: '.25rem', width: '5rem', display: 'inline-block' });
            $('<div></div>').appendTo(line).pickList({
                bindColumn: 0, displayColumn: 1, labelText: '', binding: binding + 'sunWindowPlacement',
                columns: [{ binding: 'val', hidden: true, text: 'Id', style: { whiteSpace: 'nowrap' } }, { binding: 'desc', text: 'Placement', style: { whiteSpace: 'nowrap' } }],
                items: o.sunWindowPlacements || [], inputAttrs: { style: { width: '11rem' } }, labelAttrs: { style: { display: 'none' } }
            });
            line = $('<div></div>').addClass('sun-window').appendTo(inline).css({ marginTop: '3px', marginLeft: '.25rem', fontSize: '.8rem', fontStyle: 'italic' }).hide();
            $('<span></span>').appendTo(line).text('Covers sunrise to sunset in whole multiples of the hours above.  The controller rewrites the start and end times each day.');

            inline =$('<div></div>').addClass('inline-line').appendTo(pnlTime).css({ display: 'table-cell', paddingRight: '7px' });
            $('<div></div>').appendTo(inline).pnlScheduleDays({ singleSelect: false, days: o.scheduleDays, binding: binding + 'scheduleDays' }).css({ paddingLeft: '.25rem' });
            line = $('<div></div>').appendTo(inline);
            $('<label style="display:inline-block;width:7rem;font-weight:bold;white-space:nowrap">Schedule Date</label>').appendTo(line);
            $('<input type="date" data-bind="' + binding + 'startDate" data-datatype="date" style="padding:0.2rem 0.4rem"/>').appendTo(line);
            var btnPnl = $('<div class="picBtnPanel btn-panel"></div>').appendTo(pnl);
            var btnSave = $('<div id="btnSaveBody"></div>').appendTo(btnPnl).actionButton({ text: 'Save Schedule', icon: '<i class="fas fa-save"></i>' });
            el.on('selchanged', 'div.picPickList[data-bind=circuit]', function (evt) {
                var p = el.find('div.schedule-heatsource');
                var body = o.bodies.find(elem => elem.circuit === evt.newItem.id);
                p.find('div.picPickList[data-bind=heatSource]').each(function () {
                    this.required(typeof body !== 'undefined');
                    this.items(typeof body !== 'undefined' ? body.heatSources : o.heatSources);
                    // Check to see if we have a valid selection if not set it to 0.
                    if (this.val() === null) this.val(0);
                });
                typeof body !== 'undefined' ? p.show() : p.hide();
            });
            el.on('selchanged', 'div.picPickList[data-bind$=TimeType]', function (evt) {
                var p = $(evt.currentTarget).parents('div.schedule-time:first');
                var spin = p.find('div.picValueSpinner[data-bind$=Time]:first');
                var mult = p.find('div.picPickList[data-bind$=Mult]:first');
                var off = p.find('div.timeoffset:first');
                let ct = $('body').attr('data-controllertype');
                let isStart = $(evt.currentTarget).attr('data-bind') === binding + 'startTimeType';
                if (typeof evt.newItem !== 'undefined' && evt.newItem.name === 'sunWindow') {
                    // The times are fixed values the controller fills in, so there is nothing to enter.
                    spin.hide();
                    mult.hide();
                    off.hide();
                    spin[0].required(false);
                }
                else if (typeof evt.newItem === 'undefined') { /* No selection; leave the inputs as they are. */ }
                else if (evt.newItem.name !== 'manual') {
                    spin.hide();
                    if (ct === 'nixie') { mult.show(); off.show(); }
                    else { mult.hide(); off.hide(); }
                    spin[0].required(false);
                }
                else {
                    spin.show();
                    mult.hide();
                    off.hide();
                    spin[0].required(true);
                }
                if (isStart) self._setSunWindow(typeof evt.newItem !== 'undefined' && evt.newItem.name === 'sunWindow');
            });
            el.on('selchanged', 'div.picPickList[data-bind=scheduleType]', function (evt) { self._setScheduleType(evt.newItem.val); });
            btnSave.on('click', function (e) {
                var p = $(e.target).parents('div.picAccordian-contents:first');
                var v = dataBinder.fromElement(p);
                let st = o.scheduleTimeTypes.find(elem => elem.val === v.startTimeType);
                let et = o.scheduleTimeTypes.find(elem => elem.val === v.endTimeType);
                let ct = $('body').attr('data-controllertype');
                if (dataBinder.checkRequired(el, true)) {
                    if (typeof st !== 'undefined' && st.name === 'sunWindow') {
                        // The controller works out the times; send the window settings instead.
                        var hrs = Number(v.sunWindowHours);
                        if (!Number.isInteger(hrs) || hrs < 1 || hrs > 24) {
                            $('<div></div>')
                                .appendTo(p.find('div[data-bind$=sunWindowHours]'))
                                .fieldTip({ message: 'Use a whole number of hours<br/>from 1 to 24' });
                            return;
                        }
                        v.sunWindowHours = hrs;
                        if (typeof v.sunWindowPlacement !== 'number' || isNaN(v.sunWindowPlacement)) v.sunWindowPlacement = 0;
                        v.endTimeType = st.val;
                        v.startTimeOffset = 0;
                        v.endTimeOffset = 0;
                    }
                    else {
                        delete v.sunWindowHours;
                        delete v.sunWindowPlacement;
                        // Ok so lets calculate the startTime offset.
                        if (st.name !== 'manual') {
                            if (ct !== 'nixie' && st.name === 'sunset' && et.name === 'sunrise') {
                                $('<div></div>')
                                    .appendTo(p.find('div[data-bind$=startTime]'))
                                    .fieldTip({ message: 'The start time must be less than the end time' });
                                return;
                            }
                            v.startTimeOffset = v.startTimeMult * ((v.startTimeOffsetHours * 60) + v.startTimeOffsetMins);
                            if (Math.abs(v.startTimeOffset) > (6 * 60)) {
                                $('<div></div>')
                                    .appendTo(p.find('div[data-bind$=startTimeOffsetHours]'))
                                    .fieldTip({ message: 'You may only provide an offset<br/>of 6 hours or less' });
                                return;
                            }
                        }
                        else {
                            v.startTimeOffset = 0;
                            if (ct !== 'nixie' && et.name === 'manual' && v.startTime > v.endTime) {
                                $('<div></div>')
                                    .appendTo(p.find('div[data-bind$=startTime]'))
                                    .fieldTip({ message: 'The start time must be less than the end time' });
                                return;
                            }
                        }
                        if (et.name !== 'manual') {
                            v.endTimeOffset = v.endTimeMult * ((v.endTimeOffsetHours * 60) + v.endTimeOffsetMins);
                            if (Math.abs(v.endTimeOffset) > (6 * 60)) {
                                $('<div></div>')
                                    .appendTo(p.find('div[data-bind$=endTimeOffsetHours]'))
                                    .fieldTip({ message: 'You may only provide an offset<br/>of 6 hours or less' });
                                return;
                            }
                        }
                        else v.endTimeOffset = 0;
                    }
                    delete v.endTimeMult;
                    delete v.endTimeOffsetHours;
                    delete v.endTimeOffsetMins;
                    delete v.startTimeMult;
                    delete v.startTimeOffsetHours;
                    delete v.startTimeOffsetMins;
                    
                    // Remove startDate for Nixie controllers
                    if (ct === 'nixie') {
                        delete v.startDate;
                    }
                    
                    console.log(v);
                    $.putApiService('/config/schedule', v, 'Saving Schedule...', function (data, status, xhr) {
                        console.log({ data: data, status: status, xhr: xhr });
                        self.dataBind(data);
                    });
                }
            });
            var btnDelete = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Delete Schedule', icon: '<i class="fas fa-trash"></i>' });
            btnDelete.on('click', function (e) {
                var p = $(e.target).parents('div.picAccordian-contents:first');
                var v = dataBinder.fromElement(p);
                $.pic.modalDialog.createConfirm('dlgConfirmDeleteSchedule', {
                    message: 'Are you sure you want to delete schedule ' + v.id + '?',
                    width: '350px',
                    height: 'auto',
                    title: 'Confirm Delete Schedule',
                    buttons: [{
                        text: 'Yes', icon: '<i class="fas fa-trash"></i>',
                        click: function () {
                            $.pic.modalDialog.closeDialog(this);
                            if (v.id <= 0) p.parents('div.picConfigCategory.cfgSchedule:first').remove();
                            else {

                                console.log('Deleting Schedule');
                                $.deleteApiService('/config/schedule', v, 'Deleting Schedule...', function (c, status, xhr) {
                                    console.log('Return from deleteAPI Service');
                                    console.log(c);
                                    p.parents('div.picConfigCategory.cfgSchedule:first').remove();
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
        _setScheduleType: function (scheduleType) {
            var self = this, o = self.options, el = self.element;
            var schedType = $.extend(true,
                { name: 'repeat', desc: 'Repeats', startDate: false, startTime: true, endTime: true, days: 'multi' },
                o.scheduleTypes.find(elem => scheduleType === elem.val));
            
            // Check controller type for start date visibility
            let ct = $('body').attr('data-controllertype');
            let shouldShowStartDate = schedType.startDate && ct !== 'nixie';
            
            shouldShowStartDate ? el.find('input[data-bind=startDate]').closest('div').show() : el.find('input[data-bind=startDate]').closest('div').hide();
            schedType.startTime ? el.find('div.schedule-time.start-time').show().find('div.picValueSpinner[data-bind=startTime]')[0].required(true) : el.find('div.schedule-time.start-time').hide().find('div.picValueSpinner[data-bind=startTime]')[0].required(false);
            o.schedType = schedType;
            schedType.endTime && !o.isSunWindow ? el.find('div.schedule-time.end-time').show().find('div.picValueSpinner[data-bind=endTime]')[0].required(true) : el.find('div.schedule-time.end-time').hide().find('div.picValueSpinner[data-bind=endTime]')[0].required(false);
            el.find('div.pnl-scheduleDays').each(function () {
                switch (schedType.days) {
                    case 'single':
                        $(this).show();
                        this.singleSelect(true);
                        break;
                    case 'multi':
                        $(this).show();
                        this.singleSelect(false);
                        break;
                    default:
                        $(this).hide();
                        break;
                }
            });
            return schedType;
        },
        _setSunWindow: function (isSun) {
            // A sun window replaces the end time inputs with the hour multiple and placement.
            var self = this, o = self.options, el = self.element;
            var endLine = el.find('div.schedule-time.end-time');
            var endType = endLine.find('div.picPickList[data-bind=endTimeType]');
            var endSpin = endLine.find('div.picValueSpinner[data-bind=endTime]');
            o.isSunWindow = isSun === true;
            if (o.isSunWindow) {
                endLine.hide();
                if (endType.length > 0) endType[0].required(false);
                if (endSpin.length > 0) endSpin[0].required(false);
                el.find('div.sun-window').show();
            }
            else {
                el.find('div.sun-window').hide();
                if (endType.length > 0) {
                    var ev = endType[0].val();
                    if (typeof ev === 'undefined' || ev === null || ev === '') endType[0].val(0);
                    endType[0].required(true);
                }
                var showEnd = typeof o.schedType === 'undefined' || o.schedType.endTime;
                if (showEnd) endLine.show();
                var etName = (o.scheduleTimeTypes.find(function (elem) { return endType.length > 0 && elem.val === endType[0].val(); }) || { name: 'manual' }).name;
                if (endSpin.length > 0) endSpin[0].required(showEnd && etName === 'manual');
            }
        },
        getScheduleDays: function (bits, days) {
            var arr = [];
            for (var i = 0; i < days.length; i++) {
                var day = days[i];
                var hasDay = ((day.bitval || day.val) & 0xFF & bits) > 0;
                if (hasDay) arr.push(day);
            }
            return arr.sort((a, b) => a.val - b.val);
        },
        dataBind: function (obj) {
            var self = this, o = self.options, el = self.element;
            var acc = el.find('div.picAccordian:first');
            var cols = acc[0].columns();
            var circuit = o.circuits.find(elem => obj.circuit === elem.id) || { id: 0, name: '' };

            cols[0].elText().text(circuit.name);
            var schedType = self._setScheduleType(obj.scheduleType);

            var startTimeType = $.extend(true, { val: 0, name: 'manual', desc: 'Manual' }, o.scheduleTimeTypes.find(elem => obj.startTimeType === elem.val));
            var endTimeType = $.extend(true, { val: 0, name: 'manual', desc: 'Manual' }, o.scheduleTimeTypes.find(elem => obj.endTimeType === elem.val));
            var time = '';
            var timeTitle = null;
            // Sun window defaults, so switching a schedule to Sun Window starts from 3 h centered on solar noon.
            if (typeof obj.sunWindowHours !== 'number') obj.sunWindowHours = 3;
            if (obj.sunWindowPlacement !== null && typeof obj.sunWindowPlacement === 'object') obj.sunWindowPlacement = obj.sunWindowPlacement.val;
            if (typeof obj.sunWindowPlacement !== 'number') obj.sunWindowPlacement = 0;
            if (startTimeType.name === 'sunWindow') {
                // The stored times are fixed values the controller rewrites each day, so show them.
                var plc = (o.sunWindowPlacements || []).find(function (elem) { return elem.val === obj.sunWindowPlacement; });
                time = (obj.startTime || 0).formatTime(o.fmtTime, '--:--') + ' - ' + (obj.endTime || 0).formatTime(o.fmtTime, '--:--');
                timeTitle = 'Sun window: multiples of ' + obj.sunWindowHours + ' h' + (plc ? ', ' + plc.desc.toLowerCase() : '');
            }
            else if (schedType.startTime) {
                if (startTimeType.name !== 'manual') time = startTimeType.desc;
                else time = (obj.startTime || 0).formatTime(o.fmtTime, '--:--');
            }
            if (schedType.endTime && startTimeType.name !== 'sunWindow') {
                if (time.length > 0) time += ' - ';
                if (endTimeType.name !== 'manual') time += endTimeType.desc;
                else time += (obj.endTime || 0).formatTime(o.fmtTime, '--:--');
            }
            cols[1].elText().text(time).attr('title', timeTitle);
            var days = [];
            var daysTitle = '';
            // Get the days to show on the header.
            if (schedType.days !== false) {
                days = self.getScheduleDays(obj.scheduleDays, o.scheduleDays);
                if (days.length !== 7) {
                    for (var iday = 0; iday < days.length; iday++) {
                        if (iday > 0) daysTitle += ', ';
                        daysTitle += days[iday].desc.substring(0, 3);
                    }
                }
                else daysTitle = 'Every Day';
            }
            else if (schedType.startDate) {
                console.log(obj.startDate);
                daysTitle = Date.format(obj.startDate, 'MM/dd/yyyy', '--/--/----');
            }
            cols[2].elText().text(daysTitle);
            if (typeof obj.display === 'undefined') obj.display = 0;
            if (!obj.isActive || obj.disabled) cols[0].elGlyph().css({ color: 'silver' });
            else cols[0].elGlyph().css({ color: '' });
            // Convert our data for the start/end time offsets.
            var stOffset = Math.abs(obj.startTimeOffset || 0);
            obj.startTimeMult = (obj.startTimeOffset || 0) >= 0 ? 1 : -1;
            obj.startTimeOffsetHours = Math.floor(stOffset / 60);
            obj.startTimeOffsetMins = (stOffset) - (obj.startTimeOffsetHours * 60);
            var etOffset = Math.abs(obj.endTimeOffset || 0);
            obj.endTimeMult = (obj.endTimeOffset || 0) >= 0 ? 1 : -1;
            obj.endTimeOffsetHours = Math.floor(etOffset / 60);
            obj.endTimeOffsetMins = (etOffset) - (obj.endTimeOffsetHours * 60);
            console.log(obj);
            dataBinder.bind(el, obj);
            if (obj.startDate) el.find('input[data-bind=startDate]').val(String(obj.startDate).substring(0, 10));
            if (o.scheduleTimeTypes.length <= 1) el.find('div.picPickList[data-bind$=TimeType]').hide()[0].required(false);
            if ($('body').attr('data-controllertype') !== 'nixie') {
                el.find('div.picPickList[data-bind$=Mult]').hide();
                el.find('div.timeoffset').hide();
            }
            self._setSunWindow(startTimeType.name === 'sunWindow');
            if (startTimeType.name === 'sunWindow') {
                var st = el.find('div.schedule-time.start-time');
                st.find('div.picValueSpinner[data-bind=startTime]').hide();
                st.find('div.picPickList[data-bind$=Mult]').hide();
                st.find('div.timeoffset').hide();
            }
        }
    });
    $.widget('pic.pnlScheduleDays', {
        options: { singleSelect: false, days:[] },
        _create: function () {
            var self = this, o = self.options, el = self.element;
            o.days = o.days.sort((a, b) => a.dow - b.dow);
            self._buildControls();
            el[0].selected = function () { };
            el[0].singleSelect = function (val) { return self.singleSelect(val); };
            el[0].val = function (val) { return self.val(val); };
            el.attr('data-bind', o.binding);
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty();
            el.addClass('pnl-scheduleDays');
            var tbl = $('<div></div>').addClass('table').appendTo(el);
            $('<div></div>').addClass('table-caption').appendTo(tbl).text(o.singleSelect ? 'Day to Run' : 'Days to Run');
            var tbody = $('<div></div>').addClass('table-body').appendTo(tbl);
            var rowHeader = $('<div></div>').addClass('table-row').appendTo(tbody).addClass('dayheader');
            var rowDays = $('<div></div>').addClass('table-row').appendTo(tbody).addClass('days');

            // Build our header
            for (var i = 0; i < o.days.length; i++) {
                var day = o.days[i];
                $('<div></div>').addClass('table-cell').appendTo(rowHeader).addClass('dayheader').text(day.desc.substring(0, 3));
                var td = $('<div></div>').addClass('table-cell').appendTo(rowDays).addClass('day');
                td.attr('data-bitval', day.bitval || val);
                td.attr('data-selected', false);
            }
            el.on('click', 'div.table-cell.day', function (evt) {
                var cell = $(evt.currentTarget);
                var bsel = makeBool(cell.attr('data-selected'));
                if (o.singleSelect) {
                    if (!bsel) {
                        // Unselect all the other days.
                        el.find('div.table-cell.day[data-selected=true]').each(function () {
                            //$(this).find('i').removeClass('fas').addClass('far').removeClass('fa-times-circle').addClass('fa-circle');
                            $(this).attr('data-selected', false);
                        });
                    }
                    else bsel = false;
                }
                if (bsel) {
                    //cell.find('i').removeClass('fas').addClass('far').removeClass('fa-times-circle').addClass('fa-circle');
                    cell.attr('data-selected', false);
                }
                else {
                    //cell.find('i').removeClass('far').addClass('fas').removeClass('fa-circle').addClass('fa-times-circle');
                    cell.attr('data-selected', true);
                }

                // Recalculate the value.
                var newval = 0;
                el.find('div.table-cell.day[data-selected=true]').each(function () {
                    newval += parseInt($(this).attr('data-bitval'), 10);
                });
                o.val = newval;
            });
        },
        singleSelect: function (val) {
            var self = this, o = self.options, el = self.element;
            if (typeof val !== 'undefined') {
                if (o.singleSelect !== makeBool(val)) {
                    o.singleSelect = makeBool(val);
                    if (o.singleSelect) {
                        el.find('div.table-caption').text('Day to Run');
                    }
                    else {
                        el.find('div.table-caption').text('Days to Run');
                    }
                }
            }
        },
        val: function (val) {
            var self = this, o = self.options, el = self.element;
            if (typeof val !== 'undefined') {
                // Select the values based upon the incoming value.
                var hasSelection = false;
                el.find('div.table-cell.day').each(function () {
                    var cell = $(this);
                    var bitVal = parseInt(cell.attr('data-bitval'), 10);
                    if ((bitVal & val & 0xFF) === bitVal
                        && (!o.singleSelect || !hasSelection)) { // If we are a single selection only allow one.
                        cell.attr('data-selected', true);
                        hasSelection = true;
                    }
                    else {
                        cell.attr('data-selected', false);
                    }
                });
                o.val = val;
            }
            else return o.val;
        }
    });
})(jQuery); // Schedule Panel
(function ($) {
    $.widget('pic.configVacationSchedules', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.addClass('picConfigCategory cfgVacationSchedules');
            $.getApiService('/config/options/general', null, function (genOpts, status, xhr) {
                var vacation = genOpts.pool.options.vacation || {};
                var vacPnl = $('<div class="vacation-settings-panel"></div>').appendTo(el);
                $('<div class="vacation-header"><i class="fas fa-umbrella-beach"></i> <span>Vacation Settings</span></div>').appendTo(vacPnl);
                var line = $('<div class="vacation-setting-line"></div>').appendTo(vacPnl);
                $('<label>Enabled:</label>').appendTo(line);
                $('<span class="vacation-value"></span>').text(vacation.enabled ? 'Yes' : 'No').appendTo(line);
                line = $('<div class="vacation-setting-line"></div>').appendTo(vacPnl);
                $('<label>Use Date Range:</label>').appendTo(line);
                $('<span class="vacation-value"></span>').text(vacation.useTimeframe ? 'Yes' : 'No').appendTo(line);
                if (vacation.useTimeframe) {
                    line = $('<div class="vacation-setting-line"></div>').appendTo(vacPnl);
                    $('<label>Start:</label>').appendTo(line);
                    $('<span class="vacation-value"></span>').text(new Date(vacation.startDate).toLocaleDateString()).appendTo(line);
                    line = $('<div class="vacation-setting-line"></div>').appendTo(vacPnl);
                    $('<label>End:</label>').appendTo(line);
                    $('<span class="vacation-value"></span>').text(new Date(vacation.endDate).toLocaleDateString()).appendTo(line);
                }
                $('<div class="vacation-note"><i class="fas fa-info-circle"></i> Vacation settings are managed from the OCP/ICP panel.</div>').appendTo(vacPnl);
                $('<hr/>').appendTo(el);
                $('<div></div>').appendTo(el).configSchedules({ schedGroup: 1 });
            });
        }
    });
})(jQuery); // Vacation Schedules

// pic.pnlAutoSwgConfig
// Companion panel to the Chlorinator config above: reads a PoolMath share page,
// recommends a SWG duty-cycle %, and -- only after the user clicks Apply and
// confirms -- pushes it via the same /state/autoSwg/apply -> setChlorAsync path
// the Chlorinator "Save" button and the dashboard's live setpoint slider both
// use. It never edits or removes the manual Chlorinator panel's own settings,
// and manual control of the chlorinator remains fully available at all times.
(function ($) {
    $.widget('pic.pnlAutoSwgConfig', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._chlorinators = [];
            self._lastResult = null;
            self._buildControls();
            self._loadData();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty();
            el.addClass('picConfigCategory cfgAutoSwg');
            var acc = $('<div></div>').appendTo(el).accordian({
                columns: [{ binding: 'title', glyph: 'fas fa-tint', style: { width: '20rem' } }]
            });
            acc[0].columns()[0].elText().text('Automatic SWG % (PoolMath)');
            var pnl = acc.find('div.picAccordian-contents');
            self._pnl = pnl;

            var line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).css({ padding: '.25rem .25rem .75rem .25rem', fontStyle: 'italic' })
                .text('Recommends a salt cell duty cycle from your PoolMath chlorine log, as a companion to the Chlorinator settings above. It never changes anything on its own -- review the recommendation below, then choose Apply.');

            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Enabled', binding: 'enabled' })
                .attr('title', 'Turns this panel\'s checks on/off. Applying a recommendation always requires a separate confirmation regardless of this setting.');

            line = $('<div></div>').appendTo(pnl);
            self._chlorPick = $('<div></div>').appendTo(line).pickList({
                required: true, bindColumn: 0, displayColumn: 2, labelText: 'Chlorinator', binding: 'chlorinatorId',
                columns: [{ binding: 'val', hidden: true, text: 'Id' }, { binding: 'name', hidden: true, text: 'Name' }, { binding: 'desc', text: 'Chlorinator' }],
                items: [], inputAttrs: { style: { width: '10rem' } }
            }).attr('title', 'Which chlorinator record the recommendation applies to.');

            line = $('<div></div>').appendTo(pnl);
            self._schedPick = $('<div></div>').appendTo(line).pickList({
                required: true, bindColumn: 0, displayColumn: 1, labelText: 'SWG Schedule', binding: 'scheduleId',
                columns: [{ binding: 'val', hidden: true, text: 'Id' }, { binding: 'desc', text: 'SWG Schedule' }],
                items: [], inputAttrs: { style: { width: '14rem' } }
            }).attr('title', 'The pump is guaranteed to run at least as long as this schedule, so its start/end times are used as the SWG run window instead of the manual times below. Pick "Manual (use times below)" to type the run window in yourself.');
            el.on('selchanged', 'div.picPickList[data-bind=scheduleId]', function (evt) {
                self._updateManualTimeFields(evt.newItem && evt.newItem.val);
            });

            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).inputField({ required: true, labelText: 'PoolMath Share Code', binding: 'shareCode', inputAttrs: { maxlength: 60, style: { width: '10rem' } } })
                .attr('title', "e.g. 'tfp-452124', or a full share URL");
            $('<div></div>').appendTo(line).inputField({ labelText: 'Pool/Body Name', binding: 'poolName', inputAttrs: { maxlength: 40, style: { width: '8rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'Restricts parsing to this water body\'s section on a multi-body PoolMath page (leave blank if you only have one).');

            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Pool Volume', binding: 'gallons', min: 500, max: 200000, step: 100, units: 'gal', inputAttrs: { style: { width: '5rem' } } });
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'SWG Capacity', binding: 'swgLbsPerDay', min: 0.10, max: 10, step: 0.01, units: 'lbs/day', inputAttrs: { style: { width: '4rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', "SWG's manufacturer-rated chlorine production per 24-hour day at 100% output (the spec-sheet figure). Only the portion that fits in the run window below is counted as available.");

            line = $('<div></div>').appendTo(pnl);
            self._elSwgStartTime = $('<div></div>').appendTo(line).inputField({ labelText: 'SWG Run Start', binding: 'swgStartTime', inputAttrs: { maxlength: 8, style: { width: '4rem' } } })
                .attr('title', "e.g. '07:00' or '7am'. Ignored while a SWG Schedule above is selected -- that schedule's own start time is used instead.");
            self._elSwgStopTime = $('<div></div>').appendTo(line).inputField({ labelText: 'SWG Run Stop', binding: 'swgStopTime', inputAttrs: { maxlength: 8, style: { width: '4rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', "e.g. '19:00' or '7pm'. Ignored while a SWG Schedule above is selected -- that schedule's own end time is used instead.");
            $('<div></div>').appendTo(line).inputField({ labelText: 'Time Zone', binding: 'timezone', inputAttrs: { maxlength: 40, style: { width: '9rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } }).attr('title', "IANA zone name, e.g. 'America/New_York'");

            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Averaging Window', binding: 'windowDays', min: 3, max: 60, step: 1, units: 'days', inputAttrs: { style: { width: '3rem' } } });
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Target FC', binding: 'targetFc', min: 0, max: 20, step: 0.5, units: 'ppm', inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } });

            // How much of a day's chlorine loss to treat as daytime (sunlight) when weighting the
            // partial day since an FC reading; 0 lets the server estimate it from the day length.
            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Daytime Share of FC Loss', binding: 'daytimeLossSharePct', min: 0, max: 100, step: 5, units: '% (0 = auto)', inputAttrs: { style: { width: '3rem' } } })
                .attr('title', "What percentage of a day's chlorine consumption happens in daylight (sunlight/UV drives most of it). Used to weight the part of a day between FC readings -- e.g. a reading taken in the morning and checked in the evening has lost more than the clock fraction of a day. 0 estimates it from today's sunrise-to-sunset length with a parabolic model (about 56% in winter, 67% in the fall/spring, 78% in summer); enter a value to override. Needs the controller's location (for sunrise/sunset) to be set, otherwise time is counted by the clock.");

            // Which window applies depends on which side of Target FC the projected FC is on
            // when a calculation runs -- the above-target one is listed first, above the
            // below-target one. Same label width so the two spinners line up.
            var daysLabel = { style: { width: '14rem' } };
            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Days to Target (FC above target)', binding: 'targetDaysAbove', min: 1, max: 30, step: 1, units: 'days', inputAttrs: { style: { width: '3rem' } }, labelAttrs: daysLabel })
                .attr('title', 'How many days to take bringing FC down to Target FC when the projected FC is currently ABOVE it. This is the gentle direction -- consumption does most of the work, so a longer window means a smaller cutback from the maintenance %.');
            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Days to Target (FC below target)', binding: 'targetDaysBelow', min: 1, max: 30, step: 1, units: 'days', inputAttrs: { style: { width: '3rem' } }, labelAttrs: daysLabel })
                .attr('title', 'How many days to take building FC back up to Target FC when the projected FC is currently AT OR BELOW it. A shorter window means a harder push above the maintenance %, so you recover sooner.');

            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Step to maintenance % after the target period', binding: 'autoStepEnabled' })
                .attr('title', 'After you apply a recommendation that differs from the maintenance %, automatically move the setpoint to the maintenance % (up or down, whichever way it needs to go) once the target period -- "Days to Target", above or below target as it applied to that calculation -- has passed. A manual change to the SWG % cancels the pending step.');

            line = $('<div></div>').appendTo(pnl);
            var cbAutoApply = $('<div></div>').appendTo(line).checkbox({ labelText: 'Auto-Apply Recommendations', binding: 'autoApplyEnabled' })
                .attr('title', 'Applies a recommendation with NO manual review whenever one is produced -- from the Refresh and Apply button (which replaces Check Now and Refresh while this is saved as on), or (if also enabled below) the periodic automatic check. Every other AutoSwg action requires you to look at a number before it reaches the chlorinator -- this one does not.');
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Warning Threshold', binding: 'autoApplyWarnThresholdPct', min: 1, max: 100, step: 1, units: 'pts', labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'If an auto-applied change moves the SWG % by at least this many percentage points, it\'s flagged prominently on the dashboard, since nobody reviewed it before it took effect.');
            cbAutoApply.on('change', function (e) {
                self._updateAutoApplyFields(cbAutoApply.find('input[type=checkbox]').is(':checked'));
            });

            // Only used by Refresh and Apply and the periodic check, i.e. only while Auto-Apply is on.
            line = $('<div></div>').appendTo(pnl);
            self._elNewTargetRow = line;
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'New Target Threshold', binding: 'newTargetThresholdPpm', min: 0, max: 10, step: 0.5, units: 'ppm', inputAttrs: { style: { width: '3rem' } } })
                .attr('title', 'Used by Refresh and Apply (and the periodic check). If the projected FC is MORE than this many ppm above or below Target FC, it starts a new target -- a new deadline in the Days to Target window that applies, like Check Now. If it is within this many ppm, it just refreshes the SWG % against the existing target and deadline.');

            line = $('<div></div>').appendTo(pnl);
            self._elAutoCheckRow = line;
            var cbAutoCheck = $('<div></div>').appendTo(line).checkbox({ labelText: 'Also check PoolMath automatically', binding: 'autoCheckEnabled' })
                .attr('title', 'Periodically re-checks PoolMath on its own, every "Check Every" hours, instead of only when you click Refresh and Apply. Requires Auto-Apply Recommendations above -- a periodic check with nobody reviewing it would otherwise just overwrite whatever you\'re looking at on this screen.');
            self._cbAutoCheck = cbAutoCheck;
            cbAutoCheck.on('change', function (e) {
                var checked = cbAutoCheck.find('input[type=checkbox]').is(':checked');
                if (!checked) { self._updateAutoCheckHoursField(false); return; }
                // Turning this on means njsPC will check PoolMath and apply changes to the
                // chlorinator on its own, indefinitely, with no further confirmation -- make
                // sure that's deliberate before letting it stick.
                $.pic.modalDialog.createConfirm('dlgConfirmAutoCheck', {
                    message: 'It is critical that you continue to monitor your dashPanel if you enable this. Once on, njsPC will periodically re-check PoolMath and apply changes to your SWG % entirely on its own, with no further confirmation. Continue?',
                    width: '420px', height: 'auto', title: 'Enable Automatic Checking?',
                    buttons: [
                        {
                            text: 'Continue', icon: '<i class="fas fa-check"></i>',
                            click: function () { $.pic.modalDialog.closeDialog(this); self._updateAutoCheckHoursField(true); }
                        },
                        {
                            text: 'Cancel', icon: '<i class="far fa-window-close"></i>',
                            click: function () { $.pic.modalDialog.closeDialog(this); cbAutoCheck[0].val(false); self._updateAutoCheckHoursField(false); }
                        }
                    ]
                });
            });
            self._elAutoCheckHours = $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Check Every', binding: 'autoCheckHours', min: 1, max: 168, step: 1, units: 'hours', labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'How often to automatically re-check PoolMath and apply the result.');
            self._elAutoCheckStart = $('<div></div>').appendTo(line).inputField({ labelText: 'Starting At', binding: 'autoCheckStartTime', inputAttrs: { maxlength: 8, placeholder: 'any time', style: { width: '4.5rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', "Optional time of day (e.g. '06:00' or '6am', in the Time Zone above) to pin the automatic checks to. Checks then run every \"Check Every\" hours counting from that time, and start over at it each day -- e.g. 06:00 every 12 hours checks at 6am and 6pm -- so restarts and settings saves don't shift them. Leave blank to count the interval from when njsPC starts, settings are saved, or the last check finishes. Only applies to intervals under 24 hours.");

            var btnPnl =$('<div class="picBtnPanel btn-panel"></div>').appendTo(pnl);
            var btnSave = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Save Settings', icon: '<i class="fas fa-save"></i>' });
            btnSave.on('click', function (e) {
                if (dataBinder.checkRequired(pnl, true)) {
                    var v = dataBinder.fromElement(pnl);
                    $.putApiService('/config/autoSwg', v, 'Saving AutoSwg Settings...', function (c) {
                        self.dataBind(c);
                        self._updateActionButtons(c && c.autoApplyEnabled);
                        // Saving re-arms the automatic check, so pick up its new due time -- just that
                        // line, not a full re-render, which would disable Apply on a pending result.
                        $.getApiService('/state/autoSwg', null, function (result) {
                            if (result && result.nextAutoCheckAt) self._elNextAutoCheck.text('Next automatic check: ' + new Date(result.nextAutoCheckAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })).show();
                            else self._elNextAutoCheck.hide();
                        });
                    });
                }
            });
            // While Auto-Apply is saved as on, Check Now and Refresh give way to the single
            // Refresh and Apply button, which makes that choice itself (see
            // _updateActionButtons); with it off, the two stay as separate, reviewed actions.
            self._btnCheck = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Check Now: New Target', icon: '<i class="fas fa-calculator"></i>' })
                .attr('title', 'Runs a fresh calculation using today\'s date, the Target FC configured above, and whichever Days to Target applies (above or below target, depending on where the projected FC is) -- starts a brand new target and countdown. Use this to start (or restart) a glide from scratch; use Refresh: Adjust % instead to correct one already in progress without resetting its deadline.');
            self._btnCheck.on('click', function (e) { self._checkNow(); });
            self._btnRefreshApply = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Refresh and Apply', icon: '<i class="fas fa-rotate"></i>' })
                .attr('title', 'Re-fetches your PoolMath data and applies the result immediately, with no review. If the projected FC is within the New Target Threshold of Target FC, it just re-works the SWG % against your existing target and deadline. If it is further above or below Target FC than that, it starts a new target -- a new deadline in the Days to Target window that applies, like Check Now.')
                .hide();
            self._btnRefreshApply.on('click', function (e) { self._refreshAndApply(); });
            // Only meaningful while a glide-to-target from a previous apply is still in
            // flight (lastAppliedTargetDate set) -- re-aims at that SAME original target
            // FC/date with fresh PoolMath data, instead of restarting the countdown the
            // way Check Now would. Hidden otherwise (see _renderResult).
            self._btnRefine = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Refresh: Adjust %', icon: '<i class="fas fa-rotate"></i>' })
                .attr('title', 'Re-fetches your PoolMath data and recalculates the SWG % needed to reach the SAME target FC by the SAME target date/time as your last apply -- does not change the target or restart the countdown. Use this to correct a glide already in progress with fresher data.')
                .hide();
            self._btnRefine.on('click', function (e) { self._refineToTarget(); });
            var btnHistory = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Display History', icon: '<i class="fas fa-history"></i>' });
            btnHistory.on('click', function (e) { self._showHistory(); });

            // Results area -- hidden until there's anything to show: either applied/pending-step
            // status, or a calculation preview (fresh Check Now, or the last one from before,
            // loaded on open -- see _loadData). These two are independent of each other --
            // see _renderResult -- so Cancel can clear the preview alone.
            var results = $('<div></div>').addClass('picAutoSwgResults').appendTo(pnl).hide();
            self._resultsPnl = results;
            $('<hr></hr>').appendTo(results);
            // Section A: applied status. This persists regardless of whatever calculation
            // preview is showing below (or isn't), and Cancel never touches it.
            self._elPendingStep = $('<div></div>').appendTo(results).css({ fontWeight: 'bold', color: '#a60' }).hide();
            self._elLastApplied = $('<div></div>').appendTo(results).css({ fontSize: '.85em', color: '#666' }).hide();
            self._elNextAutoCheck = $('<div></div>').appendTo(results).css({ fontSize: '.85em', color: '#666' }).hide();
            // What's actually explaining the % running on the chlorinator right now (saved at
            // Apply time, or by an automatic step).
            self._elAppliedRationaleHeader = $('<div></div>').appendTo(results).css({ fontSize: '.85em', color: '#666', marginTop: '.4rem' }).hide();
            self._elAppliedRationale = $('<ul></ul>').appendTo(results).css({ fontSize: '.85em', color: '#666' });
            // Only shown when both sections above and below actually have something to show.
            self._elResultDivider = $('<hr></hr>').appendTo(results).hide();
            // Section B: the (possibly unapplied) calculation preview -- entirely cleared by
            // Cancel, independent of section A above.
            // Even 100% SWG can't reach the target in the window -- the recommended % below is
            // capped at 100, so say so up front rather than let it read like a plan that works.
            self._elTargetWarning = $('<div></div>').appendTo(results).css({
                fontWeight: 'bold', color: '#fff', background: '#d35400',
                padding: '.4rem .6rem', borderRadius: '.25rem', margin: '.3rem 0'
            }).hide();
            // FC is so far above target that consumption alone won't bring it down by the
            // deadline -- informational (blue), the % is simply at its floor.
            self._elTargetInfo = $('<div></div>').appendTo(results).css({
                color: '#fff', background: '#2a6fa8',
                padding: '.4rem .6rem', borderRadius: '.25rem', margin: '.3rem 0'
            }).hide();
            // The newest FC reading is several days old, so the projection is mostly
            // extrapolation -- a caution, not an error.
            self._elStaleFcNote = $('<div></div>').appendTo(results).css({
                color: '#5a4300', background: '#ffe9a8',
                padding: '.4rem .6rem', borderRadius: '.25rem', margin: '.3rem 0'
            }).hide();
            self._elAsOf = $('<div></div>').appendTo(results).css({ fontSize: '.75em', color: '#999' });
            self._elCurrentPct = $('<div></div>').appendTo(results);
            self._elRecommendedPct = $('<div></div>').appendTo(results).css({ fontWeight: 'bold' });
            self._elMaintenancePct = $('<div></div>').appendTo(results).css({ fontSize: '.85em', color: '#666' });
            self._elAvgConsumption = $('<div></div>').appendTo(results);
            self._elAvgWindow = $('<div></div>').appendTo(results).css({ fontSize: '.85em', color: '#666' });
            self._elProjectedFc = $('<div></div>').appendTo(results);
            self._elRationaleHeader = $('<div></div>').appendTo(results).css({ fontSize: '.85em', color: '#666', marginTop: '.4rem' }).hide();
            self._elRationale = $('<ul></ul>').appendTo(results).css({ fontSize: '.85em', color: '#666' });
            var resultsBtnPnl = $('<div class="picBtnPanel btn-panel"></div>').appendTo(results);
            self._btnApply = $('<div></div>').appendTo(resultsBtnPnl).actionButton({ text: 'Apply Recommended %', icon: '<i class="fas fa-check"></i>' });
            // Only enabled by a successful Check Now, and disabled again the
            // moment the confirm dialog is answered either way -- applying
            // always requires a fresh recommendation, matching the server's
            // own "pending" requirement on PUT /state/autoSwg/apply.
            self._btnApply[0].disabled(true);
            self._btnApply.on('click', function (e) {
                if (self._btnApply.hasClass('disabled')) return;
                self._confirmApply();
            });
            // Dismisses this Check Now result without applying it (enabled/disabled in lockstep
            // with Apply -- there's nothing to cancel once it's already been applied or dismissed).
            // This is about discarding an unapplied calculation, not a pending automatic step --
            // changing a pending step is done by applying a new calculation, not cancelling it.
            self._btnCancel = $('<div></div>').appendTo(resultsBtnPnl).actionButton({ text: 'Cancel', icon: '<i class="fas fa-ban"></i>' });
            self._btnCancel[0].disabled(true);
            self._btnCancel.on('click', function (e) {
                if (self._btnCancel.hasClass('disabled')) return;
                // The server clears the calculation fields (not the applied/pending-step ones --
                // see PUT /state/autoSwg/cancel), so re-rendering its response through the same
                // path as everything else correctly leaves section A (pending step, last
                // applied) in place and only clears section B (the calculation preview).
                $.putApiService('/state/autoSwg/cancel', {}, function (result) {
                    self._renderResult(result, true);
                });
            });
            // Shown instead of enabled Apply/Cancel buttons when Auto-Apply Recommendations
            // already applied this result as part of the same request -- otherwise the two
            // (visibly present, just disabled) buttons give no indication anything happened.
            self._elAutoApplied = $('<div></div>').appendTo(resultsBtnPnl).css({ fontWeight: 'bold', color: '#2a7', padding: '.4rem 0' }).hide();
            // Shown after a Refresh found no new FC reading in PoolMath (nothing was changed).
            self._elSkipNote = $('<div></div>').appendTo(resultsBtnPnl).css({ fontWeight: 'bold', color: '#2a6fa8', padding: '.4rem 0' }).hide();
        },
        // Keeps Apply and Cancel enabled/disabled together -- both only make sense while
        // there's a fresh, unapplied calculation to act on.
        _setResultButtonsEnabled: function (enabled) {
            var self = this;
            self._btnApply[0].disabled(!enabled);
            self._btnCancel[0].disabled(!enabled);
        },
        _updateManualTimeFields: function (scheduleId) {
            var self = this;
            var usingSchedule = typeof scheduleId !== 'undefined' && scheduleId !== null && scheduleId >= 0;
            [self._elSwgStartTime, self._elSwgStopTime].forEach(function (el) {
                if (!el) return;
                el.css('opacity', usingSchedule ? 0.5 : 1);
                el.find('input').prop('disabled', usingSchedule);
            });
        },
        // "Also check PoolMath automatically" (and its own "Check Every" hours field) only
        // means anything while Auto-Apply Recommendations is on -- hide the whole row
        // otherwise rather than just disabling it.
        _updateAutoApplyFields: function (autoApplyEnabled) {
            var self = this;
            if (self._elNewTargetRow) self._elNewTargetRow.toggle(!!autoApplyEnabled);
            if (self._elAutoCheckRow) self._elAutoCheckRow.toggle(!!autoApplyEnabled);
            var autoCheckChecked = !!(self._cbAutoCheck && self._cbAutoCheck.find('input[type=checkbox]').is(':checked'));
            self._updateAutoCheckHoursField(autoApplyEnabled && autoCheckChecked);
        },
        // Which action buttons to offer follows the SAVED Auto-Apply setting (the server acts on
        // what's saved, not on a checkbox that hasn't been saved yet): off keeps Check Now and
        // Refresh as two reviewed actions; on replaces them with the single Refresh and Apply.
        _updateActionButtons: function (autoApplySaved) {
            var self = this;
            self._autoApplySaved = !!autoApplySaved;
            self._btnCheck.toggle(!self._autoApplySaved);
            self._btnRefreshApply.toggle(self._autoApplySaved);
            self._updateRefineButton(self._lastResult);
        },
        // Refresh: Adjust % only while Auto-Apply is off AND the last apply's deadline is
        // still ahead -- once it has passed there's nothing left to re-aim at (the server
        // refuses too), so Check Now alone is offered.
        _updateRefineButton: function (result) {
            var self = this;
            var inFlight = !!(result && result.lastAppliedTargetDate && new Date(result.lastAppliedTargetDate).getTime() > Date.now());
            self._btnRefine.toggle(!self._autoApplySaved && inFlight);
        },
        // "Check Every" only means anything while "Also check PoolMath automatically" is
        // checked (which itself requires Auto-Apply Recommendations -- see above).
        _updateAutoCheckHoursField: function (shown) {
            var self = this;
            if (self._elAutoCheckHours) self._elAutoCheckHours.toggle(!!shown);
            if (self._elAutoCheckStart) self._elAutoCheckStart.toggle(!!shown);
        },
        _loadData: function () {
            var self = this;
            $.getApiService('/config/options/chlorinators', null, function (opts) {
                self._chlorinators = (opts && opts.chlorinators) || [];
                var items = self._chlorinators.map(function (c) { return { val: c.id, name: c.name, desc: c.name + ' (#' + c.id + ')' }; });
                self._chlorPick[0].items(items);
                $.getApiService('/config/options/schedules', null, function (sopts) {
                    var circuits = (sopts && sopts.circuits) || [];
                    var schedules = (sopts && sopts.schedules) || [];
                    var timeTypes = (sopts && sopts.scheduleTimeTypes) || [];
                    // A sunrise/sunset-typed schedule's startTime/endTime minutes are just a
                    // static fallback (whatever sunrise/sunset happened to be when last saved) --
                    // showing those numbers here is misleading since the schedule actually runs
                    // off the real, daily-shifting sunrise/sunset instead. Label those as
                    // "Sunrise"/"Sunset" rather than a stale clock time.
                    var timeTypeName = function (val) {
                        var tt = timeTypes.find(function (t) { return t.val === val; });
                        return tt ? tt.name : undefined;
                    };
                    var formatScheduleTime = function (typeVal, minutes) {
                        var name = timeTypeName(typeVal);
                        if (name === 'sunrise') return 'Sunrise';
                        if (name === 'sunset') return 'Sunset';
                        return typeof minutes === 'number' ? minutes.formatTime('h:mmtt', '--:--') : '--:--';
                    };
                    var schedItems = [{ val: -1, name: 'Manual', desc: 'Manual (use times below)' }];
                    schedules.forEach(function (s) {
                        if (s.disabled) return;
                        var circuit = circuits.find(function (c) { return c.id === s.circuit; }) || { name: 'Circuit ' + s.circuit };
                        var span = formatScheduleTime(s.startTimeType, s.startTime) + '-' + formatScheduleTime(s.endTimeType, s.endTime);
                        schedItems.push({ val: s.id, name: circuit.name, desc: circuit.name + ' ' + span + ' (#' + s.id + ')' });
                    });
                    self._schedPick[0].items(schedItems);
                    $.getApiService('/config/autoSwg', null, function (cfg) {
                        self.dataBind(cfg);
                        self._updateManualTimeFields(cfg && cfg.scheduleId);
                        self._updateAutoApplyFields(cfg && cfg.autoApplyEnabled);
                        self._updateActionButtons(cfg && cfg.autoApplyEnabled);
                    });
                    // Show whatever was last calculated (and/or applied), if anything, without
                    // requiring a fresh Check Now -- this is persisted server-side already.
                    $.getApiService('/state/autoSwg', null, function (result) {
                        // Show section A (pending step, last applied) even with no calculation
                        // to preview at all -- e.g. right after a Cancel, or before the first
                        // Check Now has ever run on a pool that already has an applied change.
                        if (result && (result.lastCheckedAt || result.lastAppliedAt || result.stepAt)) self._renderResult(result, true);
                    });
                });
            });
        },
        dataBind: function (obj) {
            var self = this;
            dataBinder.bind(self._pnl, obj);
        },
        _checkNow: function () {
            var self = this;
            self._setResultButtonsEnabled(false);
            $.postApiService('/state/autoSwg/recommend', {}, 'Checking PoolMath...', function (result) {
                self._renderResult(result, false);
            });
        },
        _refreshAndApply: function () {
            var self = this;
            self._setResultButtonsEnabled(false);
            $.postApiService('/state/autoSwg/refreshAndApply', {}, 'Refreshing PoolMath data...', function (result) {
                self._renderRefreshResult(result);
            });
        },
        _refineToTarget: function () {
            var self = this;
            self._setResultButtonsEnabled(false);
            $.postApiService('/state/autoSwg/refine', {}, 'Refreshing PoolMath data...', function (result) {
                self._renderRefreshResult(result);
            });
        },
        // A Refresh with no new FC reading in PoolMath changes nothing on the server, so show
        // what's already there (as saved, so Apply/Cancel reflect any earlier unapplied
        // calculation rather than a fresh one) plus the reason nothing happened.
        _renderRefreshResult: function (result) {
            var self = this;
            if (result && result.skipped) {
                self._renderResult(result, true);
                self._elSkipNote.text('ℹ ' + result.skipped).show();
                return;
            }
            self._renderResult(result, false);
        },
        // Renders a result from either a fresh Check Now, the persisted last-known state
        // (fromSaved -- shown on open, before any Check Now this session), or a Cancel
        // response. Section A (pending step, last applied, applied rationale) and section B
        // (the calculation preview) are independent of each other -- Cancel clears only B,
        // and section A can show on its own with no calculation to preview at all.
        _renderResult: function (result, fromSaved) {
            var self = this;
            result = result || {};
            self._lastResult = result;
            var hasCalc = !!result.lastCheckedAt;
            // With Auto-Apply Recommendations on, a fresh Check Now/Refresh & Adjust may
            // already be applied (pending false) by the time this result comes back --
            // Apply/Cancel have nothing left to do in that case, so only enable them while
            // something's actually still awaiting a decision.
            self._setResultButtonsEnabled(hasCalc && !fromSaved && !!result.pending);
            self._updateRefineButton(result);
            // A fresh (non-saved) result that's already not pending can only mean Auto-Apply
            // Recommendations just applied it as part of this very request -- state plainly
            // what happened rather than leaving Apply/Cancel sitting there (just disabled)
            // with no explanation for why.
            if (!fromSaved && hasCalc && !result.pending) {
                self._elAutoApplied.text('✓ Automatically applied ' + result.lastAppliedPct + '% (Auto-Apply Recommendations is on).' + (result.targetInfo ? ' Note: ' + result.targetInfo : '')).show();
            }
            else self._elAutoApplied.hide();
            self._elSkipNote.hide();

            // Section A: applied status -- the pending step (if any) matters more than the
            // calculation's mechanics in section B, so it's first and most prominent.
            if (result.stepAt) self._elPendingStep.text('Pending step: ' + self._describePendingStep(result)).show();
            else self._elPendingStep.hide();
            if (result.lastAppliedAt) self._elLastApplied.text('Last applied: ' + result.lastAppliedPct + '% on ' + new Date(result.lastAppliedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })).show();
            else self._elLastApplied.hide();
            // When the periodic automatic check is next due (only present while it's running).
            if (result.nextAutoCheckAt) self._elNextAutoCheck.text('Next automatic check: ' + new Date(result.nextAutoCheckAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })).show();
            else self._elNextAutoCheck.hide();
            var hasApplied = result.lastAppliedAt && Array.isArray(result.lastAppliedRationale) && result.lastAppliedRationale.length > 0;
            self._elAppliedRationale.empty();
            if (hasApplied) {
                self._elAppliedRationaleHeader.text('From the ' + result.lastAppliedPct + '% applied on ' + new Date(result.lastAppliedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ' (what\'s actually running now):').show();
                result.lastAppliedRationale.forEach(function (line) { $('<li></li>').appendTo(self._elAppliedRationale).text(line); });
            }
            else self._elAppliedRationaleHeader.hide();
            var hasSectionA = !!(result.stepAt || result.lastAppliedAt);

            // Section B: the (possibly unapplied) calculation preview -- absent entirely once
            // there's no calculation to show (e.g. right after Cancel), regardless of section A.
            if (hasCalc && result.targetWarning) self._elTargetWarning.text('⚠ ' + result.targetWarning).show();
            else self._elTargetWarning.hide();
            if (hasCalc && result.targetInfo) self._elTargetInfo.text('ℹ ' + result.targetInfo).show();
            else self._elTargetInfo.hide();
            if (hasCalc && result.staleFcNote) self._elStaleFcNote.text('ℹ ' + result.staleFcNote).show();
            else self._elStaleFcNote.hide();
            self._elAsOf.toggle(hasCalc).text(hasCalc && fromSaved ? 'As of last check: ' + new Date(result.lastCheckedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ' -- run Check Now to refresh.' : '');
            self._elCurrentPct.toggle(hasCalc).text('Current SWG %: ' + result.currentPct + '%');
            self._elRecommendedPct.toggle(hasCalc).text('Recommended SWG %: ' + result.recommendedPct + '% (to reach target FC on schedule)');
            self._elMaintenancePct.toggle(hasCalc).text('Steady-state maintenance would only need: ' + result.maintenancePct + '%');
            self._elAvgConsumption.toggle(hasCalc).text('Average FC consumption: ' + result.avgConsumptionPpmPerDay + ' ppm/day');
            self._elAvgWindow.toggle(hasCalc).text(self._describeAvgWindow(result));
            self._elProjectedFc.toggle(hasCalc).text('Projected current FC: ' + result.projectedCurrentFc + ' ppm');
            // A newer check exists (unapplied) whenever it's later than the last apply, or
            // there's never been an apply at all.
            var hasNewerCheck = hasCalc && (!result.lastAppliedAt || new Date(result.lastCheckedAt) > new Date(result.lastAppliedAt));
            self._elRationale.empty();
            if (hasCalc && (hasNewerCheck || !hasApplied)) {
                self._elRationaleHeader.text(hasApplied ? 'From the latest (not yet applied) calculation:' : 'From the last calculation:').show();
                (result.rationale || []).forEach(function (line) { $('<li></li>').appendTo(self._elRationale).text(line); });
            }
            else self._elRationaleHeader.hide();

            self._elResultDivider.toggle(hasSectionA && hasCalc);
            self._resultsPnl.toggle(hasSectionA || hasCalc);
        },
        // Concise one-liner for a pending auto-step: direction, target %, time
        // remaining, and the target date/time -- e.g. "will increase SWG setting to 62% in 2d 6h (Fri 3:15 PM)".
        _describePendingStep: function (result) {
            var self = this;
            // lastAppliedPct, not currentPct -- currentPct is only refreshed by a Check Now, so
            // right after an Apply (see _confirmApply) it can still hold the pre-apply value.
            var verb = result.stepPct > result.lastAppliedPct ? 'will increase SWG setting to ' : 'will decrease SWG setting to ';
            var target = new Date(result.stepAt);
            var remaining = self._fmtCountdown(target.getTime() - Date.now());
            var s = verb + result.stepPct + '% in ' + remaining;
            // lastAppliedTargetFc is whatever targetFc was in effect at the apply that scheduled
            // this step -- not necessarily today's config, which may have changed since.
            if (typeof result.lastAppliedTargetFc === 'number') s += ' for target FC of ' + result.lastAppliedTargetFc + ' ppm';
            return s + ' (' + target.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ')';
        },
        // "2d 6h", "6h 5m", or "due now" -- kept to 2 units for brevity.
        _fmtCountdown: function (ms) {
            if (ms <= 0) return 'due now';
            var mins = Math.floor(ms / 60000);
            var days = Math.floor(mins / 1440); mins -= days * 1440;
            var hours = Math.floor(mins / 60); mins -= hours * 60;
            var parts = [];
            if (days > 0) parts.push(days + 'd');
            if (days > 0 || hours > 0) parts.push(hours + 'h');
            if (days === 0) parts.push(mins + 'm');
            return parts.join(' ');
        },
        // 'YYYY-MM-DD HH:mm' for an ISO timestamp, in `tz` (an IANA zone name) when
        // given and valid, otherwise in this browser's time zone.
        _fmtDateTime: function (iso, tz) {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            var pad = function (n) { return (n < 10 ? '0' : '') + n; };
            if (tz) {
                try {
                    var parts = {};
                    new Intl.DateTimeFormat('en-US', {
                        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                    }).formatToParts(d).forEach(function (p) { parts[p.type] = p.value; });
                    return parts.year + '-' + parts.month + '-' + parts.day + ' ' + parts.hour + ':' + parts.minute;
                } catch (err) { /* unknown zone -- fall through to browser time */ }
            }
            return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        },
        // The start/end of the running-average window the server actually used, and
        // whether it had to be extended back to include enough FC readings.
        _describeAvgWindow: function (result) {
            var self = this;
            if (!result || !result.avgWindowStart || !result.avgWindowEnd) return '';
            var details = result.details || {};
            var inputs = details.inputs || {};
            var tz = inputs.timezone;
            var text = 'Averaging window: ' + self._fmtDateTime(result.avgWindowStart, tz) + ' to ' + self._fmtDateTime(result.avgWindowEnd, tz) + (tz ? ' ' + tz : '');
            if (details.avgWindowExtended) text += ' (extended back from ' + inputs.windowDays + ' days to include at least 3 FC readings)';
            return text;
        },
        // Human-readable source of a combined-history entry: PoolMath, or the local
        // log (an applied recommendation, an applied-but-overridden one, or a manual change).
        _historySourceLabel: function (e) {
            if (e.source === 'poolmath') return 'PoolMath';
            if (e.source === 'local-manual') return 'Local - manual change';
            var rec = e.record || {};
            return typeof rec.recommendedPct === 'number' && rec.recommendedPct !== e.pct ? 'Local - applied (overridden)' : 'Local - applied recommendation';
        },
        // Shows the SWG % and FC history as a calculation sees it -- FC readings from
        // PoolMath, and SWG % entries from the local change log plus PoolMath's (a
        // PoolMath SWG entry within an hour of a local one is left out) -- newest first,
        // each labeled with its source, and offers it for download as CSV or JSON.
        _showHistory: function () {
            var self = this;
            $.getApiService('/state/autoSwg/history/combined', null, 'Loading SWG % and FC history...', function (h) {
                h = h || {};
                var entries = Array.isArray(h.entries) ? h.entries.slice() : [];
                entries.sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
                var buttons = [];
                if (entries.length > 0) {
                    buttons.push({ text: 'Export CSV', icon: '<i class="fas fa-download"></i>', click: function () { self._exportHistory(entries, 'csv'); } });
                    buttons.push({ text: 'Export JSON', icon: '<i class="fas fa-download"></i>', click: function () { self._exportHistory(entries, 'json'); } });
                }
                buttons.push({ text: 'Close', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } });
                var dlg = $.pic.modalDialog.createDialog('dlgAutoSwgHistory', {
                    width: '860px',
                    height: 'auto',
                    title: 'SWG % and FC History',
                    buttons: buttons
                });
                var wrap = $('<div></div>').css({ maxHeight: '26rem', overflowY: 'auto', padding: '.25rem' }).appendTo(dlg);
                if (h.poolMathError) {
                    $('<div></div>').css({ padding: '.25rem .25rem .5rem .25rem', color: '#b00' })
                        .text('PoolMath could not be read (' + h.poolMathError + '), so only the local SWG % log is shown.')
                        .appendTo(wrap);
                }
                if (entries.length === 0) {
                    $('<div></div>').css({ padding: '.5rem', fontStyle: 'italic' })
                        .text('Nothing to show yet. SWG % changes are logged locally when a recommendation is applied or the SWG % is changed some other way, and FC readings come from PoolMath.')
                        .appendTo(wrap);
                    return;
                }
                var swgCount = entries.filter(function (e) { return e.type === 'SWG'; }).length;
                var note = entries.length + ' entries (' + swgCount + ' SWG %, ' + (entries.length - swgCount) + ' FC), newest first. Times are shown in this browser\'s time zone. '
                    + 'SWG % entries follow the same rule as the calculation: a local entry is used in place of any PoolMath entry within an hour of it'
                    + (h.poolMathSwgEntriesReplaced ? ' (' + h.poolMathSwgEntriesReplaced + ' PoolMath ' + (h.poolMathSwgEntriesReplaced === 1 ? 'entry was' : 'entries were') + ' left out for that reason)' : '')
                    + '. Local history is kept for 18 months.';
                $('<div></div>').css({ fontSize: '.85em', color: '#666', padding: '0 0 .4rem .25rem' }).text(note).appendTo(wrap);
                var tbl = $('<table></table>').css({ width: '100%', borderCollapse: 'collapse', fontSize: '.85em' }).appendTo(wrap);
                var cols = [
                    { text: 'Time', align: 'left' }, { text: 'Type', align: 'left' }, { text: 'Value', align: 'right' }, { text: 'Source', align: 'left' },
                    { text: 'ppm/day', align: 'right' }, { text: 'Previous %', align: 'right' }, { text: 'Recommended %', align: 'right' }
                ];
                var head = $('<tr></tr>').appendTo($('<thead></thead>').appendTo(tbl));
                cols.forEach(function (c) {
                    $('<th></th>').text(c.text).css({ textAlign: c.align, padding: '.2rem .5rem', borderBottom: '1px solid #999', whiteSpace: 'nowrap' }).appendTo(head);
                });
                var body = $('<tbody></tbody>').appendTo(tbl);
                var blank = function (v) { return typeof v === 'undefined' || v === null ? '' : v; };
                entries.forEach(function (e) {
                    var rec = e.record || {};
                    var row = $('<tr></tr>').appendTo(body);
                    [
                        [self._fmtDateTime(e.ts), 'left'],
                        [e.type === 'FC' ? 'FC reading' : 'SWG %', 'left'],
                        [e.type === 'FC' ? blank(e.value) + ' ppm' : blank(e.pct) + '%', 'right'],
                        [self._historySourceLabel(e), 'left'],
                        [e.type === 'SWG' ? blank(e.ppmPerDay) : '', 'right'],
                        [blank(rec.previousPct), 'right'],
                        [blank(rec.recommendedPct), 'right']
                    ].forEach(function (cell) {
                        $('<td></td>').text(cell[0]).css({ textAlign: cell[1], padding: '.2rem .5rem', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' }).appendTo(row);
                    });
                });
            });
        },
        // Downloads `entries` (newest first, as displayed) as a file, oldest first. JSON
        // keeps every field (including the full inputs and outputs behind local entries);
        // CSV is one row per entry with the main values and a few key inputs/outputs
        // flattened into columns.
        _exportHistory: function (entries, format) {
            var self = this;
            var ordered = entries.slice().reverse();
            var d = new Date();
            var pad = function (n) { return (n < 10 ? '0' : '') + n; };
            var fileName = 'autoSwgHistory-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.' + format;
            var text, type;
            if (format === 'json') {
                text = JSON.stringify(ordered, null, 2);
                type = 'application/json';
            }
            else {
                var out = function (e) { return (e.record || {}).outputs || {}; };
                var inp = function (e) { return (e.record || {}).inputs || {}; };
                var cols = [
                    ['Time (ISO)', function (e) { return e.ts; }],
                    ['Type', function (e) { return e.type; }],
                    ['Source', function (e) { return self._historySourceLabel(e); }],
                    ['SWG %', function (e) { return e.type === 'SWG' ? e.pct : undefined; }],
                    ['FC (ppm)', function (e) { return e.type === 'FC' ? e.value : undefined; }],
                    ['ppm/day', function (e) { return e.ppmPerDay; }],
                    ['Run hours', function (e) { return e.hrs; }],
                    ['Previous %', function (e) { return (e.record || {}).previousPct; }],
                    ['Recommended %', function (e) { return (e.record || {}).recommendedPct; }],
                    ['Maintenance %', function (e) { return out(e).maintenancePct; }],
                    ['Avg FC consumption (ppm/day)', function (e) { return out(e).avgConsumptionPpmPerDay; }],
                    ['Projected FC (ppm)', function (e) { return out(e).projectedCurrentFc; }],
                    ['Avg window start (ISO)', function (e) { return out(e).avgWindowStart; }],
                    ['Avg window end (ISO)', function (e) { return out(e).avgWindowEnd; }],
                    ['Gallons', function (e) { return inp(e).gallons; }],
                    ['SWG lbs/day', function (e) { return inp(e).swgLbsPerDay; }],
                    ['Run start', function (e) { return inp(e).swgStartTime; }],
                    ['Run stop', function (e) { return inp(e).swgStopTime; }],
                    ['Window days', function (e) { return inp(e).windowDays; }],
                    ['Target FC (ppm)', function (e) { return inp(e).targetFc; }],
                    ['Target days', function (e) { return inp(e).targetDays; }]
                ];
                var esc = function (v) {
                    if (typeof v === 'undefined' || v === null) return '';
                    var s = String(v);
                    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
                };
                var lines = [cols.map(function (c) { return esc(c[0]); }).join(',')];
                ordered.forEach(function (e) { lines.push(cols.map(function (c) { return esc(c[1](e)); }).join(',')); });
                text = lines.join('\r\n') + '\r\n';
                type = 'text/csv';
            }
            var url = window.URL.createObjectURL(new Blob([text], { type: type }));
            var link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            $(link).remove();
            setTimeout(function () { window.URL.revokeObjectURL(url); }, 1000);
        },
        _confirmApply: function () {
            var self = this;
            if (!self._lastResult) return;
            var pct = self._lastResult.recommendedPct;
            // When FC is too far above target to burn down by the original deadline, the
            // calculation moved the target date out -- say so before it's applied.
            var infoNote = self._lastResult.targetInfo ? ' Note: ' + self._lastResult.targetInfo : '';
            $.pic.modalDialog.createConfirm('dlgConfirmApplyAutoSwg', {
                message: 'Set the SWG pool setpoint to ' + pct + '%?' + infoNote + ' This changes the same setting as the Chlorinator panel above -- you can still edit it manually there at any time afterward. The change and the calculation behind it are logged locally and used by future checks.',
                width: '420px',
                height: 'auto',
                title: 'Confirm Apply SWG %',
                buttons: [{
                    text: 'Yes', icon: '<i class="fas fa-check"></i>',
                    click: function () {
                        $.pic.modalDialog.closeDialog(this);
                        self._setResultButtonsEnabled(false);
                        $.putApiService('/state/autoSwg/apply', { poolSetpoint: pct }, 'Applying SWG %...', function (result) {
                            self._renderResult(result.autoSwg, true);
                            self._remindPoolMathLog(pct);
                        });
                    }
                },
                {
                    text: 'No', icon: '<i class="far fa-window-close"></i>',
                    click: function () {
                        $.pic.modalDialog.closeDialog(this);
                        self._setResultButtonsEnabled(false);
                    }
                }]
            });
        },
        // The FC readings still come from PoolMath, but SWG % changes made here (or
        // manually on the Chlorinator panel) are logged locally and take precedence
        // over PoolMath's own SWG entries, so a missing PoolMath entry no longer
        // skews future checks. Logging it there is still worthwhile for PoolMath's
        // own charts and history. This is a one-button note, not a confirmation --
        // the setpoint change has already been applied at this point either way.
        _remindPoolMathLog: function (pct) {
            $.pic.modalDialog.createConfirm('dlgAutoSwgLogPoolMathReminder', {
                message: 'The SWG pool setpoint was changed to ' + pct + '%. This change is logged locally and will be used by future Check Now results, so logging it in PoolMath is optional. You may still want to log it there to keep your PoolMath history and charts complete.',
                width: '420px',
                height: 'auto',
                title: 'SWG % Change Logged',
                buttons: [
                    { text: 'Got It', icon: '<i class="fas fa-check"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }
                ]
            });
        }
    });
})(jQuery);

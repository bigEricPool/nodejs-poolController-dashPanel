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
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Days to Target FC', binding: 'targetDays', min: 1, max: 30, step: 1, units: 'days', inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } });

            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Step to maintenance % after the target period', binding: 'autoStepEnabled' })
                .attr('title', 'After you apply a recommendation that differs from the maintenance %, automatically move the setpoint to the maintenance % (up or down, whichever way it needs to go) once "Days to Target FC" have passed. A manual change to the SWG % cancels the pending step.');

            line = $('<div></div>').appendTo(pnl);
            var cbAutoApply = $('<div></div>').appendTo(line).checkbox({ labelText: 'Enable fully automatic mode', binding: 'autoApplyEnabled' })
                .attr('title', 'Periodically re-checks PoolMath and applies the result with NO manual review. Every other AutoSwg action requires you to look at a number before it reaches the chlorinator -- this one does not.');
            cbAutoApply.on('change', function (e) {
                self._updateAutoCheckField(cbAutoApply.find('input[type=checkbox]').is(':checked'));
            });
            line = $('<div></div>').appendTo(pnl);
            self._elAutoCheckHours = $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Automatic Check Frequency', binding: 'autoCheckHours', min: 1, max: 168, step: 1, units: 'hours' })
                .attr('title', 'How often to automatically re-check PoolMath and apply the result while fully automatic mode is enabled. Only meaningful -- and only shown -- while that\'s checked.');
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Warning Threshold', binding: 'autoApplyWarnThresholdPct', min: 1, max: 100, step: 1, units: 'pts', labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'If an automatic apply moves the SWG % by at least this many percentage points, it\'s flagged prominently on the dashboard, since nobody reviewed it before it took effect.');

            var btnPnl =$('<div class="picBtnPanel btn-panel"></div>').appendTo(pnl);
            var btnSave = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Save Settings', icon: '<i class="fas fa-save"></i>' });
            btnSave.on('click', function (e) {
                if (dataBinder.checkRequired(pnl, true)) {
                    var v = dataBinder.fromElement(pnl);
                    $.putApiService('/config/autoSwg', v, 'Saving AutoSwg Settings...', function (c) { self.dataBind(c); });
                }
            });
            var btnCheck = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Check Now', icon: '<i class="fas fa-calculator"></i>' });
            btnCheck.on('click', function (e) { self._checkNow(); });
            // Only meaningful while a glide-to-target from a previous apply is still in
            // flight (lastAppliedTargetDate set) -- re-aims at that SAME original target
            // FC/date with fresh PoolMath data, instead of restarting the countdown the
            // way Check Now would. Hidden otherwise (see _renderResult).
            self._btnRefine = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Refresh & Adjust to Target', icon: '<i class="fas fa-rotate"></i>' })
                .attr('title', 'Recalculates using the latest PoolMath data, but keeps aiming at the same target FC and target date/time as the last apply -- use this to correct a glide already in progress rather than restarting its countdown.')
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
            // What's actually explaining the % running on the chlorinator right now (saved at
            // Apply time, or by an automatic step).
            self._elAppliedRationaleHeader = $('<div></div>').appendTo(results).css({ fontSize: '.85em', color: '#666', marginTop: '.4rem' }).hide();
            self._elAppliedRationale = $('<ul></ul>').appendTo(results).css({ fontSize: '.85em', color: '#666' });
            // Only shown when both sections above and below actually have something to show.
            self._elResultDivider = $('<hr></hr>').appendTo(results).hide();
            // Section B: the (possibly unapplied) calculation preview -- entirely cleared by
            // Cancel, independent of section A above.
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
        // Automatic Check Frequency only means anything while fully automatic mode is
        // enabled -- hide it entirely otherwise rather than just disabling it.
        _updateAutoCheckField: function (autoApplyEnabled) {
            var self = this;
            if (self._elAutoCheckHours) self._elAutoCheckHours.toggle(!!autoApplyEnabled);
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
                        self._updateAutoCheckField(cfg && cfg.autoApplyEnabled);
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
        _refineToTarget: function () {
            var self = this;
            self._setResultButtonsEnabled(false);
            $.postApiService('/state/autoSwg/refine', {}, 'Refreshing PoolMath data...', function (result) {
                self._renderResult(result, false);
            });
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
            self._setResultButtonsEnabled(hasCalc && !fromSaved);
            self._btnRefine.toggle(!!result.lastAppliedTargetDate);

            // Section A: applied status -- the pending step (if any) matters more than the
            // calculation's mechanics in section B, so it's first and most prominent.
            if (result.stepAt) self._elPendingStep.text('Pending step: ' + self._describePendingStep(result)).show();
            else self._elPendingStep.hide();
            if (result.lastAppliedAt) self._elLastApplied.text('Last applied: ' + result.lastAppliedPct + '% on ' + new Date(result.lastAppliedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })).show();
            else self._elLastApplied.hide();
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
            $.pic.modalDialog.createConfirm('dlgConfirmApplyAutoSwg', {
                message: 'Set the SWG pool setpoint to ' + pct + '%? This changes the same setting as the Chlorinator panel above -- you can still edit it manually there at any time afterward. The change and the calculation behind it are logged locally and used by future checks.',
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

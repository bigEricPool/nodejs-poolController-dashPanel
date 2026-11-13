// AutoSwg is the internal name of SWG Assist. The class and file names, the `autoSwg` config key, the data/autoSwg*.json(l) files,
// the /config/autoSwg and /state/autoSwg routes, the 'autoSwg' socket event and the browser storage keys keep the old name on purpose, so stored
// settings and history need no migration. Text the user sees says SWG Assist.
//
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
            self._checkTuneRunning();
            el[0].dataBind = function (obj) { return self.dataBind(obj); };
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.empty();
            el.addClass('picConfigCategory cfgAutoSwg');
            var acc = $('<div></div>').appendTo(el).accordian({
                columns: [{ binding: 'title', glyph: 'fas fa-tint', style: { width: '20rem' } }]
            });
            acc[0].columns()[0].elText().text('SWG Assist (PoolMath)');
            var pnl = acc.find('div.picAccordian-contents');
            self._pnl = pnl;

            var line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).css({ padding: '.25rem .25rem .75rem .25rem', fontStyle: 'italic' })
                .text('Recommends a salt cell duty cycle from your PoolMath chlorine log, as a companion to the Chlorinator settings above. By default it only recommends: review the recommendation below, then choose Apply. If you turn on Auto-Apply Recommendations (with the automatic check) or Away protection, it applies recommendations to the SWG % itself, within its limits.');

            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Enabled', binding: 'enabled' })
                .attr('title', 'Turns this panel\'s checks on/off. Turning it on does not by itself apply anything: a recommendation is applied only when you press Apply and confirm, or when Auto-Apply Recommendations or Away protection is on.');

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

            // The PoolMath share code and pool name are the pool's, set under PoolMath History above (they are no longer part of these settings).
            $('<div></div>').appendTo(pnl).text('PoolMath share code and pool name: see PoolMath History above.').css({ fontSize: '.85em', color: '#666', margin: '.2rem 0' });

            // The pool volume is PoolMath's too (the largest body's capacity when PoolMath has none): shown here, set in neither place.
            self._elPoolVolume = $('<div></div>').appendTo(pnl).text('Pool volume: see PoolMath History above.').css({ fontSize: '.85em', color: '#666', margin: '.2rem 0' });
            // The cell's rating (lbs/day) is the chlorinator's: set it in the Chlorinator panel above.

            line = $('<div></div>').appendTo(pnl);
            self._elSwgStartTime = $('<div></div>').appendTo(line).inputField({ labelText: 'SWG Run Start', binding: 'swgStartTime', inputAttrs: { maxlength: 8, style: { width: '4rem' } } })
                .attr('title', "e.g. '07:00' or '7am'. Ignored while a SWG Schedule above is selected -- that schedule's own start time is used instead.");
            self._elSwgStopTime = $('<div></div>').appendTo(line).inputField({ labelText: 'SWG Run Stop', binding: 'swgStopTime', inputAttrs: { maxlength: 8, style: { width: '4rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', "e.g. '19:00' or '7pm'. Ignored while a SWG Schedule above is selected -- that schedule's own end time is used instead.");
            $('<div></div>').appendTo(line).inputField({ labelText: 'Time Zone', binding: 'timezone', inputAttrs: { maxlength: 40, style: { width: '9rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } }).attr('title', "IANA zone name, e.g. 'America/New_York'");

            // What the SWG can make in that window at its 100% setting (ppm/day), from the pool volume, the capacity and the run window the calculation really uses
            // (a selected schedule's own window wins over the times typed above), so the plan can be judged against it. Redrawn as the volume and capacity are edited.
            line = $('<div></div>').appendTo(pnl);
            self._elSwgCapacity = $('<div></div>').appendTo(line).css({ fontSize: '.85em', color: '#666', margin: '.1rem 0 .3rem 0' }).hide();
            pnl.on('change keyup mouseup click', function () { setTimeout(function () { self._applySwgWindow(); }, 60); });

            // Range control: keep FC inside a range. Away protection steers to its own Vacation Target FC (below).
            line = $('<div></div>').appendTo(pnl);
            self._elBandRow = line;
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'FC Low', binding: 'fcLow', min: 0, max: 28, step: 0.5, units: 'ppm', inputAttrs: { style: { width: '3rem' } } })
                .attr('title', 'The bottom of the range. When the projected FC (less an allowance that grows with the age of your last test) is below this, the SWG is raised to bring FC back to the middle of the range. While FC is inside the range the SWG runs the maintenance %, nudged a little toward the middle.');
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'FC High', binding: 'fcHigh', min: 2, max: 30, step: 0.5, units: 'ppm', inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'The top of the range. When the projected FC is above this the SWG is held at 0% until it is half a ppm below it (not for more than 2 days after your last test). Must be at least 2 ppm above FC Low: the projection is usually off by about 1.5 ppm, so a narrower range cannot be kept reliably.');
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Raise for an Old Test', binding: 'bandBiasPerDay', min: 0, max: 0.3, step: 0.05, units: 'per day beyond 2 days', inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'When your last FC test is more than 2 days old the projection is less certain, so the SWG runs this much above the maintenance % for each further day (at most 40% above). 0 = no raise.');
            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Boost Over', binding: 'bandBoostPeriods', min: 0.5, max: 5, step: 0.5, units: 'run periods', inputAttrs: { style: { width: '3rem' } } })
                .attr('title', 'How many SWG run periods (one period is one run window of the SWG, counted in on-time only, so 1 is about a day) a boost takes to bring FC back to the middle of the range. 1 is a firm push; a larger number is gentler and longer. A boost only happens when FC is projected below FC Low.');
            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Keep the Afternoon Peak Under FC High', binding: 'bandPeakCap' })
                .attr('title', 'The SWG makes all of its chlorine in its run window, faster than the pool uses it, so FC climbs about half a ppm from the morning low to the afternoon peak. With this on, the SWG % is held down just enough that the afternoon peak, worked out from the projected FC, stays at or under FC High (less half a ppm). It only ever lowers the % while FC is inside the range; it does not touch a boost below the range or the hold at 0% above it.');
            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Correct the Hold from the Last Readings', binding: 'bandIntegral' })
                .attr('title', 'The maintenance % comes from an average of the pool\'s recent burn, which follows a change in season or weather only slowly. With this on, when your last three FC tests average above the middle of the range the hold is trimmed down a little more, and when they average below it the hold is trimmed up (by 30% of the maintenance % at most, reaching that only at the edge of the range). It needs at least two readings and a last reading no more than 3 days old.');
            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Scale the Old-Test Raise by the Last Reading', binding: 'bandScaledBias' })
                .attr('title', 'When your last FC test is more than 2 days old, the SWG runs above the maintenance % (Raise for an Old Test), so a projection that has drifted cannot leave the pool short. With this on, that raise shrinks when your last test was already high: it is full when the last test was at or below the middle of the range and none when it was at the top of it, so a long gap after a high reading does not push FC further above the range. Turn it off for the plain raise.');

            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Aim Above Target as the Last Test Ages', binding: 'overshootPpmPerDay', min: 0, max: 0.5, step: 0.05, units: 'ppm per day (0 = aim at the target)', inputAttrs: { style: { width: '3.5rem' } } })
                .attr('title', 'Used when boosting (it raises the aim above the middle of the range) and by Away protection. The older your last FC test, the less certain the projected FC is, and FC a little high is the safer miss than a little low. The SWG % that reaches the target is worked out for the target plus this many ppm for each day since the last test (at most 1 ppm). It does not change the maintenance %, the target date or the projection.');

            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Return to the maintenance % when the target period ends', binding: 'autoStepEnabled' })
                .attr('title', 'After you apply a recommendation that differs from the maintenance %, automatically move the SWG % to the maintenance % (up or down, whichever way it needs to go) when the target period -- "Run Periods to Target", above or below target as it applied to that calculation -- has passed. SWG Assist makes this change by itself, even with Auto-Apply off, and only as a convenience: a target period often ends between your FC tests, and this keeps the SWG % you applied from carrying FC past the target (or leaving it short) in the meantime. It is off until you check it. Applying anything yourself, or changing the SWG % by hand, cancels the pending return.');


            line = $('<div></div>').appendTo(pnl);
            self._elAutoApplyRow = line;       // hidden until the server says the automation is available (see _updateAutoApplyFields)
            var cbAutoApply = $('<div></div>').appendTo(line).checkbox({ labelText: 'Auto-Apply Recommendations', binding: 'autoApplyEnabled' })
                .attr('title', 'Applies a recommendation with NO manual review whenever one is produced -- from the Refresh and Apply button (which replaces Check Now and Refresh while this is saved as on), or (if also enabled below) the periodic automatic check. Every other SWG Assist action requires you to look at a number before it reaches the chlorinator -- this one does not.');
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Warning Threshold', binding: 'autoApplyWarnThresholdPct', min: 1, max: 100, step: 1, units: 'pts', labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'If an automatic check moves the SWG % by at least this many percentage points, it\'s flagged prominently on the dashboard, since nobody reviewed it before it took effect. A check you start yourself with a button (Check Now, Refresh, Refresh and Apply) is your own action and never raises the warning.');
            cbAutoApply.on('change', function (e) {
                self._updateAutoApplyFields(cbAutoApply.find('input[type=checkbox]').is(':checked'));
            });

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

            // Vacation: Away protection. While it is on, SWG Assist checks PoolMath every 12 hours and may raise the SWG % to make up for dilution (a fall in
            // the chlorinator's salt reading) or an outage (njsPC not running), never below the maintenance % and never more than the limit above it. It
            // needs the return to the maintenance %, so each boost ends by itself. Available in every mode. It pauses Auto-Apply, the automatic check and
            // auto tune (their settings are kept, shown grayed out) and ends when it is unchecked and saved, or by itself when a new FC reading is logged.
            // Saving the settings is what starts it.
            line = $('<div></div>').appendTo(pnl).css({ marginTop: '.8rem' });
            $('<div></div>').appendTo(line).css({ fontWeight: 'bold' }).text('Vacation: Away protection');
            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Vacation Target FC', binding: 'awayTargetFc', min: 0, max: 30, step: 0.5, units: 'ppm', inputAttrs: { style: { width: '3rem' } } })
                .attr('title', 'The FC to aim for while Away protection is on (higher than your normal FC range, so FC is a little high when you are back). Your FC Low and FC High above are not changed, and range control takes over again when Away protection ends.');
            line = $('<div></div>').appendTo(pnl);
            self._cbAway = $('<div></div>').appendTo(line).checkbox({ labelText: 'Away protection: keep FC safe while I am away', binding: 'awayEnabled' })
                .attr('title', 'Set the Vacation Target FC, check this and save the settings to start. SWG Assist then checks PoolMath every 12 hours and may raise the SWG % to make up for FC lost to dilution (a sharp fall in the chlorinator\'s salt reading, from rain) or to an outage (njsPC was not running, so the equipment was off). It can only add chlorine: it applies the glide up to the Vacation Target FC you set (not limited), it never goes below the maintenance %, a storm or outage adds at most the points at right to that, one event acts for at most 3 days, and each boost ends by itself (it needs "Return to the maintenance % when the target period ends"). While it is on, Auto-Apply, the automatic check and auto tune are paused (their settings are kept, shown grayed out). At each check it also looks in PoolMath for a new FC reading: when one has been logged since you turned this on, Away protection turns itself off, this box clears, and Auto-Apply, the automatic check and auto tune go back to the settings you had, working from the new reading. Your FC range (FC Low and FC High) is never changed: range control takes over again as soon as Away protection ends. It also ends when you uncheck it and save. Log your last test before you turn it on, since a test logged afterward ends it.');
            self._awayTipBase = self._cbAway.attr('title');
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Storm or outage adds at most', binding: 'stormMaxExtraPct', min: 0, max: 50, step: 5, units: 'points', inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'How many points a storm (a sharp fall in the salt reading) or an outage may add to the SWG % your plan would have used without it. It does not limit the glide up to the vacation target you set. The SWG % never goes below the maintenance %.');
            // These steer Away protection's glide to the vacation target (normal operation keeps FC inside the range, so they have no effect outside Away). Which window applies depends on which side of the
            // vacation target the projected FC is on -- the above one is listed first. Same label width so the two spinners line up.
            var daysLabel = { style: { width: '22rem' } };   // wide enough for 'Run Periods (days) to Target (FC above target)' (about 21 rem)
            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Run Periods (days) to Target (FC above target)', binding: 'targetPeriodsAbove', min: 0.5, max: 30, step: 0.5, units: 'run periods', inputAttrs: { style: { width: '3rem' } }, labelAttrs: daysLabel })
                .attr('title', 'How many SWG run periods (one period is one run window of the SWG, counted in on-time only) to take bringing FC down to the vacation target when the projected FC is currently ABOVE it. This is the gentle direction -- consumption does most of the work, so a longer window means a smaller cutback from the maintenance %. Half periods are allowed (0.5 at least). The deadline is when the SWG has been on for that many run windows from now, so 0.5 ends partway through a run and 1 about a day on.');
            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Run Periods (days) to Target (FC below target)', binding: 'targetPeriodsBelow', min: 0.5, max: 30, step: 0.5, units: 'run periods', inputAttrs: { style: { width: '3rem' } }, labelAttrs: daysLabel })
                .attr('title', 'How many SWG run periods (one period is one run window of the SWG, counted in on-time only) to take building FC back up to the vacation target when the projected FC is currently AT OR BELOW it. A shorter window means a harder push above the maintenance %, so you recover sooner. Half periods are allowed (0.5 at least). The deadline is when the SWG has been on for that many run windows from now.');
            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Keep FC at the target through the night', binding: 'protectOvernightLow' })
                .attr('title', 'FC is lowest just before the SWG starts in the morning. With this on, the plan aims a little higher at the deadline whenever FC would otherwise fall below the target before the SWG starts again, so the overnight low stays at the target. Turn it off to aim at the target only at the deadline.');
            line = $('<div></div>').appendTo(pnl);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'New Target Date Threshold', binding: 'newTargetDateThresholdPpm', min: 0, max: 10, step: 0.5, units: 'ppm', inputAttrs: { style: { width: '3rem' } } })
                .attr('title', 'If the projected FC is MORE than this many ppm above or below the Vacation Target FC, it starts a new target date -- a new deadline in the Run Periods to Target window that applies, like Check Now. If it is within this many ppm, it keeps the existing target date and just refreshes the SWG % against it.');

            self._elAwayStatus = $('<div></div>').appendTo(pnl).css({ fontSize: '.85em', margin: '.2rem 0' }).hide();

            // ---- Tuning options: model settings that rarely change once tuned (the Projection Accuracy and
            // What-If Sweep reports suggest values), kept out of the way unless wanted. The fields stay in the
            // form, so Save and loading work as for every other setting.
            // The calculation details (the lists explaining the applied % and the latest calculation) expand and contract; contracted unless you opened them. A
            // calculation still waiting for your Apply shows its details so you can review them.
            self._calcDetailsOpen = false;
            try { self._calcDetailsOpen = window.localStorage.getItem('autoSwgCalcDetailsOpen') === '1'; } catch (e) { /* storage unavailable */ }
            self._tuningOpen = false;
            try { self._tuningOpen = window.localStorage.getItem('autoSwgTuningOpen') === '1'; } catch (e) { /* storage unavailable */ }
            self._tuningDefaults = { windowDays: 14, daytimeLossSharePct: 0, nightBurnRatio: 0.5, creditChlorineAdditions: true, fcAnomalyTolerancePpm: 2, projectionWeight: 0.5, projectionTaperStartDays: 3, projectionTaperEndDays: 8, burnTempAdjust: false };
            self._elTuningToggle = $('<div></div>').appendTo(pnl)
                .css({ cursor: 'pointer', margin: '.6rem 0 .2rem 0', userSelect: 'none', fontWeight: 'bold' })
                .append($('<i class="fas fa-chevron-right"></i>').css({ width: '1rem', display: 'inline-block' }))
                .append($('<span></span>').text('Tuning options'))
                .append($('<span></span>').addClass('picAutoSwgTuningBadge').css({ marginLeft: '.6rem', fontWeight: 'normal', fontSize: '.85em', color: '#b36b00' }))
                .attr('title', 'Averaging window, daylight and chlorine-credit handling, anomaly tolerance and the projection weighting and taper. The defaults suit most pools; the Projection Accuracy and What-If Sweep reports, opened from the buttons in this section, suggest values for yours.')
                .on('click', function () {
                    self._tuningOpen = !self._tuningOpen;
                    try { window.localStorage.setItem('autoSwgTuningOpen', self._tuningOpen ? '1' : '0'); } catch (e) { /* storage unavailable */ }
                    self._applyTuningState();
                });
            // Tuning and the automation unlock as history builds up (see AutoSwgReadiness on the server); until then this says how far along it is.
            self._elGateNote = $('<div></div>').appendTo(pnl).css({ margin: '.6rem 0 .2rem 0', fontSize: '.85em', fontStyle: 'italic', color: '#666' }).hide();
            self._elTuning = $('<div></div>').appendTo(pnl).css({ padding: '.2rem 0 .2rem 1rem', borderLeft: '2px solid rgba(128,128,128,.3)' }).hide();
            // keep the badge current as the fields are edited
            self._elTuning.on('change keyup mouseup click', function () { setTimeout(function () { self._updateTuningBadge(); }, 60); });
            line = $('<div></div>').appendTo(self._elTuning);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Averaging Window', binding: 'windowDays', min: 3, max: 60, step: 1, units: 'days', inputAttrs: { style: { width: '3rem' } } });
            // How much of a day's chlorine loss to treat as daytime (sunlight) when weighting the
            // partial day since an FC reading; 0 lets the server estimate it from the day length.
            line = $('<div></div>').appendTo(self._elTuning);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Daytime Share of FC Loss', binding: 'daytimeLossSharePct', min: 0, max: 100, step: 5, units: '% (0 = auto)', inputAttrs: { style: { width: '3rem' } } })
                .attr('title', "What percentage of a day's chlorine consumption happens in daylight (sunlight/UV drives most of it). Used to weight the part of a day between FC readings -- e.g. a reading taken in the morning and checked in the evening has lost more than the clock fraction of a day. 0 estimates it from today's sunrise-to-sunset length with a parabolic model (about 56% in winter, 67% in the fall/spring, 78% in summer); enter a value to override. Needs the controller's location (for sunrise/sunset) to be set, otherwise time is counted by the clock.");

            line = $('<div></div>').appendTo(self._elTuning);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Night Burn vs Day', binding: 'nightBurnRatio', min: 0.1, max: 1.5, step: 0.05, units: 'x the daytime rate', inputAttrs: { style: { width: '3rem' } } })
                .attr('title', "How much chlorine your pool uses at night compared with the same hour of daylight. 0.5 is the usual figure for a well-kept pool (sunlight does most of the work); a pool with a lot of organic load or bather use can lose more at night. It sets how much of a day's consumption is counted in daylight, so it matters for the part of a day between readings and for the overnight low. Tune scores other values on your own readings and says plainly when the history cannot tell. Ignored while Daytime Share of FC Loss is set.");
            line = $('<div></div>').appendTo(self._elTuning);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Credit liquid chlorine additions logged in PoolMath', binding: 'creditChlorineAdditions' })
                .attr('title', "A liquid chlorine addition logged in PoolMath between two FC readings raises the second reading without the SWG having done it. With this on, each addition is credited as FC added (strength x amount / pool volume, using Gallons above) when working out consumption and projecting the current FC; with it off, the rise is counted as SWG output and consumption is understated. Other chlorine products aren't recognized yet.");

            line = $('<div></div>').appendTo(self._elTuning);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'FC Anomaly Tolerance', binding: 'fcAnomalyTolerancePpm', min: 0, max: 10, step: 0.5, units: 'ppm (0 = off)', inputAttrs: { style: { width: '3rem' } } })
                .attr('title', "When FC rises between two readings by more than the SWG output and the liquid chlorine logged in PoolMath can explain, plus this many ppm, that interval is left out of the average consumption and a banner asks you to check PoolMath (an unlogged chlorine addition, or a mistyped reading). A reading varies by about a ppm, so the default of 2 ignores ordinary variation. Raise it to flag less; 0 turns the check off. A change takes effect the next time you Check or Refresh (or the next automatic check runs) -- saving alone doesn't re-evaluate anything, and the banners update then too.");

            line = $('<div></div>').appendTo(self._elTuning);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Projection Weighting', binding: 'projectionWeight', min: 0, max: 1, step: 0.05, units: '(1 = full model, 0 = last reading only)', inputAttrs: { style: { width: '3.5rem' } } })
                .attr('title', "When projecting the current FC from your last reading, how much of the modelled change since then (SWG output minus consumption) to apply. FC usually moves less between tests than the model expects -- weather alone swings consumption by a ppm a day -- so a value below 1 often predicts better. 1 applies all of it, 0 starts from the last reading unchanged. Liquid chlorine you logged is always added in full. The Projection Accuracy report suggests a value from your own readings (and can apply it). A change takes effect the next time you Check or Refresh.");

            line = $('<div></div>').appendTo(self._elTuning);
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Taper Weighting After', binding: 'projectionTaperStartDays', min: 0, max: 30, step: 1, units: 'days', inputAttrs: { style: { width: '3rem' } } });
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Down to Zero At', binding: 'projectionTaperEndDays', min: 0, max: 60, step: 1, units: 'days (0 = no taper)', inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', "The longer it has been since your last FC test, the less the modelled change (SWG output minus consumption) should be trusted. With these set, the Projection Weighting applies in full until the last reading is 'Taper Weighting After' days old, then falls in a straight line to zero at 'Down to Zero At' days, when the projection is simply your last measured FC plus any chlorine you logged. On the readings tested so far the model helped for gaps under about 5 days and hurt beyond, so something like 3 and 8 days works well. 0 for 'Down to Zero At' turns the taper off.");

            line = $('<div></div>').appendTo(self._elTuning);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Adjust the burn for the water temperature', binding: 'burnTempAdjust' })
                .attr('title', 'Chlorine is used faster in warmer water. With this on, the burn rate is moved along a line fitted to your own interval burn rates against the water temperature logged with your FC tests, but only when that line is clear (at least 8 intervals with a temperature at both ends, a slope at least 2 standard errors from zero) and never by more than 30% of the burn. Off by default: on the pool it was tried on the water temperature barely moved within a window and the adjustment did not improve the projection. The What-If Sweep scores it for your pool.');

            // Tools for tuning (the accuracy report and what-if sweep) and the reset live in this row.
            self._elTuningBtns = $('<div class="picBtnPanel btn-panel"></div>').appendTo(self._elTuning);
            self._applyTuningState();

            // Auto tune: only in the automatic mode (the server says so in the gate, see _applyAutoTuneState). Tune runs by itself once enough new FC
            // readings have arrived, and its recommendation can be applied by itself once the guards pass.
            self._elAutoTune = $('<div></div>').appendTo(pnl).css({ padding: '.4rem 0 .2rem 1rem', margin: '.6rem 0 .2rem 0', borderLeft: '2px solid rgba(128,128,128,.3)' }).hide();
            $('<div></div>').appendTo(self._elAutoTune).css({ fontWeight: 'bold', marginBottom: '.2rem' }).text('Auto tune');
            line = $('<div></div>').appendTo(self._elAutoTune);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Tune automatically', binding: 'autoTuneEnabled' })
                .attr('title', 'After a PoolMath check, if at least this many new FC readings have arrived since the last Tune, run Tune by itself. What it finds is kept in the Tune history and shown here; it changes nothing unless the next checkbox is also on.');
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'After', binding: 'autoTuneAfterFcReadings', min: 3, max: 60, step: 1, units: 'new FC readings', inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'How many new FC readings must have arrived since the last Tune before auto tune runs. Tuning again on the same history only makes the numbers look better, so about 10 is the guide. The Tune dialog uses the same number for its "too soon" warning.');
            line = $('<div></div>').appendTo(self._elAutoTune);
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Apply the Tune recommendation automatically', binding: 'autoTuneApplyEnabled' })
                .attr('title', 'Apply what auto tune recommends without asking. It is applied only when every guard passes: you have applied enough Tune recommendations yourself, the data and history are good enough, the gain is worth it, the same change was recommended on several auto tunes in a row, and the setting is one that is changed automatically and stays inside its safe range. Otherwise the recommendation is kept, with the reasons it was held.');
            $('<div></div>').appendTo(line).valueSpinner({ canEdit: true, labelText: 'Once you have applied', binding: 'autoTuneApplyAfterManual', min: 0, max: 20, step: 1, units: 'Tune recommendations yourself', inputAttrs: { style: { width: '3rem' } }, labelAttrs: { style: { marginLeft: '1rem' } } })
                .attr('title', 'How many times you must have applied a Tune recommendation from the Tune dialog before auto tune may apply any. This is how it earns trust: you see what Tune does to your pool first.');
            // The storm response: with a stale FC reading, a big fall in the chlorinator's salt reading (dilution) lowers the projected FC so the SWG runs a little higher.
            line = $('<div></div>').appendTo(self._elAutoTune).css({ marginTop: '.4rem' });
            $('<div></div>').appendTo(line).checkbox({ labelText: 'Storm and outage response: allow for dilution and power outages when the last FC test is 3 or more days old', binding: 'stormResponseEnabled' })
                .attr('title', 'When your last FC test is 3 or more days old, the projected FC is lowered by the dilution a noticeable fall in the chlorinator\'s salt reading implies (rain, or water removed and refilled), and by the chlorine the SWG missed during a significant outage (njsPC not running, so the equipment was off), so the SWG runs a little higher until FC is back at the target. It needs "Return to the maintenance %" turned on so the extra ends by itself, never raises the SWG more than the limit set under Vacation above the maintenance %, and acts for at most 3 days on one event. Off, it only reports the estimate. It covers dilution, not the chlorine that debris uses, and is no substitute for testing FC.');
            self._elAutoTuneGuard = $('<div></div>').appendTo(self._elAutoTune).css({ fontSize: '.85em', color: '#666', margin: '.2rem 0' });
            self._elAutoTuneNote = $('<div></div>').appendTo(self._elAutoTune).css({ fontSize: '.85em', margin: '.2rem 0' });

            // Says which settings a Tune or report just saved to the server (see _applySettingsToForm).
            self._elApplied = $('<div></div>').appendTo(pnl).css({ fontWeight: 'bold', color: '#2a7', padding: '.4rem 0' }).hide();
            var btnPnl =$('<div class="picBtnPanel btn-panel"></div>').appendTo(pnl);
            var btnSave = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Save Settings', icon: '<i class="fas fa-save"></i>' });
            // Enabled only while the form differs from what is saved (see _updateSaveButton); until the settings
            // have loaded there is nothing to compare, so it stays disabled.
            self._btnSave = btnSave;
            btnSave[0].disabled(true);
            self._watchForChanges();
            btnSave.on('click', function (e) {
                if (btnSave.hasClass('disabled')) return;
                if (dataBinder.checkRequired(pnl, true)) {
                    var v = dataBinder.fromElement(pnl);
                    $.putApiService('/config/autoSwg', v, 'Saving SWG Assist Settings...', function (c) {
                        self.dataBind(c);
                        self._updateTuningBadge();
                        self._updateActionButtons(c && c.autoApplyEnabled && c.awayStatus !== 'active');
                        self._applyAwayStatus(c);
                        self._applySwgWindow(c);
                        self._markSaved();
                        // Turning Away protection on (or off) makes a check a few seconds after the save: pick up its calculation when it is done.
                        setTimeout(function () { self._refreshFromServer(); }, 8000);
                        // Saving re-arms the automatic check, so pick up its new due time -- just that
                        // line, not a full re-render, which would disable Apply on a pending result.
                        $.getApiService('/state/autoSwg', null, function (result) {
                            if (result && result.nextAutoCheckAt) self._elNextAutoCheck.text('Next automatic check: ' + new Date(result.nextAutoCheckAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })).show();
                            else self._elNextAutoCheck.hide();
                        });
                    });
                }
            });
            // While Auto-Apply is saved as on, Refresh gives way to the single Refresh and Apply
            // button, which makes that choice itself (see _updateActionButtons); Check Now: New
            // Target stays, and applies at once then. With it off they are separate, reviewed actions.
            self._btnCheck = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Check Now: New Target', icon: '<i class="fas fa-calculator"></i>' })
                .attr('title', 'Runs a fresh calculation using today\'s date, the Target FC configured above, and whichever Run Periods to Target applies (above or below target, depending on where the projected FC is) -- starts a brand new target and countdown. Use this to start (or restart) a glide from scratch; use Refresh: Adjust % instead to correct one already in progress without resetting its deadline.');
            self._btnCheck.on('click', function (e) { self._checkNow(); });
            self._btnRefreshApply = $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Refresh and Apply', icon: '<i class="fas fa-rotate"></i>' })
                .attr('title', 'Re-fetches your PoolMath data and applies the result immediately, with no review. If the projected FC is within the New Target Date Threshold of Target FC, it just re-works the SWG % against your existing target date. If it is further above or below Target FC than that, it starts a new target date -- a new deadline in the Run Periods to Target window that applies, like Check Now.')
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
            var btnTuneHelp = $('<div></div>').appendTo(self._elTuningBtns).actionButton({ text: 'How to Tune', icon: '<i class="fas fa-circle-question"></i>' })
                .attr('title', 'A short guide to tuning with the Projection Accuracy and What-If Sweep reports.');
            btnTuneHelp.on('click', function (e) { self._showTuningHelp(); });
            var btnTune = self._btnTune = $('<div></div>').appendTo(self._elTuningBtns).actionButton({ text: 'Tune', icon: '<i class="fas fa-sliders"></i>' })
                .attr('title', 'Checks your saved settings against your FC history and recommends one change, or tells you your settings look good. The detailed Projection Accuracy and What-If Sweep reports open from there.');
            btnTune.on('click', function (e) { if (btnTune.hasClass('disabled')) return; self._tuneClick(); });
            var btnResetTuning = $('<div></div>').appendTo(self._elTuningBtns).actionButton({ text: 'Reset Tuning to Defaults', icon: '<i class="fas fa-undo"></i>' })
                .attr('title', 'Puts every tuning option back to its default in this form -- Save Settings to keep it.');
            btnResetTuning.on('click', function () {
                Object.keys(self._tuningDefaults).forEach(function (k) { self._setBound(k, self._tuningDefaults[k]); });
                self._updateTuningBadge();
            });

            // Results area -- hidden until there's anything to show: either applied/pending-step
            // status, or a calculation preview (fresh Check Now, or the last one from before,
            // loaded on open -- see _loadData). These two are independent of each other --
            // see _renderResult -- so Cancel can clear the preview alone.
            var results = $('<div></div>').addClass('picAutoSwgResults').appendTo(pnl).hide();
            self._resultsPnl = results;
            $('<hr></hr>').appendTo(results);
            // Section A: applied status. This persists regardless of whatever calculation
            // preview is showing below (or isn't), and Cancel never touches it.
            // What is running on the chlorinator now, when it was applied, and what will happen next (the pending step, a future change). The calculations that explain
            // them (what the applied % was based on, and the latest calculation) are the footnote below these lines.
            self._elRunningNow = $('<div></div>').appendTo(results).css({ fontWeight: 'bold' }).hide();
            self._elLastApplied = $('<div></div>').appendTo(results).css({ fontSize: '.85em', color: '#666' }).hide();
            self._elPendingStep = $('<div></div>').appendTo(results).css({ fontWeight: 'bold', color: '#a60', margin: '.2rem 0' }).hide();
            self._elNextAutoCheck = $('<div></div>').appendTo(results).css({ fontSize: '.85em', color: '#666' }).hide();
            // The background PoolMath history archive (up to 48 months of logs, pulled from PoolMath's
            // JSON interface for longer-range features such as a last-year consumption lookback).
            self._elArchiveStatus = $('<div></div>').appendTo(results).css({ fontSize: '.85em', color: '#666' }).hide();
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
            // FC rose more than the SWG and logged chlorine can explain, so those intervals were left out
            // of the average -- log the chlorine in PoolMath or fix the reading there.
            self._elFcAnomaly = $('<div></div>').appendTo(results).css({
                color: '#fff', background: '#d35400',
                padding: '.4rem .6rem', borderRadius: '.25rem', margin: '.3rem 0'
            }).hide();
            // PoolMath's recent SWG entries imply a different rated output than the SWG Rating set here -- every
            // recommended % is off by about that much until one of them is corrected.
            self._elRatingNote = $('<div></div>').appendTo(results).css({
                fontWeight: 'bold', color: '#fff', background: '#d35400',
                padding: '.4rem .6rem', borderRadius: '.25rem', margin: '.3rem 0'
            }).hide();
            // The newest FC reading is several days old, so the projection is mostly
            // extrapolation -- a caution, not an error.
            self._elStaleFcNote = $('<div></div>').appendTo(results).css({
                color: '#5a4300', background: '#ffe9a8',
                padding: '.4rem .6rem', borderRadius: '.25rem', margin: '.3rem 0'
            }).hide();
            // A recent fall in the chlorinator's salt reading: some FC lost may be dilution, not consumption. Informational; nothing is adjusted.
            self._elSaltNote = $('<div></div>').appendTo(results).css({
                color: '#0b3d5c', background: '#d6ecfa',
                padding: '.4rem .6rem', borderRadius: '.25rem', margin: '.3rem 0'
            }).hide();
            // The Model Bench's CYA test advice (state.autoSwg.benchCyaAdvice): a CYA test would help, and why. Advisory only; hidden when none is due.
            self._elBenchCyaNote = $('<div></div>').appendTo(results).css({
                color: '#0b3d5c', background: '#d6ecfa',
                padding: '.4rem .6rem', borderRadius: '.25rem', margin: '.3rem 0'
            }).hide();
            self._elCalcHeader = $('<div></div>').appendTo(results).css({ fontWeight: 'bold', color: '#555', marginBottom: '.15rem' }).hide();
            self._elAsOf = $('<div></div>').appendTo(results).css({ fontSize: '.75em', color: '#999' });
            self._elCurrentPct = $('<div></div>').appendTo(results).hide();
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
            // The order on the page: the latest calculation and its buttons first (it is what was just done), then a divider, then what is running now, when it
            // was applied, the pending step (what happens next), the next automatic check and the archive line, and last the long description the applied % was
            // based on, which is the footnote. The elements are created in a different order above; appending an existing element moves it.
            results.append(self._elResultDivider);
            [self._elRunningNow, self._elLastApplied, self._elPendingStep, self._elNextAutoCheck, self._elArchiveStatus, self._elAppliedRationaleHeader, self._elAppliedRationale]
                .forEach(function (el) { results.append(el); });
            self._buildBench();
        },
        // Keeps Apply and Cancel enabled/disabled together -- both only make sense while
        // there's a fresh, unapplied calculation to act on.
        _setResultButtonsEnabled: function (enabled) {
            var self = this;
            self._btnApply[0].disabled(!enabled);
            self._btnCancel[0].disabled(!enabled);
        },
        // The note under the form: how far along the history is, or what is left to unlock automation.
        _applyGateNote: function () {
            var self = this, g = self._gate;
            if (!self._elGateNote) return;
            var text = '';
            if (g && g.tuningAvailable === false) {
                var parts = [(g.scorable || 0) + ' of ' + g.scorableNeeded + ' FC readings the reports can score', (g.days || 0) + ' of ' + g.daysNeeded + ' days of history'];
                if ((g.swgEntries || 0) < g.swgNeeded) parts.push((g.swgEntries || 0) + ' of ' + g.swgNeeded + ' SWG % entries');
                text = 'The tuning options appear once there is enough history to judge the calculation: ' + parts.join(', ') + '.';
            }
            else if (g && g.advanced === true && g.tuneAccepted === false && g.automationAvailable === false) text = 'Run Tune and accept its result to continue.';
            self._elGateNote.text(text).toggle(text.length > 0);
            self._applyAutoTuneState();
        },
        // "SWG can make up to 4.74 ppm/day at its 100% setting over 7.75 h (09:21-17:06, from schedule #2)". The window comes from the server (it knows the
        // schedule); the volume and the cell's rating are the saved ones (PoolMath's and the chlorinator's).
        _applySwgWindow: function (cfg) {
            var self = this;
            if (cfg && typeof cfg.gallons === 'number') { self._gallons = cfg.gallons; self._gallonsSource = cfg.gallonsSource; }
            if (self._elPoolVolume && typeof self._gallons === 'number') {
                self._elPoolVolume.text(self._gallons > 0
                    ? 'Pool volume ' + Math.round(self._gallons).toLocaleString() + ' gal (' + (self._gallonsSource === 'poolmath' ? 'from PoolMath History' : 'from the body capacity; PoolMath History has none yet') + ').'
                    : 'Pool volume: not known yet (set up PoolMath History above).');
            }
            if (!self._elSwgCapacity) return;
            if (cfg && cfg.swgWindow) self._swgWindow = cfg.swgWindow;
            if (cfg && typeof cfg.swgLbsPerDay === 'number') self._swgLbsPerDay = cfg.swgLbsPerDay;
            var w = self._swgWindow;
            if (!w || !(w.hours > 0)) { self._elSwgCapacity.hide(); return; }
            var v = {};
            try { v = dataBinder.fromElement(self._pnl) || {}; } catch (e) { v = {}; }
            var gal = Number(self._gallons), lbs = Number(self._swgLbsPerDay);
            var ppm = gal > 0 && lbs > 0 ? (lbs * 1000000) / (gal * 8.34) * (w.hours / 24) : w.ppmPerDayAtFull;
            if (!(ppm > 0)) { self._elSwgCapacity.hide(); return; }
            var src = w.note && /schedule #/.test(w.note) ? ', from ' + /schedule #\d+/.exec(w.note)[0] : '';
            self._elSwgCapacity.text('The SWG can make up to ' + ppm.toFixed(2) + ' ppm/day of FC at its 100% setting over ' + (Math.round(w.hours * 100) / 100) + ' h (' + w.start + '-' + w.stop + src + ').')
                .attr('title', 'The rated lbs/day scaled to the run window, for this pool volume. The recommended SWG % is the share of this that is needed.').show();
        },
        // The Away protection status line under its settings; while it is on, the settings it pauses are grayed out.
        _applyAwayStatus: function (cfg) {
            var self = this;
            if (!self._elAwayStatus) return;
            var status = cfg && cfg.awayStatus, text = '', color = '#666';
            if (status === 'active') {
                var since = cfg.awayStartedAt ? new Date(cfg.awayStartedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '';
                text = 'Away protection is ON' + (since ? ' (since ' + since + ')' : '') + '. It checks PoolMath every 12 hours and may raise the SWG % to make up for dilution or an outage, never below the maintenance %. A storm or outage adds at most ' + (cfg.stormMaxExtraPct) + ' points to the plan; the glide to your vacation target is not limited. Auto-Apply, the automatic check and auto tune are paused (their settings are kept). It ends when you uncheck it and save, or by itself when a new FC reading is logged in PoolMath. The target in use is the Vacation Target FC (' + cfg.awayTargetFc + ' ppm); your normal ' + (cfg.controlMode === 'target' ? 'Target FC (' + cfg.targetFc + ' ppm)' : 'FC range (' + cfg.fcLow + ' to ' + cfg.fcHigh + ' ppm)') + ' applies again when it ends.';
                color = '#2a7';
            }
            else if (status === 'needs-step') { text = 'Turn on "Return to the maintenance % when the target period ends" so each boost ends by itself. Away protection is off until then.'; color = '#b36b00'; }
            else if (cfg && cfg.awayEndedNote) { text = cfg.awayEndedNote; color = '#0b3d5c'; }
            self._elAwayStatus.text(text).css({ color: color }).toggle(text.length > 0);
            // The tooltip says what this checkbox does with the target: the Vacation Target FC is used while it is on, and the normal Target FC is not changed.
            if (self._cbAway && self._awayTipBase) {
                var vac = cfg && typeof cfg.awayTargetFc === 'number' ? cfg.awayTargetFc : null;
                var normText = cfg && cfg.controlMode === 'target' ? 'Target FC (' + (typeof cfg.targetFc === 'number' ? cfg.targetFc + ' ppm' : 'as set') + ')' : 'FC range (' + (cfg && typeof cfg.fcLow === 'number' ? cfg.fcLow + ' to ' + cfg.fcHigh + ' ppm' : 'as set') + ')';
                var lead = status === 'active'
                    ? 'Away protection is on with the Vacation Target FC of ' + vac + ' ppm; your normal ' + normText + ' applies again when it ends.'
                    : 'Checking this and saving makes the Vacation Target FC (' + (vac !== null ? vac + ' ppm' : 'as set') + ') the target in use for the trip; your normal ' + normText + ' is not changed and applies again when Away protection ends.';
                self._cbAway.attr('title', lead + ' ' + self._awayTipBase);
            }
            var paused = status === 'active';
            [self._elAutoApplyRow, self._elAutoCheckRow, self._elAutoTune].forEach(function (el) {
                if (el) el.css({ opacity: paused ? 0.45 : '', pointerEvents: paused ? 'none' : '' }).attr('title', paused ? 'Paused while Away protection is on.' : null);
            });
        },
        // The Auto tune settings are shown only when the server says auto tune is available (the automatic mode, with enough history and an accepted Tune).
        // Under them: how many Tune recommendations you have applied yourself, and what the last auto tune did.
        _applyAutoTuneState: function () {
            var self = this, g = self._gate;
            if (!self._elAutoTune) return;
            var show = !!(g && g.automatic === true && g.autoTuneAvailable === true);
            self._elAutoTune.toggle(show);
            if (!show) return;
            var done = g.manualTuneApplies || 0, need = g.manualTuneAppliesNeeded || 0;
            self._elAutoTuneGuard.text('Tune recommendations you have applied yourself: ' + done + (need > 0 ? ' of the ' + need + ' needed before auto tune may apply any.' : '.'));
            $.getApiService('/state/autoSwg', null, function (result) {
                var note = result && result.autoTuneNote;
                var when = result && result.autoTuneAt ? new Date(result.autoTuneAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ': ' : '';
                self._elAutoTuneNote.text(note ? 'Last auto tune, ' + when + note : 'Auto tune has not run yet.');
            });
        },
        // Reads the gate again (after a Tune was applied or accepted) so the tuning options and the automation settings appear.
        _reloadGate: function () {
            var self = this;
            $.getApiService('/config/autoSwg', null, function (cfg) {
                self._automation = !(cfg && cfg.automationAvailable === false);
                self._gate = cfg && cfg.gate;
                self._updateAutoApplyFields(cfg && cfg.autoApplyEnabled);
                self._applyAwayStatus(cfg);
                self._applySwgWindow(cfg);
                self._applyGateNote();
                self._applyTuningState();
            });
        },
        // Tuning options: shown or hidden, with a note of how many differ from the defaults so a hidden
        // non-default setting isn't forgotten.
        _applyTuningState: function () {
            var self = this;
            if (!self._elTuningToggle) return;
            // The tuning options stay hidden until the server says there is enough history to tune on (an older server that doesn't say leaves them as they were).
            var tuningOk = !(self._gate && self._gate.tuningAvailable === false);
            self._elTuningToggle.toggle(tuningOk);
            var open = !!self._tuningOpen && tuningOk;
            self._elTuningToggle.find('i').removeClass('fa-chevron-right fa-chevron-down').addClass(open ? 'fa-chevron-down' : 'fa-chevron-right');
            self._elTuning.toggle(open);
            self._updateTuningBadge();
        },
        _updateTuningBadge: function () {
            var self = this;
            if (!self._elTuningToggle || !self._pnl) return;
            var v = {};
            try { v = dataBinder.fromElement(self._pnl) || {}; } catch (e) { return; }
            var n = 0, d = self._tuningDefaults || {};
            Object.keys(d).forEach(function (k) {
                if (typeof v[k] === 'undefined' || v[k] === null || v[k] === '') return;
                if (Number(v[k]) !== Number(d[k])) n++;
            });
            self._elTuningToggle.find('.picAutoSwgTuningBadge').text(n > 0 ? '(' + n + ' changed from the defaults)' : '');
        },
        // After a report saves settings straight to the server, show them in the Settings form too. Otherwise the
        // form keeps the old values, looks as if nothing changed, and a later Save would quietly put them back.
        _applySettingsToForm: function (settings) {
            var self = this, keys = Object.keys(settings || {});
            var labels = { windowDays: 'Averaging Window', nightBurnRatio: 'Night Burn vs Day', projectionWeight: 'Projection Weighting', projectionTaperStartDays: 'Taper Weighting After', projectionTaperEndDays: 'Down to Zero At', creditChlorineAdditions: 'Credit liquid chlorine additions', fcAnomalyTolerancePpm: 'FC Anomaly Tolerance', daytimeLossSharePct: 'Daytime Share of FC Loss', burnTempAdjust: 'Water temperature adjustment' };
            var show = function (vals) {
                keys.forEach(function (k) { self._setBound(k, vals[k]); });
                self._updateTuningBadge();
                self._markSaved(keys);
                // The tuning options are usually collapsed: open them so the new values are in view.
                if (keys.some(function (k) { return typeof self._tuningDefaults[k] !== 'undefined'; }) && !self._tuningOpen) {
                    self._tuningOpen = true;
                    self._applyTuningState();
                }
                var parts = keys.map(function (k) { return (labels[k] || k) + ' = ' + (typeof vals[k] === 'boolean' ? (vals[k] ? 'on' : 'off') : vals[k]); });
                self._elApplied.text('Saved to the server at ' + new Date().toLocaleTimeString([], { timeStyle: 'short' }) + ': ' + parts.join('  ·  ') + '. The form now shows these values.').show();
                try { self._elApplied[0].scrollIntoView({ block: 'nearest' }); } catch (e) { /* not essential */ }
            };
            // Show what was sent right away, then re-read the saved settings so what is displayed is what the server holds.
            show(settings || {});
            $.getApiService('/config/autoSwg', null, function (cfg) {
                if (cfg) show($.extend({}, settings, keys.reduce(function (o, k) { if (typeof cfg[k] !== 'undefined') o[k] = cfg[k]; return o; }, {})));
            });
        },
        // Dirty check for Save Settings. The baseline is the form as bound from the server (read back through the
        // same binder, so formatting differences can't look like edits); Save is enabled only while the form
        // differs from it.
        _formValues: function () {
            var self = this, v = {};
            try { v = dataBinder.fromElement(self._pnl) || {}; } catch (e) { }
            return v;
        },
        // Absent, null and '' are the same ("not set"); numbers compare as numbers ("21" equals 21).
        _normValue: function (x) {
            if (typeof x === 'undefined' || x === null || x === '') return '';
            if (typeof x === 'boolean') return x ? 'true' : 'false';
            var n = Number(x);
            return (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '' && !isNaN(n))) ? String(n) : String(x);
        },
        // Records the form as saved: all of it, or (after a report saved just some settings straight to the server)
        // only those keys, so other unsaved edits stay unsaved.
        _markSaved: function (keys) {
            var self = this;
            var now = self._formValues();
            if (!keys && self._elApplied) self._elApplied.hide();
            if (!self._savedValues || !keys) self._savedValues = $.extend({}, now);
            else keys.forEach(function (k) { self._savedValues[k] = now[k]; });
            self._updateSaveButton();
        },
        _isDirty: function () {
            var self = this;
            if (!self._savedValues) return false;
            var now = self._formValues(), seen = {}, dirty = false;
            Object.keys(self._savedValues).concat(Object.keys(now)).forEach(function (k) {
                if (seen[k]) return;
                seen[k] = true;
                if (self._normValue(self._savedValues[k]) !== self._normValue(now[k])) dirty = true;
            });
            return dirty;
        },
        _updateSaveButton: function () {
            var self = this;
            if (!self._btnSave) return;
            var enable = !!self._savedValues && self._isDirty();
            if (self._btnSave.hasClass('disabled') === enable) {
                self._btnSave[0].disabled(!enable);
                self._btnSave.attr('title', enable ? 'Saves the changes you have made to these settings.' : 'No unsaved changes.');
            }
        },
        // The widgets raise their own events (change, selection) and some only the usual browser ones, so listen for
        // all of them on the panel, and re-check on a slow timer too in case one is missed. The timer stops when the
        // panel leaves the page.
        _watchForChanges: function () {
            var self = this, timer = null;
            var later = function () {
                if (timer) return;
                timer = setTimeout(function () { timer = null; self._updateSaveButton(); }, 0);
            };
            self._pnl.on('change input keyup click selchanged selected', later);
            var poll = setInterval(function () {
                if (!self._pnl || !$.contains(document.documentElement, self._pnl[0])) { clearInterval(poll); return; }
                self._updateSaveButton();
            }, 1000);
        },
        // Sets a bound settings field by name (the same way the form loads it).
        _setBound: function (name, value) {
            var self = this;
            self._pnl.find('div[data-bind="' + name + '"]').each(function () { if (typeof this.val === 'function') this.val(value); });
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
            // The automation is shown only once the server says it is available (enough history and an accepted Tune); an older server that
            // doesn't say leaves the settings as they were.
            var available = self._automation !== false;
            autoApplyEnabled = available && !!autoApplyEnabled;
            if (self._elAutoApplyRow) self._elAutoApplyRow.toggle(available);
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
            // Check Now: New Target stays available with Auto-Apply on: it starts a new target from the settings and applies it at once, which is the way to
            // start over when a refresh keeps the old deadline.
            self._btnCheck.show();
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
                        self._automation = !(cfg && cfg.automationAvailable === false);
                        self._gate = cfg && cfg.gate;
                        self._fcRange = { low: cfg && cfg.fcLow, high: cfg && cfg.fcHigh };
                        self.dataBind(cfg);
                        self._updateManualTimeFields(cfg && cfg.scheduleId);
                        self._updateAutoApplyFields(cfg && cfg.autoApplyEnabled);
                        self._applyAwayStatus(cfg);
                        self._applySwgWindow(cfg);
                        self._applyGateNote();
                        self._applyTuningState();
                        self._updateTuningBadge();
                        self._updateActionButtons(cfg && cfg.autoApplyEnabled && cfg.awayStatus !== 'active');
                        self._markSaved();
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
            self._renderSectionA(result);
            if (result.archiveError) self._elArchiveStatus.text('PoolMath history sync problem: ' + result.archiveError + (result.archiveCount ? ' (last good sync kept ' + result.archiveCount + ' entries)' : '')).show();
            else if (result.archiveCount) self._elArchiveStatus.text('PoolMath history archive: ' + result.archiveCount + ' entries back to ' + new Date(result.archiveOldest).toLocaleDateString([], { dateStyle: 'medium' }) + ' (synced ' + new Date(result.archiveSyncedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ')').show();
            else self._elArchiveStatus.hide();
            var hasApplied = result.lastAppliedAt && Array.isArray(result.lastAppliedRationale) && result.lastAppliedRationale.length > 0;
            self._elAppliedRationale.empty();
            if (hasApplied) {
                self._setDetailsHeader(self._elAppliedRationaleHeader, 'Calculation details: from the ' + result.lastAppliedPct + '% applied on ' + new Date(result.lastAppliedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ' (what\'s actually running now)');
                result.lastAppliedRationale.forEach(function (line) { $('<li></li>').appendTo(self._elAppliedRationale).text(line); });
                self._elAppliedRationale.toggle(!!self._calcDetailsOpen);
            }
            else { self._elAppliedRationaleHeader.hide(); self._elAppliedRationale.hide(); }
            var hasSectionA = !!(result.stepAt || result.lastAppliedAt);

            // Section B: the (possibly unapplied) calculation preview -- absent entirely once
            // there's no calculation to show (e.g. right after Cancel), regardless of section A.
            if (hasCalc && result.targetWarning) self._elTargetWarning.text('⚠ ' + result.targetWarning).show();
            else self._elTargetWarning.hide();
            if (hasCalc && result.targetInfo) self._elTargetInfo.text('ℹ ' + result.targetInfo).show();
            else self._elTargetInfo.hide();
            if (hasCalc && result.ratingNote) self._elRatingNote.text('⚠ ' + result.ratingNote).show();
            else self._elRatingNote.hide();
            if (hasCalc && result.fcAnomalyNote) self._elFcAnomaly.text('⚠ ' + result.fcAnomalyNote).show();
            else self._elFcAnomaly.hide();
            if (hasCalc && result.staleFcNote) self._elStaleFcNote.text('ℹ ' + result.staleFcNote).show();
            else self._elStaleFcNote.hide();
            if (hasCalc && result.saltNote) self._elSaltNote.text('ℹ ' + result.saltNote).show();
            else self._elSaltNote.hide();
            self._renderBenchCyaAdvice(result);
            self._elAsOf.toggle(hasCalc).text(hasCalc && fromSaved ? 'As of last check: ' + new Date(result.lastCheckedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ' -- run Check Now to refresh.' : '');
            self._elCalcHeader.toggle(hasCalc).text(result.pending ? 'Latest calculation (not applied yet):' : 'Latest calculation (applied):');
            // Under range control there is no target or deadline to reach: the % keeps FC between the low and the high (Away protection still steers to its target).
            var inRange = result.controlMode === 'band' && result.awayStatus !== 'active' && typeof result.fcLow === 'number' && typeof result.fcHigh === 'number';
            self._elRecommendedPct.toggle(hasCalc).text('Recommended SWG %: ' + result.recommendedPct + '% (' + (inRange ? 'keeping FC between ' + result.fcLow + ' and ' + result.fcHigh + ' ppm' : 'to reach target FC by the deadline and stay at or above it') + ')');
            self._elMaintenancePct.toggle(hasCalc).text('Steady-state maintenance would only need: ' + result.maintenancePct + '%');
            self._elAvgConsumption.toggle(hasCalc).text('Average FC consumption: ' + result.avgConsumptionPpmPerDay + ' ppm/day');
            self._elAvgWindow.toggle(hasCalc).text(self._describeAvgWindow(result));
            var fcRange = (result.details || {}).projectedFcRange;
            self._elProjectedFc.toggle(hasCalc).text('Projected current FC: ' + result.projectedCurrentFc + ' ppm' + (hasCalc && fcRange ? ' (the next test is likely to read ' + fcRange.low.toFixed(1) + ' to ' + fcRange.high.toFixed(1) + ' ppm, about 90%; that is the variation to expect from the test itself and from day-to-day consumption)' : ''))
                .attr('title', fcRange ? (fcRange.basis === 'history' ? 'The projection plus or minus how far it has recently missed the tests that followed it (' + fcRange.intervals + ' intervals in the last 90 days), a little wider for an older reading. The Projection Accuracy report shows how often this range actually held for your pool.' : 'Too few intervals in the last 90 days to measure how far the projection misses, so a typical value was used.') : '');
            // A newer check exists (unapplied) whenever it's later than the last apply, or
            // there's never been an apply at all.
            var hasNewerCheck = hasCalc && (!result.lastAppliedAt || new Date(result.lastCheckedAt) > new Date(result.lastAppliedAt));
            self._elRationale.empty();
            if (hasCalc && (hasNewerCheck || !hasApplied)) {
                self._setDetailsHeader(self._elRationaleHeader, hasApplied ? 'Calculation details: from the latest (not yet applied) calculation' : 'Calculation details: from the last calculation', !!result.pending);
                (result.rationale || []).forEach(function (line) { $('<li></li>').appendTo(self._elRationale).text(line); });
                self._elRationale.toggle(!!self._calcDetailsOpen || !!result.pending);
            }
            else { self._elRationaleHeader.hide(); self._elRationale.hide(); }

            self._elResultDivider.toggle(hasSectionA && hasCalc);
            self._resultsPnl.toggle(hasSectionA || hasCalc);
            self._startSectionARefresh();
        },
        // A "Calculation details" header with a chevron: clicking it expands or contracts the lists of explanations (both of them together, and the choice is
        // remembered in this browser). `forceOpen` keeps a list open that is waiting for your Apply.
        _setDetailsHeader: function (header, text, forceOpen) {
            var self = this;
            var open = !!self._calcDetailsOpen || !!forceOpen;
            header.empty().css({ cursor: 'pointer', userSelect: 'none' }).attr('title', 'Click to expand or contract the calculation details')
                .append($('<i></i>').addClass('fas').addClass(open ? 'fa-chevron-down' : 'fa-chevron-right').css({ width: '1rem', display: 'inline-block' }))
                .append($('<span></span>').text(text)).show();
            if (!header.data('detailsBound')) {
                header.data('detailsBound', true).on('click', function () {
                    self._calcDetailsOpen = !self._calcDetailsOpen;
                    try { window.localStorage.setItem('autoSwgCalcDetailsOpen', self._calcDetailsOpen ? '1' : '0'); } catch (e) { /* storage unavailable */ }
                    self._applyDetailsOpen();
                });
            }
        },
        // Opens or contracts the two lists (and turns their chevrons) to match the choice, without redrawing the rest.
        _applyDetailsOpen: function () {
            var self = this, pending = !!(self._lastResult && self._lastResult.pending);
            [[self._elAppliedRationaleHeader, self._elAppliedRationale, false], [self._elRationaleHeader, self._elRationale, pending]].forEach(function (p) {
                var open = !!self._calcDetailsOpen || p[2];
                p[0].find('i').removeClass('fa-chevron-right fa-chevron-down').addClass(open ? 'fa-chevron-down' : 'fa-chevron-right');
                if (p[0][0].style.display !== 'none') p[1].toggle(open);
            });
        },
        // The applied status at the top of the results: what is running now, when it was last applied and when the next automatic check is due, plus the pending
        // step, which comes right after the last applied line because it is what happens next. Redrawn by every result and, so the countdown and the step follow changes made elsewhere (the automatic check, another tab), once a minute.
        _renderSectionA: function (result) {
            var self = this;
            if (typeof result.lastAppliedPct === 'number') self._elRunningNow.text('Current SWG %: ' + result.lastAppliedPct + '%').show();
            else self._elRunningNow.hide();
            if (result.stepAt) self._elPendingStep.text('Pending step: ' + self._describePendingStep(result)).show();
            else self._elPendingStep.hide();
            if (result.lastAppliedAt) self._elLastApplied.text('Last applied: ' + result.lastAppliedPct + '% on ' + new Date(result.lastAppliedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })).show();
            else self._elLastApplied.hide();
            // When the periodic automatic check is next due (only present while it's running).
            if (result.nextAutoCheckAt) self._elNextAutoCheck.text('Next automatic check: ' + new Date(result.nextAutoCheckAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })).show();
            else self._elNextAutoCheck.hide();
        },
        // Reloads what the server has now: section A (what is applied, the pending step, the next check) always, and the whole calculation and its details
        // when a newer one has been made (an automatic check, or Away protection acting) and there is no unapplied preview here waiting for your Apply.
        _refreshFromServer: function () {
            var self = this;
            if (!self.element || self.element.closest('body').length === 0) return;
            if (!self._resultsPnl || !self._resultsPnl.is(':visible')) return;
            $.getApiService('/state/autoSwg', null, function (result) {
                if (!result) return;
                self._renderSectionA(result);
                var shown = self._lastResult;
                if ((!shown || !shown.pending) && result.lastCheckedAt && (!shown || shown.lastCheckedAt !== result.lastCheckedAt)) {
                    self._renderResult(result, true);
                    // The Away protection status line (and its note about the end) can change with a new apply: read it again.
                    $.getApiService('/config/autoSwg', null, function (cfg) { if (cfg) self._applyAwayStatus(cfg); });
                }
            });
        },
        // Once a minute while the results are showing (see _refreshFromServer, which does not touch an unapplied preview).
        _startSectionARefresh: function () {
            var self = this;
            if (self._sectionATimer) return;
            self._sectionATimer = setInterval(function () {
                if (!self.element || self.element.closest('body').length === 0) { clearInterval(self._sectionATimer); self._sectionATimer = undefined; return; }
                self._refreshFromServer();
            }, 60000);
        },
        // Concise one-liner for a pending auto-step: what happens at the end of the target period, to what %, and when -- e.g.
        // "at the end of the target period (target FC 8.5 ppm) SWG drops to 15% (10/7/26, 6:41 AM, in 23h 59m)".
        _describePendingStep: function (result) {
            var self = this;
            // lastAppliedPct, not currentPct -- currentPct is only refreshed by a Check Now, so
            // right after an Apply (see _confirmApply) it can still hold the pre-apply value.
            var verb = result.stepPct > result.lastAppliedPct ? 'rises to ' : 'drops to ';
            var target = new Date(result.stepAt);
            var remaining = self._fmtCountdown(target.getTime() - Date.now());
            // Under range control the automatic checks decide the %, and every apply sets this step a day ahead again, so it is no forecast of when the SWG resumes: it is what happens if the checks stop.
            if (result.controlMode === 'band' && result.awayStatus !== 'active' && typeof result.fcLow === 'number' && typeof result.fcHigh === 'number')
                return 'if no automatic check has run by then (FC range ' + result.fcLow + ' to ' + result.fcHigh + ' ppm), SWG ' + verb + result.stepPct + '% (' + target.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ', in ' + remaining + ')';
            // lastAppliedTargetFc is whatever targetFc was in effect at the apply that scheduled
            // this step -- not necessarily today's config, which may have changed since.
            var s = 'at the end of the target period' + (typeof result.lastAppliedTargetFc === 'number' ? ' (target FC ' + result.lastAppliedTargetFc + ' ppm)' : '') + ' SWG ' + verb + result.stepPct + '%';
            // When the period ends while the SWG is off, the step is set for one minute after its next start: say both times so the later one is not read as the end.
            var end = result.lastAppliedTargetDate ? new Date(result.lastAppliedTargetDate) : null;
            if (end && !isNaN(end.getTime()) && Math.abs(target.getTime() - end.getTime()) > 10 * 60000) {
                return s.replace('at the end of the target period', 'at the end of the target period (' + end.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ')')
                    + '; the SWG is off then, so the step is set for one minute after it next starts (' + target.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ', in ' + remaining + ')';
            }
            return s + ' (' + target.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ', in ' + remaining + ')';
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
        // What kind of row a combined-history entry is, and its main value as shown in the dialog.
        // The settings a SETTINGS row changed, as readable text ("Target FC 9 -> 10; ...").
        _settingsChangeText: function (e) {
            var labels = { controlMode: 'FC Control', fcLow: 'FC Low', fcHigh: 'FC High', bandBiasPerDay: 'Raise for an Old Test', bandBoostPeriods: 'Boost Over (run periods)', bandPeakCap: 'Keep the Afternoon Peak Under FC High', bandIntegral: 'Correct the Hold from the Last Readings', bandScaledBias: 'Scale the Old-Test Raise by the Last Reading', enabled: 'Enabled', chlorinatorId: 'Chlorinator', gallons: 'Pool Volume', swgLbsPerDay: 'SWG Capacity', swgStartTime: 'SWG Run Start', swgStopTime: 'SWG Run Stop', scheduleId: 'SWG Schedule', timezone: 'Time Zone', targetFc: 'Target FC', awayTargetFc: 'Vacation Target FC', targetPeriodsAbove: 'Run Periods (days) to Target (FC above target)', targetPeriodsBelow: 'Run Periods (days) to Target (FC below target)', targetDaysAbove: 'Days to Target (FC above target)', targetDaysBelow: 'Days to Target (FC below target)', newTargetDateThresholdPpm: 'New Target Date Threshold', autoStepEnabled: 'Step to maintenance %', autoApplyEnabled: 'Auto-Apply Recommendations', autoCheckEnabled: 'Automatic check', autoCheckHours: 'Check Every', autoCheckStartTime: 'Starting At', autoApplyWarnThresholdPct: 'Warning Threshold', windowDays: 'Averaging Window', daytimeLossSharePct: 'Daytime Share of FC Loss', creditChlorineAdditions: 'Credit liquid chlorine', fcAnomalyTolerancePpm: 'FC Anomaly Tolerance', projectionWeight: 'Projection Weighting', projectionTaperStartDays: 'Taper Weighting After', projectionTaperEndDays: 'Down to Zero At', overshootPpmPerDay: 'Aim Above Target as the Last Test Ages', burnTempAdjust: 'Water temperature adjustment', shareCode: 'PoolMath Share Code', poolName: 'Pool/Body Name' };
            var fmt = function (v) { return typeof v === 'boolean' ? (v ? 'on' : 'off') : (v === undefined || v === null || v === '' ? '(none)' : String(v)); };
            return (e.changes || []).map(function (c) {
                var name = labels[c.setting] || c.setting;
                return c.from === '(hidden)' ? name + ' changed' : name + ' ' + fmt(c.from) + ' \u2192 ' + fmt(c.to);
            }).join('; ');
        },
        _historyTypeLabel: function (e) {
            if (e.type === 'SETTINGS') return 'Settings change';
            if (e.type === 'FC') return 'FC reading';
            if (e.type === 'CYA') return 'CYA change';
            if (e.type === 'CL') return 'Liquid chlorine';
            return 'SWG %';
        },
        _historyValueLabel: function (e) {
            var n = function (v, d) { return typeof v === 'number' ? String(Math.round(v * Math.pow(10, d)) / Math.pow(10, d)) : ''; };
            if (e.type === 'SETTINGS') return this._settingsChangeText(e);
            if (e.type === 'FC') return n(e.value, 2) + ' ppm';
            if (e.type === 'CYA') return n(e.value, 1) + ' ppm' + (typeof e.previous === 'number' ? ' (was ' + n(e.previous, 1) + ')' : ' (first reading)');
            if (e.type === 'CL') return n(e.ml / 29.5735295625, 1) + ' oz of ' + n(e.percent, 2) + '%' + (typeof e.ppm === 'number' ? ' (+' + n(e.ppm, 2) + ' ppm FC)' : '');
            return n(e.pct, 2) + '%';
        },
        // Human-readable source of a combined-history entry: PoolMath, or the local
        // log (an applied recommendation, an applied-but-overridden one, or a manual change).
        _historySourceLabel: function (e) {
            if (e.type === 'SETTINGS') return e.via === 'tune' ? 'Local - settings change (Tune)' : 'Local - settings change';
            if (e.source === 'poolmath') return 'PoolMath';
            if (e.source === 'local-manual') return 'Local - manual change';
            var rec = e.record || {};
            if (typeof rec.recommendedPct === 'number' && rec.recommendedPct !== e.pct && rec.trigger !== 'step') return 'Local - applied (overridden)';
            // What caused it (records written before this was kept have no trigger and keep the plain label).
            var how = { 'automatic-check': 'automatic check', 'refresh-and-apply': 'Refresh and Apply', 'check-now': 'Check Now, auto-apply', 'refine': 'Refresh: Adjust %, auto-apply', 'reviewed': 'reviewed Apply' }[rec.trigger];
            if (rec.trigger === 'step' || (rec.outputs && rec.outputs.autoStep)) return 'Local - automatic step to maintenance';
            return how ? 'Local - applied (' + how + ')' : 'Local - applied recommendation';
        },
        // What an applied recommendation did with the target date: kept the original deadline (a refresh), started a
        // new one, or started one and moved it out to when consumption alone reaches the target.
        _historyTargetLabel: function (e) {
            var rec = e.record || {};
            if (e.type !== 'SWG' || !rec.targetOutcome || !rec.targetDate) return '';
            var d = this._fmtDateTime(rec.targetDate);
            // How far FC was from the target against the threshold, when the check compared them.
            var why = typeof rec.targetStrayPpm === 'number' && typeof rec.targetThresholdPpm === 'number' ? ' [off by ' + rec.targetStrayPpm + ', threshold ' + rec.targetThresholdPpm + ']' : '';
            // A change of the run window since the previous apply.
            var win = rec.runWindowChange ? ' {run window ' + rec.runWindowChange.from + ' \u2192 ' + rec.runWindowChange.to + '}' : '';
            if (rec.targetOutcome === 'kept') return 'Kept ' + d + why + win;
            var was = rec.previousTargetDate ? ' (was ' + this._fmtDateTime(rec.previousTargetDate) + ')' : '';
            return (rec.targetOutcome === 'new-extended' ? 'New, moved out ' : 'New ') + d + was + why + win;
        },
        // Pressing Tune: if it was run recently and too few FC readings have come in since to tell whether its change
        // helped, ask first (with a Cancel). If the tuning settings were changed by hand since the last Tune, tuning again
        // can be worthwhile, so go straight ahead.
        _tuneClick: function () {
            var self = this;
            $.getApiService('/state/autoSwg/tune/status', null, function (st) {
                st = st || {};
                if (st.running) { self._showTune(st); return; }   // one is already running (auto tune, or another page): wait for its result
                var tooSoon = !!st.lastTuneAt && !st.manualChangeSinceTune && typeof st.readingsSinceTune === 'number' && st.readingsSinceTune < (st.needed || 10);
                if (!tooSoon) { self._showTune(st); return; }
                var n = st.readingsSinceTune;
                $.pic.modalDialog.createConfirm('dlgAutoSwgTuneAgain', {
                    message: 'You last tuned on ' + new Date(st.lastTuneAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ', and ' + (n === 0 ? 'no new FC readings have' : n + ' new FC reading' + (n === 1 ? ' has' : 's have')) + ' come in since. '
                        + 'About ' + (st.needed || 10) + ' are needed to tell whether that change helped. Tuning again now fits the same history a second time, so any improvement it shows is likely to be noise. Tune anyway?',
                    width: '460px', height: 'auto', title: 'Tune again so soon?',
                    buttons: [
                        { text: 'Cancel', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } },
                        { text: 'Tune Anyway', icon: '<i class="fas fa-sliders"></i>', click: function () { $.pic.modalDialog.closeDialog(this); self._showTune(st); } }
                    ]
                });
            });
        },
        // A Tune takes minutes on a Raspberry Pi, and the server runs only one at a time: a request while one runs waits for that run. While
        // it runs, the Tune button is disabled and shows how far it is (polled every 5 seconds). A page opened while a Tune runs waits for
        // that run's result (?join=1 starts none) instead of starting one.
        _checkTuneRunning: function () {
            var self = this;
            $.getApiService('/state/autoSwg/tune/status?run=1', null, function (s) {
                if (s && s.running) self._showTune(s, true);
            });
        },
        _tuneProgressStart: function (s) {
            var self = this;
            self._tuneRunning = true;
            self._btnTune[0].disabled(true);
            var show = function (r) {
                if (!self._tuneRunning) return;
                r = r || {};
                var since = new Date(r.startedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                // the current settings are about a sixteenth of the work, the alternatives the rest
                var pct = r.total > 0 ? Math.floor(r.phase === 'sweep' ? 6 + 94 * r.done / r.total : 6 * r.done / r.total) : 0;
                self._btnTune[0].buttonText('Tune is running since ' + since + ', ' + pct + '%');
            };
            show(s && s.running ? s : {});
            clearInterval(self._tuneTimer);
            self._tuneTimer = setInterval(function () {
                $.getApiService('/state/autoSwg/tune/status?run=1', null, function (r) { if (r && r.running) show(r); });
            }, 5000);
        },
        _tuneProgressStop: function () {
            var self = this;
            self._tuneRunning = false;
            clearInterval(self._tuneTimer);
            self._tuneTimer = null;
            self._btnTune[0].buttonText('Tune');
            self._btnTune[0].disabled(false);
        },
        // Tune: the two reports boiled down to one recommendation (GET /state/autoSwg/tune). The detailed reports
        // are one click away from here. `joinOnly`: only wait for the Tune already running (the server answers with nothing if none is).
        _showTune: function (st, joinOnly) {
            var self = this;
            st = st || {};
            self._tuneProgressStart(st);
            $.getApiService('/state/autoSwg/tune' + (joinOnly ? '?join=1' : ''), null, function (t) {
                self._tuneProgressStop();
                if (!t) return;   // joinOnly and the run had already finished
                var buttons = [
                    { text: 'Projection Accuracy', icon: '<i class="fas fa-bullseye"></i>', click: function () { $.pic.modalDialog.closeDialog(this); self._showProjectionAccuracy(); } },
                    { text: 'What-If Sweep', icon: '<i class="fas fa-flask"></i>', click: function () { $.pic.modalDialog.closeDialog(this); self._showWhatIf(); } },
                    { text: 'Close', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }
                ];
                var dlg = $.pic.modalDialog.createDialog('dlgAutoSwgTune', { width: '640px', height: 'auto', title: 'Tune SWG Assist', buttons: buttons });
                var wrap = $('<div></div>').css({ maxHeight: '30rem', overflowY: 'auto', padding: '.25rem .5rem', fontSize: '.9em', lineHeight: '1.35' }).appendTo(dlg);
                var para = function (text, style) { return $('<div></div>').css($.extend({ padding: '.2rem 0' }, style || {})).text(text).appendTo(wrap); };
                var n2 = function (v, d) { return typeof v === 'number' ? v.toFixed(d) : '--'; };
                var signed = function (v) { return typeof v === 'number' ? (v > 0 ? '+' : '') + v.toFixed(2) : '--'; };
                var names = { windowDays: 'Averaging Window', nightBurnRatio: 'Night Burn vs Day', projectionWeight: 'Projection Weighting', projectionTaperStartDays: 'Taper Weighting After', projectionTaperEndDays: 'Down to Zero At', creditChlorineAdditions: 'Credit liquid chlorine additions', fcAnomalyTolerancePpm: 'FC Anomaly Tolerance', burnTempAdjust: 'Water temperature adjustment' };
                var fmt = function (k, v) {
                    if (typeof v === 'boolean') return v ? 'on' : 'off';
                    if (k === 'windowDays' || k === 'projectionTaperStartDays' || k === 'projectionTaperEndDays') return v + (k === 'projectionTaperEndDays' && v === 0 ? ' (no taper)' : ' days');
                    if (k === 'projectionWeight') return Math.round(v * 100) + '%';
                    if (k === 'fcAnomalyTolerancePpm') return v + ' ppm';
                    return String(v);
                };
                var box = function (bg, color) { return $('<div></div>').css({ background: bg, color: color, padding: '.5rem .7rem', borderRadius: '.25rem', margin: '.3rem 0' }).appendTo(wrap); };
                // where we stand
                if (t.widened) {
                    para('The last year holds too few FC readings to tune on, so Tune looked back through your whole history.', { color: '#2a6fa8' });
                }
                if (typeof t.meanAbsError === 'number') {
                    var base = typeof t.unchangedMae === 'number' ? ' The "FC unchanged" baseline is ' + n2(t.unchangedMae, 2) + ' ppm, so the algorithm is ' + Math.abs(Math.round(t.skill * 100)) + '% ' + (t.skill > 0 ? 'better' : 'worse') + ' than that.' : '';
                    para('Your saved settings score a mean error of ' + n2(t.meanAbsError, 2) + ' ppm over ' + t.readings + ' FC readings' + (t.history && t.history.from ? ' (history from ' + new Date(t.history.from).toLocaleDateString([], { dateStyle: 'medium' }) + ')' : '') + '.' + base, { color: '#666' });
                }
                if (t.nightBurnNote) para(t.nightBurnNote, { color: '#555' });
                if (t.status === 'insufficient') {
                    var b0 = box('#ffe9a8', '#5a4300');
                    b0.append($('<div></div>').css({ fontWeight: 'bold' }).text('Not enough readings to tune on yet'));
                    b0.append($('<div></div>').text('Only ' + (t.readings || 0) + ' FC readings could be scored under every setting; at least 15 are needed. Keep logging FC and SWG % in PoolMath and try again later.'));
                }
                else if (t.status === 'good') {
                    var b1 = box('#2a7', '#fff');
                    b1.append($('<div></div>').css({ fontWeight: 'bold' }).text('Your settings look good'));
                    b1.append($('<div></div>').text('Nothing tested is clearly better than what you have, so there is nothing to change. Check again after a season change, a cell swap, or a change in how often you test.'));
                    // Accepting this result (there is nothing to apply) is what lets the automation be turned on.
                    var acceptDone = $('<div></div>').css({ color: '#2a7', fontWeight: 'bold', padding: '.2rem 0' }).hide().appendTo(wrap);
                    var btnAccept = $('<div></div>').appendTo(wrap).actionButton({ text: 'Accept', icon: '<i class="fas fa-check"></i>' })
                        .toggle(!!(self._gate && self._gate.advanced))
                        .attr('title', 'Accept these settings.');
                    btnAccept.on('click', function () {
                        if (btnAccept.hasClass('disabled')) return;
                        btnAccept[0].disabled(true);
                        $.putApiService('/config/autoSwg', { tuneAccepted: true }, 'Saving...', function () {
                            acceptDone.text('Accepted. The automation settings can now be turned on.').show();
                            self._reloadGate();
                        });
                    });
                }
                else if (t.status === 'recommend' && t.recommendation) {
                    var r = t.recommendation;
                    var b2 = box('#2a6fa8', '#fff');
                    b2.append($('<div></div>').css({ fontWeight: 'bold' }).text('Recommended change: ' + r.label));
                    b2.append($('<div></div>').text(Object.keys(r.settings).map(function (k) { return (names[k] || k) + ' = ' + fmt(k, r.settings[k]); }).join('  ·  ')));
                    b2.append($('<div></div>').text('Expected mean error ' + n2(r.currentMae, 2) + ' to ' + n2(r.expectedMae, 2) + ' ppm (change ' + signed(r.change) + ', 90% range [' + signed(r.low) + ', ' + signed(r.high) + ']).'));
                    var next = r.kind === 'window'
                        ? 'Apply it, then press Tune once more: the window interacts with the weighting and taper, so those are judged after it. After that, stop.'
                        : 'Apply it and you are done for now. Wait for about 10 new FC readings, then check the "Since you changed" line in Projection Accuracy.';
                    para(next, { color: '#666' });
                    var done = $('<div></div>').css({ color: '#2a7', fontWeight: 'bold', padding: '.2rem 0' }).hide().appendTo(wrap);
                    var btn = $('<div></div>').appendTo(wrap).actionButton({ text: 'Apply', icon: '<i class="fas fa-check"></i>' });
                    btn.on('click', function () {
                        if (btn.hasClass('disabled')) return;
                        btn[0].disabled(true);
                        $.putApiService('/config/autoSwg', $.extend({ tuneApplied: true }, r.settings), 'Saving the settings...', function () {
                            self._applySettingsToForm(r.settings);
                            self._reloadGate();
                            done.text('Saved. ' + (r.kind === 'window' ? 'Press Tune once more to see whether a weighting or taper is still worthwhile, then stop.' : 'You are done for now. Check "Since you changed" in Projection Accuracy after about 10 new readings.')).show();
                        });
                    });
                }
                if (st.manualChangeSinceTune) {
                    para('You changed the tuning settings by hand since your last Tune, so tuning again can be worthwhile.', { color: '#2a6fa8' });
                }
                // The recent Tune runs (the newest is the one just shown), so results can be compared over time.
                var prevBox = $('<div></div>').appendTo(wrap);
                $.getApiService('/state/autoSwg/tune/history', null, function (h) {
                    var recs = (Array.isArray(h) ? h : []).slice(1, 6);
                    if (recs.length === 0) return;
                    $('<div></div>').css({ fontWeight: 'bold', padding: '.6rem 0 .15rem 0' }).text('Previous tunes').appendTo(prevBox);
                    recs.forEach(function (r) {
                        var st2 = r.settings || {};
                        var set = 'window ' + st2.windowDays + ' d, weighting ' + Math.round((st2.projectionWeight !== undefined ? st2.projectionWeight : (st2.projectionDamping !== undefined ? st2.projectionDamping : 1)) * 100) + '%' + (st2.projectionTaperEndDays > 0 ? ', taper ' + st2.projectionTaperStartDays + ' to ' + st2.projectionTaperEndDays + ' d' : ', no taper');
                        var outcome = r.status === 'good' ? 'settings looked good'
                            : r.status === 'insufficient' ? 'too few readings to tune on'
                            : 'recommended ' + (r.recommendation ? r.recommendation.label + ' (expected ' + n2(r.recommendation.expectedMae, 2) + ' ppm)' : '') + (r.applied ? ', applied ' + (r.applied.by === 'auto' ? 'automatically ' : '') + new Date(r.applied.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : ', not applied' + (r.held && r.held.length ? ' (held: ' + r.held.join('; ') + ')' : ''));
                        if (r.by === 'auto') outcome = 'auto tune: ' + outcome;
                        $('<div></div>').css({ fontSize: '.85em', color: '#666', padding: '.1rem 0' })
                            .text(new Date(r.ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + set + ' · ' + r.readings + ' readings, error ' + n2(r.meanAbsError, 2) + ' ppm' + (typeof r.unchangedMae === 'number' ? ' (baseline ' + n2(r.unchangedMae, 2) + ')' : '') + ' · ' + outcome)
                            .appendTo(prevBox);
                    });
                });
                para('Tune uses your saved settings: if you just changed them in the form, press Save Settings first. Gains are an estimate until about 10 new readings confirm them.', { color: '#666', fontSize: '.85em' });
            }, function () { self._tuneProgressStop(); });   // the error itself is shown by the API helper; on the server the run goes on, and Tune joins it
        },
        // A short guide to tuning: what the two reports are for, the order to use them in, and how to check the result.
        _showTuningHelp: function () {
            var self = this;
            var dlg = $.pic.modalDialog.createDialog('dlgAutoSwgTuningHelp', { width: '640px', height: 'auto', title: 'How to Tune SWG Assist',
                buttons: [{ text: 'Close', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }] });
            var wrap = $('<div></div>').css({ maxHeight: '30rem', overflowY: 'auto', padding: '.25rem .5rem', fontSize: '.9em', lineHeight: '1.35' }).appendTo(dlg);
            var para = function (text, style) { return $('<div></div>').css($.extend({ padding: '.2rem 0' }, style || {})).text(text).appendTo(wrap); };
            var head = function (text) { return $('<div></div>').css({ fontWeight: 'bold', padding: '.5rem 0 .1rem 0' }).text(text).appendTo(wrap); };
            var list = function (items) {
                var ul = $('<ul></ul>').css({ margin: '.1rem 0 .3rem 0', paddingLeft: '1.2rem' }).appendTo(wrap);
                items.forEach(function (t) { $('<li></li>').appendTo(ul).text(t); });
            };
            para('SWG Assist works from your PoolMath log. For it to work at all, log your FC tests and every change to the SWG % in the PoolMath app, and turn on sharing for the pool (enter its share code in Settings). More frequent FC tests and promptly logged SWG changes give better results.');
            var stages = ['First, run in manual mode for a while: use Check Now, read each recommendation and apply it yourself.'];
            if (self._automation !== false) {
                stages.push('Then turn on Auto-Apply Recommendations for a while and tune with your real history (the Tune button below). Auto-Apply changes the SWG % with no review, so watch the dashboard warnings.');
                stages.push('Only then turn on "Also check PoolMath automatically", which re-checks on its own every "Check Every" hours.');
            }
            else stages.push('Tune with your real history (the Tune button below), and keep applying each recommendation yourself.');
            head(self._automation !== false ? 'Getting started: go in stages' : 'Getting started');
            list(stages);
            para('The defaults suit most pools. Tuning starts to pay off once there is enough history for the reports to score (the tuning options appear on their own), and it is worth doing again when conditions change.');
            head('The quick way: press Tune');
            list([
                'Tune checks your saved settings against your FC history and gives ONE recommendation, or says your settings look good.',
                'Apply it. If it was a window change, press Tune once more (the window interacts with the weighting and taper), then stop.',
                'Then leave it alone for about 10 new FC readings and check the "Since you changed" line in Projection Accuracy.',
                'Do not tune in a loop: each pass is scored on the same history, so it makes the numbers look better without the real accuracy improving. Tune asks first (with a Cancel) if you run it again before about 10 new readings, unless you have changed the settings by hand since.'
            ]);
            para('The rest of this guide explains the two detailed reports behind Tune, which you can open from the Tune dialog.', { color: '#666' });
            head('1. Projection Accuracy: where you stand');
            list([
                'Readings scored: aim for 30 or more; with fewer, everything is rough.',
                'Mean absolute error: 1.2 to 1.6 ppm is normal: the test itself varies by about a ppm, and real consumption varies day to day with sun, rain and temperature.',
                'The "FC unchanged" baseline: the algorithm should beat it. If it is worse, the weighting and taper are the fix.',
                'By time since the previous reading: errors usually jump past about 5 days, which is why the taper exists and why testing more often helps.'
            ]);
            head('2. What-If Sweep: what would have done better');
            list([
                'A row is "better" or "worse" only when its 90% range excludes zero. "No clear difference" is a normal answer.',
                'Differences under about 0.1 ppm are too small to tell apart.',
                'Try the averaging window first (usually the biggest effect), then the projection weighting and taper. Leave daylight weighting, the chlorine credit and the anomaly tolerance alone unless clearly better.'
            ]);
            head('3. Apply one improvement at a time');
            para('Press Apply on a "better" row, or on the accuracy suggestion. It saves just those settings and takes effect the next time you Check or Refresh. Changing several at once hides which one helped.');
            head('4. Check it on new readings');
            list([
                'A setting chosen from a report is tuned on the same readings it scores, so its improvement is flattering. The honest test is readings after the change.',
                'The accuracy report adds a "Since you changed the tuning settings" line for that. Trust it from about 10 new readings.',
                'If it is no better than the "unchanged" baseline after about 15, use Reset Tuning to Defaults and Save.'
            ]);
            head('5. How often');
            para('After the first few weeks, then when conditions change: a new season, a cell swap, a change in how often you test, or a CYA change. Not after every reading, because re-tuning on ordinary variation makes things worse.');
            head('Keep the data healthy');
            para('The reports are only as good as the PoolMath log: log SWG % changes promptly, log liquid chlorine as "Liquid Chlorine", and correct a mistyped reading. The anomaly note and the SWG rating warning point at the usual problems.');
            para('Known limitation: only SWG output and liquid chlorine are credited. Other chlorine products (cal-hypo, dichlor, trichlor) are not recognized yet, so on a pool that doses them projections run low after each dose.', { color: '#666', fontSize: '.9em' });
            para('What they do not measure: whether the recommended % kept FC near your target. The target tracking table in Projection Accuracy covers that as your applies reach their deadlines.', { color: '#666', fontSize: '.9em' });
            para('Full guide: tools/autoswg-check/README.md in the njsPC fork, which also has a script that runs the same reports on any pool\'s PoolMath history.', { color: '#666', fontSize: '.9em' });
        },
        // How well the algorithm's projected FC has matched the readings actually measured, plus how
        // close FC was to each target at its deadline (GET /state/autoSwg/projectionAccuracy).
        _showProjectionAccuracy: function () {
            var self = this;
            $.getApiService('/state/autoSwg/projectionAccuracy', null, 'Checking projections against your FC readings...', function (h) {
                h = h || {};
                var rows = Array.isArray(h.rows) ? h.rows.slice() : [];
                var targets = Array.isArray(h.targets) ? h.targets.slice() : [];
                var sm = h.summary || {};
                var buttons = [];
                if (rows.length > 0) buttons.push({ text: 'Export CSV', icon: '<i class="fas fa-download"></i>', click: function () { self._exportProjectionAccuracy(rows); } });
                buttons.push({ text: 'Close', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } });
                var dlg = $.pic.modalDialog.createDialog('dlgAutoSwgAccuracy', { width: '860px', height: 'auto', title: 'Projection Accuracy', buttons: buttons });
                var wrap = $('<div></div>').css({ maxHeight: '28rem', overflowY: 'auto', padding: '.25rem' }).appendTo(dlg);
                var note = function (text, style) { return $('<div></div>').css($.extend({ fontSize: '.85em', color: '#666', padding: '0 0 .4rem .25rem' }, style || {})).text(text).appendTo(wrap); };
                var n2 = function (v, d) { return typeof v === 'number' ? v.toFixed(d) : '--'; };
                var signed = function (v) { return typeof v === 'number' ? (v > 0 ? '+' : '') + v.toFixed(2) : '--'; };
                if (rows.length === 0) {
                    note('Nothing to score yet: no pair of FC readings (between 0.1 and 14 days apart) with enough earlier data in the PoolMath page.', { fontStyle: 'italic', padding: '.5rem' });
                    return;
                }
note('Projected FC is what the algorithm said FC would be just before each reading, using only the data logged before it and today\'s settings; error is projected minus measured, so a positive error means it projected too high. '
                    + 'It uses the PoolMath share page plus the local archive of earlier history' + (h.history ? ' (' + h.history.readings + ' FC readings from ' + new Date(h.history.from).toLocaleDateString([], { dateStyle: 'medium' }) + (h.history.archived ? ', ' + h.history.archived + ' of them archived' : '; the archive has not been pulled yet, so this is the page alone') + ')' : '') + ', and it uses today\'s run window and sunrise/sunset for past days.');
                var sumBox = $('<div></div>').css({ padding: '.4rem .6rem', margin: '0 0 .6rem 0', background: 'rgba(128,128,128,.12)', borderRadius: '.25rem', fontSize: '.9em' }).appendTo(wrap);
                $('<div></div>').css({ fontWeight: 'bold' }).text(sm.count + ' readings scored' + (h.skipped ? ' (' + h.skipped + ' skipped: long gaps or too little earlier data)' : '')).appendTo(sumBox);
                $('<div></div>').text('Mean absolute error ' + n2(sm.meanAbsError, 2) + ' ppm  ·  RMSE ' + n2(sm.rmse, 2) + ' ppm  ·  bias ' + signed(sm.bias) + (typeof sm.biasSe === 'number' ? ' ± ' + n2(sm.biasSe, 2) : '') + ' ppm  ·  within 1 ppm: ' + (sm.within1 || 0) + '%  ·  within 2 ppm: ' + (sm.within2 || 0) + '%').appendTo(sumBox);
                if (typeof sm.coveragePct === 'number') {
                    $('<div></div>').css({ color: '#666' }).text('The range shown with each projection held ' + sm.coveragePct + '% of the time (it is meant to hold about 90%)  ·  FC measured more than 1 ppm below the projection: ' + (sm.fellShortPct || 0) + '%  ·  more than 1 ppm above: ' + (sm.ranHighPct || 0) + '%.  A bias smaller than about twice its "±" figure cannot be told from none.').appendTo(sumBox);
                }
                $('<div></div>').css({ color: '#666' }).text('By time since the previous reading: ' + (sm.byGap || []).filter(function (g) { return g.count > 0; }).map(function (g) { return g.label + ' ' + n2(g.meanAbsError, 2) + ' ppm (' + g.count + ')'; }).join('  ·  ')).appendTo(sumBox);
                // The no-model baseline gives the error some context, and the suggested projection weighting
                // can be applied straight from here.
                if (typeof sm.unchangedMae === 'number') {
                    $('<div></div>').css({ marginTop: '.3rem' }).text('Baseline "FC unchanged since the last reading": ' + n2(sm.unchangedMae, 2) + ' ppm. The algorithm is ' + Math.abs(Math.round(sm.skill * 100)) + '% ' + (sm.skill > 0 ? 'better' : 'worse') + ' than that.').appendTo(sumBox);
                }
                // How the current tuning is doing on readings it wasn't tuned on: only those since it last changed.
                if (sm.sinceChange) {
                    var sc = sm.sinceChange;
                    var scWhen = new Date(sc.since).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                    $('<div></div>').css({ marginTop: '.3rem', fontWeight: 'bold' }).text(sc.count === 0
                        ? 'Since you changed the tuning settings (' + scWhen + '): no new readings yet.'
                        : 'Since you changed the tuning settings (' + scWhen + '): ' + sc.count + ' new reading' + (sc.count === 1 ? '' : 's') + ', mean error ' + n2(sc.meanAbsError, 2) + ' ppm'
                            + (typeof sc.unchangedMae === 'number' ? ' (the "unchanged" baseline over the same readings: ' + n2(sc.unchangedMae, 2) + ' ppm)' : '') + '. These are readings the settings were not tuned on, so this is the honest measure.').appendTo(sumBox);
                }
                var wt = sm.weighting || {};
                if (wt.suggested && typeof wt.suggested.weight === 'number') {   // an object since the gap taper: { weight, taperStart, taperEnd }
                    var pctOf = function (v) { return Math.round(v * 100) + '%'; };
                    var wbox = $('<div></div>').css({ marginTop: '.3rem' }).appendTo(sumBox);
                    var describe = function (c) { return pctOf(c.weight) + (c.taperEnd > 0 ? ', tapering to zero from ' + c.taperStart + ' to ' + c.taperEnd + ' days' : ', no taper'); };
                    $('<div></div>').text('Projection weighting (how much of the modelled FC change since the last reading to trust): currently ' + describe(wt.current) + ' (' + n2(wt.maeCurrent, 2) + ' ppm). '
                        + 'On these readings the best would have been ' + describe(wt.best) + ' (' + n2(wt.maeBest, 2) + ' ppm); suggested ' + describe(wt.suggested) + ' (' + n2(wt.maeSuggested, 2) + ' ppm), pulled toward the middle because ' + sm.count + ' readings is a small sample.').appendTo(wbox);
                    var differs = Math.abs(wt.suggested.weight - wt.current.weight) >= 0.05 || wt.suggested.taperEnd !== wt.current.taperEnd || (wt.suggested.taperEnd > 0 && wt.suggested.taperStart !== wt.current.taperStart);
                    if (differs) {
                        var wmsg = $('<div></div>').css({ color: '#2a7', marginTop: '.2rem' }).hide().appendTo(wbox);
                        var wbtn = $('<div></div>').appendTo(wbox).actionButton({ text: 'Apply ' + describe(wt.suggested), icon: '<i class="fas fa-check"></i>' });
                        wbtn.on('click', function () {
                            if (wbtn.hasClass('disabled')) return;
                            wbtn[0].disabled(true);
                            var chosen = { projectionWeight: wt.suggested.weight, projectionTaperStartDays: wt.suggested.taperStart, projectionTaperEndDays: wt.suggested.taperEnd };
                            $.putApiService('/config/autoSwg', chosen, 'Saving the projection weighting...', function () {
                                self._applySettingsToForm(chosen);
                                wmsg.text('Saved ' + describe(wt.suggested) + '. It applies the next time you Check or Refresh, and the Settings form (under Tuning options) now shows it.').show();
                            });
                        });
                    }
                }
                var makeTable = function (cols, data, cell) {
                    var tbl = $('<table></table>').css({ width: '100%', borderCollapse: 'collapse', fontSize: '.85em', marginBottom: '.6rem' }).appendTo(wrap);
                    var head = $('<tr></tr>').appendTo($('<thead></thead>').appendTo(tbl));
                    cols.forEach(function (c) { $('<th></th>').text(c.text).css({ textAlign: c.align, padding: '.2rem .5rem', borderBottom: '1px solid #999', whiteSpace: 'nowrap' }).appendTo(head); });
                    var body = $('<tbody></tbody>').appendTo(tbl);
                    data.forEach(function (d) {
                        var tr = $('<tr></tr>').appendTo(body);
                        cell(d).forEach(function (v, i) { $('<td></td>').text(v).css({ textAlign: cols[i].align, padding: '.2rem .5rem', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' }).appendTo(tr); });
                    });
                };
                makeTable([{ text: 'Reading', align: 'left' }, { text: 'Days since previous', align: 'right' }, { text: 'Projected', align: 'right' }, { text: 'Measured', align: 'right' }, { text: 'Error', align: 'right' }, { text: 'Burn used (ppm/day)', align: 'right' }],
                    rows.slice().reverse(), function (r) { return [self._fmtDateTime(r.ts), n2(r.days, 1), n2(r.projected, 2) + ' ppm', n2(r.measured, 2) + ' ppm', signed(r.error), n2(r.avgConsumptionPpmPerDay, 2)]; });
                if (targets.length > 0) {
                    $('<div></div>').css({ fontWeight: 'bold', padding: '.2rem 0 .3rem .25rem' }).text('Targets: FC measured nearest each deadline').appendTo(wrap);
                    makeTable([{ text: 'Applied', align: 'left' }, { text: 'Target', align: 'right' }, { text: 'Deadline', align: 'left' }, { text: 'Nearest reading', align: 'left' }, { text: 'Difference', align: 'right' }],
                        targets.slice().reverse(), function (t) {
                            var nearest = !t.passed ? 'deadline not reached yet' : (t.nearest ? n2(t.nearest.value, 2) + ' ppm, ' + Math.abs(t.nearest.offsetHours) + ' h ' + (t.nearest.offsetHours < 0 ? 'before' : 'after') : 'no reading within 3 days');
                            return [self._fmtDateTime(t.appliedAt), n2(t.targetFc, 1) + ' ppm', self._fmtDateTime(t.targetDate), nearest, t.nearest ? signed(t.difference) + ' ppm' : ''];
                        });
                }
            });
        },
        // Compares the algorithm's accuracy under alternative settings against the current ones, on the
        // same readings (GET /state/autoSwg/projectionAccuracy/whatIf).
        _showWhatIf: function () {
            var self = this;
            $.getApiService('/state/autoSwg/projectionAccuracy/whatIf', null, 'Re-scoring projections under other settings (this takes a few seconds)...', function (h) {
                h = h || {};
                var variants = Array.isArray(h.variants) ? h.variants : [];
                var dlg = $.pic.modalDialog.createDialog('dlgAutoSwgWhatIf', { width: '860px', height: 'auto', title: 'What-If Sweep',
                    buttons: [{ text: 'Close', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }] });
                var wrap = $('<div></div>').css({ maxHeight: '28rem', overflowY: 'auto', padding: '.25rem' }).appendTo(dlg);
                var note = function (text, style) { return $('<div></div>').css($.extend({ fontSize: '.85em', color: '#666', padding: '0 0 .4rem .25rem' }, style || {})).text(text).appendTo(wrap); };
                if (variants.length === 0 || !h.count) {
                    note('Not enough scored readings to compare settings yet (' + (h.count || 0) + ' readings could be scored under every variant).', { fontStyle: 'italic', padding: '.5rem' });
                    return;
                }
                var n2 = function (v) { return typeof v === 'number' ? v.toFixed(2) : '--'; };
                var signed = function (v) { return typeof v === 'number' ? (v > 0 ? '+' : '') + v.toFixed(2) : '--'; };
                note('Each row re-scores the same ' + h.count + ' FC readings (' + (h.skipped || 0) + ' skipped) under different settings: the projected FC just before each reading, compared with what was measured. '
                    + '"Change" is how much the mean absolute error moves versus your current settings (negative is better) with a 90% range; a setting is called better or worse only when that range excludes zero. '
                    + 'Differences under about 0.1 ppm are too small to tell apart with this many readings. Nothing changes unless you press Apply on a row that is clearly better.');
                var appliedNote = $('<div></div>').css({ color: '#2a7', fontWeight: 'bold', padding: '0 0 .4rem .25rem' }).hide().appendTo(wrap);
                var tbl = $('<table></table>').css({ width: '100%', borderCollapse: 'collapse', fontSize: '.85em', marginBottom: '.6rem' }).appendTo(wrap);
                var cols = [{ t: 'Settings', a: 'left' }, { t: 'Mean abs error (ppm)', a: 'right' }, { t: 'RMSE', a: 'right' }, { t: 'Bias', a: 'right' }, { t: 'Change vs current (90% range)', a: 'right' }, { t: 'Verdict', a: 'left' }, { t: '', a: 'left' }];
                var head = $('<tr></tr>').appendTo($('<thead></thead>').appendTo(tbl));
                cols.forEach(function (c) { $('<th></th>').text(c.t).css({ textAlign: c.a, padding: '.2rem .5rem', borderBottom: '1px solid #999', whiteSpace: 'nowrap' }).appendTo(head); });
                var body = $('<tbody></tbody>').appendTo(tbl);
                variants.forEach(function (v) {
                    var tr = $('<tr></tr>').appendTo(body);
                    if (v.verdict === 'current') tr.css({ background: 'rgba(128,128,128,.12)', fontWeight: 'bold' });
                    var change = v.verdict === 'current' ? '' : signed(v.diff) + '  [' + signed(v.diffLow) + ', ' + signed(v.diffHigh) + ']';
                    var color = v.verdict === 'better' ? '#2a7' : (v.verdict === 'worse' ? '#c0392b' : '#666');
                    [[v.label, 'left'], [n2(v.meanAbsError), 'right'], [n2(v.rmse), 'right'], [signed(v.bias), 'right'], [change, 'right'], [v.verdict === 'current' ? 'current' : v.verdict, 'left']].forEach(function (cell, i) {
                        var td = $('<td></td>').text(cell[0]).css({ textAlign: cell[1], padding: '.2rem .5rem', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' }).appendTo(tr);
                        if (i === 5 && v.verdict !== 'current') td.css({ color: color, fontWeight: v.verdict === 'no clear difference' ? 'normal' : 'bold' });
                    });
                    // A clear improvement that maps to settings can be applied from here.
                    var applyTd = $('<td></td>').css({ padding: '.2rem .5rem', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' }).appendTo(tr);
                    if (v.verdict === 'better' && v.settings && Object.keys(v.settings).length > 0) {
                        var abtn = $('<div></div>').appendTo(applyTd).actionButton({ text: 'Apply', icon: '<i class="fas fa-check"></i>' })
                            .attr('title', 'Save these settings: ' + Object.keys(v.settings).map(function (k) { return k + ' = ' + v.settings[k]; }).join(', '));
                        abtn.on('click', function () {
                            if (abtn.hasClass('disabled')) return;
                            abtn[0].disabled(true);
                            $.putApiService('/config/autoSwg', v.settings, 'Saving the settings...', function () {
                                self._applySettingsToForm(v.settings);
                                appliedNote.text('Saved: ' + v.label + '. It applies the next time you Check or Refresh, and the Settings form (under Tuning options) now shows the values.').show();
                            });
                        });
                    }
                });
            });
        },
        // Downloads the scored readings as CSV, oldest first.
        _exportProjectionAccuracy: function (rows) {
            var d = new Date();
            var pad = function (n) { return (n < 10 ? '0' : '') + n; };
            var lines = ['Reading (ISO),Previous reading (ISO),Days between,Projected FC (ppm),Measured FC (ppm),Error (ppm),Burn used (ppm/day)'];
            rows.forEach(function (r) { lines.push([r.ts, r.previousTs, r.days, r.projected, r.measured, r.error, r.avgConsumptionPpmPerDay].join(',')); });
            var url = window.URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' }));
            var link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'autoSwgProjectionAccuracy-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.csv');
            document.body.appendChild(link);
            link.click();
            $(link).remove();
            setTimeout(function () { window.URL.revokeObjectURL(url); }, 1000);
        },
        // Minutes after local midnight of an ISO time in `tz` (an IANA zone name) when given and valid, otherwise in this browser's time zone; NaN if unreadable.
        _minutesOfDay: function (iso, tz) {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return NaN;
            if (tz) {
                try {
                    var parts = {};
                    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(d).forEach(function (p) { parts[p.type] = p.value; });
                    return (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10);
                } catch (err) { /* unknown zone -- fall through to browser time */ }
            }
            return d.getHours() * 60 + d.getMinutes();
        },
        // Notes on the SWG % rows of the history (newest first, as shown): an array parallel to `entries` with, for each SWG row,
        // `unchanged` (an automatic check that repeated the % already in force) and `starts` (a change applied outside the SWG's run window
        // only takes effect when the window opens: "06:40", or "06:40 tomorrow" when it was applied after the window closed).
        _historySwgNotes: function (entries) {
            var self = this;
            var notes = entries.map(function () { return {}; });
            var idx = [];
            entries.forEach(function (e, i) { if (e.type === 'SWG') idx.push(i); });
            var toMin = function (t) { var m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : NaN; };
            idx.forEach(function (i, k) {
                var e = entries[i], rec = e.record || {};
                // The % in force before this row: the local record says it, otherwise the next older SWG row.
                var prev = typeof rec.previousPct === 'number' ? rec.previousPct : (k + 1 < idx.length ? entries[idx[k + 1]].pct : undefined);
                if (typeof prev === 'number' && typeof e.pct === 'number' && prev === e.pct && e.source !== 'local-manual') notes[i].unchanged = true;
                var inp = rec.inputs || {};
                var a = toMin(inp.swgStartTime), b = toMin(inp.swgStopTime);
                if (typeof e.pct === 'number' && e.pct > 0 && !isNaN(a) && !isNaN(b) && b > a) {
                    var now = self._minutesOfDay(e.ts, inp.timezone);
                    if (!isNaN(now) && (now < a || now >= b)) notes[i].starts = inp.swgStartTime + (now >= b ? ' tomorrow' : '');
                }
            });
            return notes;
        },
        // Fills the "Ran" column: how long the cell was actually making chlorine while each SWG % was in force (until the next SWG % row, or now), from the
        // hourly output log (the share of the hour's samples with an output above 0, weighted by how much of the hour falls in the interval). Rows from before
        // the log began stay blank. `cells` is [{ entry, td }] for the SWG rows.
        _fillRanHours: function (entries, cells) {
            var swg = entries.filter(function (e) { return e.type === 'SWG'; });
            var locals = swg.filter(function (e) { return e.record; });
            if (!cells.length || !locals.length) return;
            var oldest = new Date(locals[locals.length - 1].ts).getTime();
            var days = Math.min(1461, Math.max(2, Math.ceil((Date.now() - oldest) / 86400000) + 2));
            $.getApiService('/state/autoSwg/output?days=' + days, null, function (r) {
                var hours = r && Array.isArray(r.hours) ? r.hours : [];
                if (!hours.length) return;
                var lines = hours.map(function (h) { return { t: new Date(h.t).getTime(), frac: h.n > 0 ? h.on / h.n : 0 }; }).filter(function (h) { return !isNaN(h.t); });
                if (!lines.length) return;
                var firstLog = lines.reduce(function (m, h) { return Math.min(m, h.t); }, Infinity);
                // SWG rows oldest first, so a row ends where the next newer one begins.
                var asc = swg.slice().sort(function (a, b) { return new Date(a.ts) - new Date(b.ts); });
                var endOf = {};
                asc.forEach(function (e, k) { endOf[e.ts + '|' + k] = k + 1 < asc.length ? new Date(asc[k + 1].ts).getTime() : Date.now(); });
                cells.forEach(function (c) {
                    var k = asc.indexOf(c.entry);
                    if (k < 0) return;
                    var from = new Date(c.entry.ts).getTime(), to = endOf[c.entry.ts + '|' + k];
                    if (from < firstLog) return;
                    var total = 0;
                    lines.forEach(function (h) {
                        var overlap = Math.min(to, h.t + 3600000) - Math.max(from, h.t);
                        if (overlap > 0) total += (overlap / 3600000) * h.frac;
                    });
                    c.td.text((Math.round(total * 10) / 10) + ' h' + (k + 1 === asc.length ? ' so far' : ''));
                });
            });
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
                var swgNotes = self._historySwgNotes(entries);
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
                var countOf = function (t) { return entries.filter(function (e) { return e.type === t; }).length; };
                var note = entries.length + ' entries (' + countOf('SWG') + ' SWG %, ' + countOf('FC') + ' FC, ' + countOf('CL') + ' liquid chlorine, ' + countOf('CYA') + ' CYA changes, ' + countOf('SETTINGS') + ' settings changes), newest first. Times are shown in this browser\'s time zone. '
                    + 'SWG % entries follow the same rule as the calculation: a local entry is used in place of any PoolMath entry within an hour of it'
                    + (h.poolMathSwgEntriesReplaced ? ' (' + h.poolMathSwgEntriesReplaced + ' PoolMath ' + (h.poolMathSwgEntriesReplaced === 1 ? 'entry was' : 'entries were') + ' left out for that reason)' : '')
                    + '. FC readings and SWG % entries from PoolMath are the ones on its share page plus an archive of up to 48 months of earlier ones, pulled once per share code '
                    + '(the page refreshes the archive for the period it covers). CYA rows show only readings where the value changed, and liquid chlorine rows show the ppm FC each addition adds to your pool volume. '
                    + 'Changes to the SWG Assist settings (target, run periods to target, tuning ...) are logged locally too, so results can be lined up with the settings in force. '
                    + 'The local SWG % log is kept for 48 months. '
                    + 'Grey SWG % rows are automatic checks that repeated the % already in force. A change applied outside the SWG\'s run window only takes effect when the window opens, which the row says. '
                    + '"Ran" is how long the cell was actually making chlorine while that % was in force (until the next SWG % row), from the chlorinator output log; it is blank for rows from before the log began.';
                $('<div></div>').css({ fontSize: '.85em', color: '#666', padding: '0 0 .4rem .25rem' }).text(note).appendTo(wrap);
                var hideLabel = $('<label></label>').css({ fontSize: '.85em', display: 'inline-block', padding: '0 0 .4rem .25rem', cursor: 'pointer' }).appendTo(wrap);
                var hideChk = $('<input type="checkbox" />').css({ marginRight: '.4rem', verticalAlign: 'middle' }).appendTo(hideLabel);
                $('<span></span>').text('Hide automatic checks that repeated the previous %').appendTo(hideLabel);
                var tbl = $('<table></table>').css({ width: '100%', borderCollapse: 'collapse', fontSize: '.85em' }).appendTo(wrap);
                var cols = [
                    { text: 'Time', align: 'left' }, { text: 'Type', align: 'left' }, { text: 'Value', align: 'right' }, { text: 'Source', align: 'left' },
                    { text: 'Ran', align: 'right' }, { text: 'ppm/day', align: 'right' }, { text: 'Previous %', align: 'right' }, { text: 'Recommended %', align: 'right' }, { text: 'Target date', align: 'left' }
                ];
                var head = $('<tr></tr>').appendTo($('<thead></thead>').appendTo(tbl));
                cols.forEach(function (c) {
                    var th = $('<th></th>').text(c.text).css({ textAlign: c.align, padding: '.2rem .5rem', borderBottom: '1px solid #999', whiteSpace: 'nowrap' }).appendTo(head);
                    if (c.text === 'Ran') th.attr('title', 'How long the cell was actually making chlorine while this SWG % was in force (until the next SWG % row), from the chlorinator output log.');
                });
                hideChk.on('change', function () { $('tr.autoSwgUnchanged', tbl).toggle(!hideChk.is(':checked')); });
                var body = $('<tbody></tbody>').appendTo(tbl);
                var blank = function (v) { return typeof v === 'undefined' || v === null ? '' : v; };
                var ranCells = [];
                entries.forEach(function (e, i) {
                    var rec = e.record || {};
                    var note = swgNotes[i] || {};
                    var row = $('<tr></tr>').appendTo(body);
                    if (note.unchanged) row.addClass('autoSwgUnchanged').css({ opacity: 0.55 });
                    var valueText = self._historyValueLabel(e) + (note.unchanged ? ' (unchanged)' : '') + (note.starts ? ' (starts ' + note.starts + ')' : '');
                    var tds = [];
                    [
                        [self._fmtDateTime(e.ts), 'left'],
                        [self._historyTypeLabel(e), 'left'],
                        [valueText, e.type === 'SETTINGS' ? 'left' : 'right', e.type === 'SETTINGS'],
                        [self._historySourceLabel(e), 'left'],
                        ['', 'right'],
                        [e.type === 'SWG' ? blank(e.ppmPerDay) : '', 'right'],
                        [blank(rec.previousPct), 'right'],
                        [blank(rec.recommendedPct), 'right'],
                        [self._historyTargetLabel(e), 'left']
                    ].forEach(function (cell) {
                        tds.push($('<td></td>').text(cell[0]).css({ textAlign: cell[1], padding: '.2rem .5rem', borderBottom: '1px solid #ddd', whiteSpace: cell[2] ? 'normal' : 'nowrap', maxWidth: cell[2] ? '26rem' : '' }).appendTo(row));
                    });
                    if (e.type === 'SWG') ranCells.push({ entry: e, td: tds[4] });
                });
                self._fillRanHours(entries, ranCells);
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
                // The share code and pool name are private (records saved before they were left out still hold them).
                text = JSON.stringify(ordered, function (key, value) { return key === 'shareCode' || key === 'poolName' ? undefined : value; }, 2);
                type = 'application/json';
            }
            else {
                var out = function (e) { return (e.record || {}).outputs || {}; };
                var inp = function (e) { return (e.record || {}).inputs || {}; };
                var cols = [
                    ['Time (ISO)', function (e) { return e.ts; }],
                    ['Type', function (e) { return e.type; }],
                    ['Source', function (e) { return self._historySourceLabel(e); }],
                    ['Settings changed', function (e) { return e.type === 'SETTINGS' ? self._settingsChangeText(e) : undefined; }],
                    ['SWG %', function (e) { return e.type === 'SWG' ? e.pct : undefined; }],
                    ['FC (ppm)', function (e) { return e.type === 'FC' ? e.value : undefined; }],
                    ['CYA (ppm)', function (e) { return e.type === 'CYA' ? e.value : undefined; }],
                    ['Previous CYA (ppm)', function (e) { return e.type === 'CYA' ? e.previous : undefined; }],
                    ['Liquid chlorine strength (%)', function (e) { return e.type === 'CL' ? e.percent : undefined; }],
                    ['Liquid chlorine volume (mL)', function (e) { return e.type === 'CL' ? e.ml : undefined; }],
                    ['Liquid chlorine adds (ppm FC)', function (e) { return e.type === 'CL' ? e.ppm : undefined; }],
                    ['ppm/day', function (e) { return e.ppmPerDay; }],
                    ['Run hours', function (e) { return e.hrs; }],
                    ['Previous %', function (e) { return (e.record || {}).previousPct; }],
                    ['Recommended %', function (e) { return (e.record || {}).recommendedPct; }],
                    ['Target outcome', function (e) { return (e.record || {}).targetOutcome; }],
                    ['Target date (ISO)', function (e) { return (e.record || {}).targetDate; }],
                    ['Previous target date (ISO)', function (e) { return (e.record || {}).previousTargetDate; }],
                    ['Target stray (ppm)', function (e) { return (e.record || {}).targetStrayPpm; }],
                    ['New target date threshold (ppm)', function (e) { return (e.record || {}).targetThresholdPpm; }],
                    ['Run window change', function (e) { var c = (e.record || {}).runWindowChange; return c ? c.from + ' -> ' + c.to : undefined; }],
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
                    ['Target period (days on the clock)', function (e) { return inp(e).targetDays; }]
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
        },
        // ---------------------------------------------------------------- SWG Assist Model Bench
        // The Model Bench (njsPC controller/AutoSwgBench.ts) runs several FC projection models beside SWG Assist and scores each one against every FC
        // test. It never changes the SWG %. It has its own accordion, outside the settings panel (self._pnl), so none of its fields join the SWG Assist
        // settings form, its dirty check or its save. Routes (code names keep autoSwg; the text says SWG Assist):
        //   GET  /state/autoSwg/bench                    the scoreboard: per variant version, live rows and replay rows apart, input coverage, the CYA block
        //   GET  /state/autoSwg/bench/scores?days=       every score row (&format=csv downloads them)
        //   GET  /state/autoSwg/bench/cya?days=          the CYA path, its tests and their status, the stabilizer additions, the rain k, the advice
        //   GET/PUT /config/autoSwg/bench                enabled, the pool geometry, the CYA settings, the variants (a changed definition makes a new version)
        //   POST /state/autoSwg/bench/replay?since=      works the scores out over the past (rows flagged replay, kept apart from live rows)
        // The user judges models by time in the FC range and smoothness; the projection band is the supporting measure, so band widths come first.
        _buildBench: function () {
            var self = this, el = self.element;
            var acc = $('<div></div>').appendTo(el).accordian({ columns: [{ binding: 'title', glyph: 'fas fa-flask', style: { width: '20rem' } }] });
            acc[0].columns()[0].elText().text('SWG Assist Model Bench');
            var pnl = acc.find('div.picAccordian-contents');
            self._benchAcc = acc;
            $('<div></div>').appendTo(pnl).css({ padding: '.25rem .25rem .6rem .25rem', fontStyle: 'italic' })
                .text('Runs several FC projection models beside SWG Assist and scores each one against every FC test. It never changes the SWG %. '
                    + 'The band is the 90% miss range: the next test reads within this many ppm of the projection 9 times in 10, so a narrower band is better. '
                    + 'Live rows were scored as each test arrived and decide; replay rows were worked out afterwards over the past and are only a quick early read.');
            self._elBenchStatus = $('<div></div>').appendTo(pnl).css({ fontSize: '.85em', color: '#666', margin: '.15rem 0' });
            self._elBenchCoverage = $('<div></div>').appendTo(pnl).css({ fontSize: '.85em', color: '#666', margin: '.15rem 0' });
            self._elBenchCya = $('<div></div>').appendTo(pnl).css({ fontSize: '.85em', color: '#666', margin: '.15rem 0' });
            self._elBenchAdvice = $('<div></div>').appendTo(pnl).css({ color: '#0b3d5c', background: '#d6ecfa', padding: '.4rem .6rem', borderRadius: '.25rem', margin: '.3rem 0' }).hide();
            var pick = function (label, items, def) {
                var line = $('<div></div>').appendTo(pnl).css({ margin: '.6rem 0 .2rem 0' });
                $('<span></span>').text(label).css({ fontWeight: 'bold', marginRight: '.5rem' }).appendTo(line);
                var sel = $('<select></select>').appendTo(line).css({ fontSize: '.9em' });
                items.forEach(function (it) { $('<option></option>').attr('value', it[0]).text(it[1]).appendTo(sel); });
                sel.val(def);
                sel.on('change', function () { self._renderBenchTables(); });
                return sel;
            };
            self._selBenchLive = pick('Live rows', [['all', 'All time, next test'], ['last90', 'Last 90 days, next test'], ['skip', 'Skip one test (the weekly-testing case)'], ['forecast', 'Forecast (only what was known at the check)']], 'all');
            self._elBenchLive = $('<div></div>').appendTo(pnl).css({ overflowX: 'auto' });
            self._selBenchReplay = pick('Replay rows', [['next', 'Next test'], ['skip', 'Skip one test (the weekly-testing case)'], ['forecast', 'Forecast (only what was known at the check)']], 'next');
            self._elBenchReplay = $('<div></div>').appendTo(pnl).css({ overflowX: 'auto' });
            $('<div></div>').appendTo(pnl).css({ fontSize: '.8em', color: '#888', margin: '.2rem 0 .4rem .25rem' })
                .text('Band: the 90% miss range (±ppm). 5% to 95%: test minus projection, so a lopsided range shows a skew. vs live: the mean difference in absolute miss against the SWG Assist projection on the same tests (negative: this model misses less), ± its standard error, and how often it came out better in resampling. '
                    + 'Own band: the band this model would show from its last 30 misses. Revised: the same scores redone with the CYA path corrected by a later CYA test, for tuning only; the verdict stays with the scores as made. Click a row for its last misses and its band by gap.');
            var btnPnl = $('<div class="picBtnPanel btn-panel"></div>').appendTo(pnl);
            $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Refresh', icon: '<i class="fas fa-rotate"></i>' })
                .on('click', function () { self._loadBench(); });
            $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Projections Chart', icon: '<i class="fas fa-chart-line"></i>' })
                .attr('title', 'Each model\'s projected FC against the FC tests.')
                .on('click', function () { self._showBenchChart(); });
            $('<div></div>').appendTo(btnPnl).actionButton({ text: 'CYA Path', icon: '<i class="fas fa-chart-area"></i>' })
                .attr('title', 'The CYA the bench assumes between tests: the path, the tests and how it took them, the stabilizer additions, the rain dilution.')
                .on('click', function () { self._showBenchCya(); });
            $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Models and Settings', icon: '<i class="fas fa-sliders"></i>' })
                .attr('title', 'Copy, edit or retire a model, and the pool geometry and CYA settings. An edit makes a new version of the model, scored apart from the old one.')
                .on('click', function () { self._showBenchSettings(); });
            $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Replay', icon: '<i class="fas fa-backward"></i>' })
                .attr('title', 'Works the scores out over the past, as if the bench had been running. Replay rows are kept apart from live rows.')
                .on('click', function () { self._showBenchReplay(); });
            $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Download CSV', icon: '<i class="fas fa-download"></i>' })
                .attr('title', 'Every score row the bench keeps (up to 18 months), live and replay, as CSV.')
                .on('click', function () { self._downloadBenchCsv(); });
            // Loads each time it is opened (the accordion's own click handler runs first and sets data-expanded).
            acc.on('click keydown', 'div.picAccordian-title:first', function (evt) {
                if (evt.type === 'keydown' && evt.key !== 'Enter' && evt.key !== ' ' && evt.key !== 'Spacebar') return;
                setTimeout(function () { if (makeBool(acc.attr('data-expanded'))) self._loadBench(); }, 0);
            });
        },
        // An API URL the way $.getApiService builds it (through the proxy when the page uses one).
        _benchUrl: function (path) {
            var useProxy = makeBool($('body').attr('data-apiproxy'));
            var u = useProxy ? '/njsPC' + path : $('body').attr('data-apiserviceurl') + path;
            if (u.startsWith('/')) u = u.substring(1);
            return u;
        },
        // A GET with no error popup: for a route an older njsPC may not have (the CYA path came in step 2 of the bench).
        _benchGet: function (path, ok, fail) {
            var self = this;
            return jQuery.ajax({ url: self._benchUrl(path), type: 'GET', dataType: 'json', success: function (d) { ok(d); }, error: function (xhr) { if (fail) fail(xhr && xhr.status); } });
        },
        _benchFmt: {
            n2: function (v) { return typeof v === 'number' && isFinite(v) ? v.toFixed(2) : '--'; },
            signed: function (v) { return typeof v === 'number' && isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(2) : '--'; },
            band: function (v) { return typeof v === 'number' && isFinite(v) ? '±' + v.toFixed(2) : '--'; },
            pct: function (v) { return typeof v === 'number' && isFinite(v) ? Math.round(v * 100) + '%' : '--'; },
            when: function (t) { if (!t) return '--'; var d = new Date(t); return isNaN(d.getTime()) ? '--' : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }); },
            day: function (t) { if (!t) return '--'; var d = new Date(t); return isNaN(d.getTime()) ? '--' : d.toLocaleDateString([], { dateStyle: 'medium' }); }
        },
        _loadBench: function () {
            var self = this, f = self._benchFmt;
            self._elBenchStatus.text('Loading the scoreboard...');
            $.getApiService('/state/autoSwg/bench', null, function (b) {
                self._bench = b || {};
                b = self._bench;
                var parts = [b.enabled === false ? 'The bench is off (Models and Settings turns it on).' : 'The bench is on.'];
                parts.push('Last fit at a check: ' + (b.lastCheck ? f.when(b.lastCheck) : 'none since njsPC started') + '.');
                parts.push('Last scoring: ' + (b.lastScored ? f.when(b.lastScored) : 'none since njsPC started') + '.');
                var r = b.replay || {};
                if (r.running) parts.push('Replay running: ' + (r.done || 0) + ' of ' + (r.total || '?') + '.');
                else if (r.finishedAt) parts.push('Last replay finished ' + f.when(r.finishedAt) + (r.since ? ' (from ' + f.day(r.since) + ')' : '') + (r.error ? ' with an error: ' + r.error : '') + '.');
                self._elBenchStatus.text(parts.join('  '));
                if (b.lastError) $('<span></span>').css({ color: '#c0392b', marginLeft: '.4rem' }).text('Last error: ' + b.lastError).appendTo(self._elBenchStatus);
                var c = b.coverage || {};
                if (c.error) self._elBenchCoverage.text('Input coverage could not be worked out: ' + c.error);
                else if (typeof c.hours === 'number') {
                    var missing = [];
                    if (c.weatherSource === false) missing.push('weather');
                    if (c.waterTempSource === false) missing.push('water temperature');
                    if (c.pumpSource === false) missing.push('pump');
                    self._elBenchCoverage.text('Inputs over the last 14 days (' + c.hours + ' h): sun ' + f.pct(c.sun) + ', SWG output from its log ' + f.pct(c.genLog) + ' (any source ' + f.pct(c.genAny) + '), water temperature ' + f.pct(c.temp) + ', pump ' + f.pct(c.pump) + '.'
                        + (missing.length ? ' Not connected: ' + missing.join(', ') + '; the models that need them report the input as missing.' : '')
                        + (c.place === false ? ' No location is set, so the sun cannot be worked out.' : ''));
                }
                else self._elBenchCoverage.text('');
                self._renderBenchCyaLine(b.cya);
                self._renderBenchTables();
                // While a replay runs, follow it (only while the bench is open on the page).
                clearTimeout(self._benchPoll);
                if (r.running) self._benchPoll = setTimeout(function () {
                    if (self.element.closest('body').length && makeBool(self._benchAcc.attr('data-expanded'))) self._loadBench();
                }, 5000);
            });
        },
        _renderBenchCyaLine: function (cya) {
            var self = this, f = self._benchFmt;
            self._elBenchAdvice.hide();
            if (!cya) { self._elBenchCya.text('CYA path: this njsPC holds CYA at the last test (the full CYA path comes with a newer bench).'); return; }
            if (cya.error) { self._elBenchCya.text('CYA path: ' + cya.error); return; }
            var src = { none: 'no dilution', rain: 'rain dilution', salt: 'salt dilution', both: 'rain and salt dilution' }[cya.source] || cya.source;
            self._elBenchCya.text('CYA on the path now: ' + (typeof cya.now === 'number' ? cya.now.toFixed(0) + ' ppm' : '--')
                + (cya.anchor ? ' (last test ' + cya.anchor.ppm + ' ppm on ' + f.day(cya.anchor.t) + ')' : '') + ', ' + src
                + (typeof cya.rainK === 'number' ? ', rain k ' + (cya.rainK * 100).toFixed(2) + '% of the water per inch' + (typeof cya.defaultK === 'number' ? ' (default ' + (cya.defaultK * 100).toFixed(2) + '%' + (cya.pairs ? ', ' + cya.pairs + ' test pair' + (cya.pairs === 1 ? '' : 's') : '') + ')' : '') : '') + '.');
            var a = cya.advice;
            if (a && a.due && a.reason) self._elBenchAdvice.text('ℹ CYA test advised: ' + a.reason).show();
        },
        // The scoreboard tables: live rows (the view picked) and replay rows, band widths first.
        _renderBenchTables: function () {
            var self = this, f = self._benchFmt;
            var b = self._bench || {};
            var vs = Array.isArray(b.variants) ? b.variants : [];
            var liveView = self._selBenchLive.val(), replayView = self._selBenchReplay.val();
            var pickBlock = function (v, replay) {
                if (replay) return v.replay ? v.replay[replayView] : undefined;
                return v.live ? v.live[liveView] : undefined;
            };
            var gap47 = function (blk) { var g = blk && Array.isArray(blk.byGap) ? blk.byGap.find(function (x) { return x.label === '4-7 d'; }) : undefined; return g && g.n ? f.band(g.halfWidth90) + ' (' + g.n + ')' : '--'; };
            var build = function (target, replay) {
                target.empty();
                var rows = vs.map(function (v) { return { v: v, blk: pickBlock(v, replay) || { n: 0 } }; })
                    .filter(function (x) { return !(replay && x.v.kind === 'live'); });
                // the live projection first, then the narrowest band; models with no scores yet, then retired ones, last
                rows.sort(function (a, c) {
                    var ka = a.v.retired ? 3 : a.v.kind === 'live' ? 0 : a.blk.n > 0 ? 1 : 2, kc = c.v.retired ? 3 : c.v.kind === 'live' ? 0 : c.blk.n > 0 ? 1 : 2;
                    if (ka !== kc) return ka - kc;
                    if (ka === 1) return (a.blk.halfWidth90 || 0) - (c.blk.halfWidth90 || 0);
                    return 0;
                });
                if (!rows.some(function (x) { return x.blk.n > 0; })) {
                    $('<div></div>').appendTo(target).css({ fontSize: '.85em', fontStyle: 'italic', color: '#888', padding: '.2rem .25rem' })
                        .text(replay ? 'No replay rows for this view. Replay works the scores out over the past.' : 'No live scores for this view yet: each model is scored when a new FC test arrives, with the fit it froze at the last check before it.');
                    if (replay) return;
                }
                var cols = [['Model', 'left'], ['Band', 'right'], ['5% to 95%', 'right'], ['n', 'right'], ['MAE', 'right'], ['Bias', 'right'], ['vs live', 'right'], ['P(better)', 'right'], ['4-7 d band', 'right'], ['Own band', 'right']];
                if (!replay) cols.push(['Revised (tuning only)', 'right']);
                var tbl = $('<table></table>').css({ width: '100%', borderCollapse: 'collapse', fontSize: '.85em', marginBottom: '.3rem' }).appendTo(target);
                var head = $('<tr></tr>').appendTo($('<thead></thead>').appendTo(tbl));
                cols.forEach(function (c) { $('<th></th>').text(c[0]).css({ textAlign: c[1], padding: '.2rem .5rem', borderBottom: '1px solid #999', whiteSpace: 'nowrap' }).appendTo(head); });
                var body = $('<tbody></tbody>').appendTo(tbl);
                rows.forEach(function (x) {
                    var v = x.v, blk = x.blk, pd = blk.vsLive || {};
                    var isLive = v.kind === 'live';
                    var name = (v.label || v.id) + '  (' + v.id + ' v' + v.version + (v.retired ? ', retired' : '') + ')';
                    var cells = [name, f.band(blk.halfWidth90), blk.n ? f.signed(blk.p5) + ' to ' + f.signed(blk.p95) : '--', String(blk.n || 0), f.n2(blk.mae), f.signed(blk.bias),
                        isLive ? '' : (typeof pd.meanDiff === 'number' ? f.signed(pd.meanDiff) + ' ± ' + f.n2(pd.se) + ' (' + pd.n + ')' : '--'),
                        isLive ? '' : (typeof pd.pBetter === 'number' ? Math.round(pd.pBetter * 100) + '%' : '--'),
                        gap47(blk), replay ? '--' : f.band(v.ownBand)];
                    if (!replay) {
                        var rv = v.revised;
                        cells.push(rv && rv.n ? f.band(rv.halfWidth90) + ' (as scored ' + f.band(rv.asScored && rv.asScored.halfWidth90) + ', ' + rv.n + ')' : '--');
                    }
                    var tr = $('<tr></tr>').appendTo(body).css({ cursor: 'pointer' }).attr('title', 'Click for the last misses and the band by gap');
                    if (isLive) tr.css({ background: 'rgba(128,128,128,.12)', fontWeight: 'bold' });
                    if (v.retired || !blk.n) tr.css({ color: '#999' });
                    cells.forEach(function (val, i) {
                        var td = $('<td></td>').css({ textAlign: cols[i][1], padding: '.2rem .5rem', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' }).appendTo(tr);
                        // the model: its label, and its id and version in small type under it (keeps the column narrow)
                        if (i === 0) td.css({ whiteSpace: 'normal', minWidth: '12rem' }).append($('<div></div>').text(v.label || v.id))
                            .append($('<div></div>').css({ fontSize: '.8em', fontWeight: 'normal', color: '#999' }).text(v.id + ' v' + v.version + (v.retired ? ', retired' : '')));
                        else td.text(val);
                    });
                    if (!isLive && pd.n >= 2 && typeof pd.pBetter === 'number') tr.children().eq(7).css({ color: pd.pBetter >= 0.9 ? '#2a7' : pd.pBetter <= 0.1 ? '#c0392b' : '' });
                    tr.on('click', function () { self._showBenchVariant(v, blk, replay); });
                });
            };
            build(self._elBenchLive, false);
            build(self._elBenchReplay, true);
        },
        // One model's block: its band by gap length and its last ten live misses.
        _showBenchVariant: function (v, blk, replay) {
            var self = this, f = self._benchFmt;
            var dlg = $.pic.modalDialog.createDialog('dlgAutoSwgBenchVariant', { width: '640px', height: 'auto', title: (v.label || v.id) + ' (v' + v.version + ')',
                buttons: [{ text: 'Close', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }] });
            var wrap = $('<div></div>').css({ maxHeight: '28rem', overflowY: 'auto', padding: '.25rem' }).appendTo(dlg);
            $('<div></div>').appendTo(wrap).css({ fontSize: '.85em', color: '#666', paddingBottom: '.4rem' }).text(self._benchDescribe(v));
            var table = function (title, cols, data) {
                $('<div></div>').appendTo(wrap).css({ fontWeight: 'bold', margin: '.3rem 0' }).text(title);
                var tbl = $('<table></table>').css({ width: '100%', borderCollapse: 'collapse', fontSize: '.85em', marginBottom: '.5rem' }).appendTo(wrap);
                var head = $('<tr></tr>').appendTo($('<thead></thead>').appendTo(tbl));
                cols.forEach(function (c) { $('<th></th>').text(c[0]).css({ textAlign: c[1], padding: '.2rem .5rem', borderBottom: '1px solid #999', whiteSpace: 'nowrap' }).appendTo(head); });
                var body = $('<tbody></tbody>').appendTo(tbl);
                data.forEach(function (row) {
                    var tr = $('<tr></tr>').appendTo(body);
                    row.forEach(function (val, i) { $('<td></td>').text(val).css({ textAlign: cols[i][1], padding: '.2rem .5rem', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' }).appendTo(tr); });
                });
            };
            table('Band by time since the reading before (' + (replay ? 'replay rows' : 'live rows') + ', the view picked)', [['Gap', 'left'], ['n', 'right'], ['Band', 'right'], ['MAE', 'right']],
                ((blk && blk.byGap) || []).map(function (g) { return [g.label, String(g.n), f.band(g.halfWidth90), f.n2(g.mae)]; }));
            var misses = Array.isArray(v.lastMisses) ? v.lastMisses.slice().reverse() : [];
            if (misses.length) table('Last live misses at the next test (test minus projection)', [['Test', 'left'], ['Days', 'right'], ['Projected', 'right'], ['Tested', 'right'], ['Miss', 'right']],
                misses.map(function (m) { return [f.when(m.t), f.n2(m.days), f.n2(m.proj), f.n2(m.test), f.signed(m.miss)]; }));
            else $('<div></div>').appendTo(wrap).css({ fontSize: '.85em', fontStyle: 'italic', color: '#888' }).text('No live misses yet.');
        },
        // A model's definition in words.
        _benchDescribe: function (v) {
            if (v.kind === 'live') return 'SWG Assist\'s own projection, as it stood just before each test.';
            if (v.kind === 'plain') return 'A flat burn: the average of the last ' + (v.windowDays || 14) + ' days of FC intervals.';
            var sun = { none: 'no sun term', station: 'station sun', pool: 'pool sun (station sun on the water, after shade and screen)', poolHourHigh: 'pool sun from the hour highs', clearPool: 'clear-sky pool sun times the recent clearness' }[v.sun] || v.sun;
            return 'Burn = a x ' + (v.fcTerm === 'fc' ? 'FC' : 'FC/CYA') + ' x ' + sun + (v.temp ? ' x a water-temperature factor' : '') + ' + b' + (v.rainWash ? ' + a rain wash-in term' : '')
                + '; fitted on the last ' + (v.fitDays || 30) + ' days (ridge ' + (typeof v.ridge === 'number' ? v.ridge : 0.5) + '); CYA ' + (v.cya === 'path' ? 'on the path between tests' : 'held at the last test')
                + '; FC inside the gap ' + (v.fcPath === 'held' ? 'held at the start reading' : 'following the model') + '.';
        },
        _benchPalette: ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#393b79', '#ad494a', '#637939', '#843c39'],
        _benchEsc: function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
        // Each model's projections against the FC tests (GET /state/autoSwg/bench/scores?days=), with the misses below.
        _showBenchChart: function () {
            var self = this, f = self._benchFmt;
            var dlg = $.pic.modalDialog.createDialog('dlgAutoSwgBenchChart', { width: Math.min(980, Math.max(320, (window.innerWidth || 980) - 24)) + 'px', height: 'auto', title: 'Model Bench: Projections Against the FC Tests',
                buttons: [{ text: 'Close', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }] });
            var wrap = $('<div></div>').css({ maxHeight: '36rem', overflowY: 'auto', padding: '.25rem' }).appendTo(dlg);
            var bar = $('<div></div>').appendTo(wrap).css({ display: 'flex', flexWrap: 'wrap', gap: '.8rem', alignItems: 'center', fontSize: '.9em', marginBottom: '.3rem' });
            var sel = function (label, items, def) {
                var s = $('<span></span>').appendTo(bar);
                $('<span></span>').text(label + ' ').appendTo(s);
                var x = $('<select></select>').appendTo(s);
                items.forEach(function (it) { $('<option></option>').attr('value', it[0]).text(it[1]).appendTo(x); });
                x.val(def);
                return x;
            };
            var selDays = sel('Last', [['30', '30 days'], ['60', '60 days'], ['120', '120 days'], ['365', '365 days'], ['548', '18 months']], String(self._benchChartDays || 60));
            var selRows = sel('Rows', [['live', 'Live'], ['replay', 'Replay']], self._benchChartRows || 'live');
            var selHorizon = sel('Horizon', [['next', 'Next test'], ['skip', 'Skip one test']], 'next');
            var selMode = sel('Mode', [['nowcast', 'Nowcast (the weather that happened)'], ['forecast', 'Forecast (what was known at the check)']], 'nowcast');
            var chart = $('<div></div>').appendTo(wrap);
            var legend = $('<div></div>').appendTo(wrap).css({ display: 'flex', flexWrap: 'wrap', gap: '.3rem .9rem', fontSize: '.85em', margin: '.3rem 0' });
            $('<div></div>').appendTo(wrap).css({ fontSize: '.8em', color: '#888' })
                .text('Black dots: the FC tests. Each model\'s projection for a test is drawn at that test (lines join a model\'s projections; they are not a path between tests). The shaded band is your FC range. Below: the misses (test minus projection). Hover a point for its numbers; click a model in the legend to hide or show it. The live SWG Assist projection is scored at the next test only.');
            var rows = [], hidden = self._benchChartHidden || (self._benchChartHidden = {});
            var draw = function () {
                var useReplay = selRows.val() === 'replay', horizon = selHorizon.val(), mode = selMode.val();
                var vsById = {};
                ((self._bench && self._bench.variants) || []).forEach(function (v) { vsById[v.id + '|' + v.version] = v; });
                var series = {}, order = [], tests = {};
                rows.forEach(function (r) {
                    if (!!r.replay !== useReplay || r.horizon !== horizon) return;
                    if (r.mode !== (r.id === 'live' ? 'live' : mode)) return;
                    var k = r.id + '|' + r.v;
                    if (!series[k]) { series[k] = []; order.push(k); }
                    series[k].push(r);
                    tests[r.t] = r.test;
                });
                order.sort(function (a, c) { return (a.indexOf('live|') === 0 ? -1 : 0) - (c.indexOf('live|') === 0 ? -1 : 0) || (a < c ? -1 : a > c ? 1 : 0); });
                var colors = {};
                order.forEach(function (k, i) { colors[k] = self._benchPalette[i % self._benchPalette.length]; });
                legend.empty();
                order.forEach(function (k) {
                    var v = vsById[k], id = k.split('|');
                    var item = $('<span></span>').appendTo(legend).css({ cursor: 'pointer', opacity: hidden[k] ? 0.35 : 1, whiteSpace: 'nowrap' })
                        .attr('title', v ? (v.label || v.id) : k);
                    $('<span></span>').appendTo(item).css({ display: 'inline-block', width: '.8rem', height: '.8rem', background: colors[k], borderRadius: '.15rem', marginRight: '.3rem', verticalAlign: 'middle' });
                    $('<span></span>').appendTo(item).text(id[0] + ' v' + id[1] + ' (' + series[k].length + ')');
                    item.on('click', function () { hidden[k] = !hidden[k]; draw(); });
                });
                var tKeys = Object.keys(tests).map(Number).sort(function (a, c) { return a - c; });
                if (!tKeys.length) { chart.empty(); $('<div></div>').appendTo(chart).css({ fontStyle: 'italic', color: '#888', padding: '1rem' }).text('No scores for this view in the period.'); return; }
                var shown = order.filter(function (k) { return !hidden[k]; });
                var range = self._fcRange || {};
                var ys = tKeys.map(function (t) { return tests[t]; });
                var ms = [];
                shown.forEach(function (k) { series[k].forEach(function (r) { ys.push(r.proj); ms.push(r.miss); }); });
                if (typeof range.low === 'number') ys.push(range.low);
                if (typeof range.high === 'number') ys.push(range.high);
                var y0 = Math.floor(Math.min.apply(null, ys)) - 0.5, y1 = Math.ceil(Math.max.apply(null, ys)) + 0.5;
                var mAbs = Math.max(1, Math.ceil(Math.max.apply(null, ms.map(Math.abs).concat([1])) * 2) / 2);
                var x0 = tKeys[0], x1 = tKeys[tKeys.length - 1];
                if (x1 - x0 < 86400000) { x0 -= 43200000; x1 += 43200000; }
                var W = 900, L = 44, R = 10, T = 8, H1 = 260, G = 26, H2 = 110, B = 22, H = T + H1 + G + H2 + B;
                var px = function (t) { return L + (t - x0) / (x1 - x0) * (W - L - R); };
                var py = function (y) { return T + (y1 - y) / (y1 - y0) * H1; };
                var mTop = T + H1 + G;
                var pm = function (m) { return mTop + (mAbs - m) / (2 * mAbs) * H2; };
                var s = [];
                // the FC range
                if (typeof range.low === 'number' && typeof range.high === 'number')
                    s.push('<rect x="' + L + '" y="' + py(range.high).toFixed(1) + '" width="' + (W - L - R) + '" height="' + (py(range.low) - py(range.high)).toFixed(1) + '" fill="#2ca02c" fill-opacity="0.08"></rect>');
                // y grid and labels (FC)
                var step = (y1 - y0) > 8 ? 2 : 1;
                for (var y = Math.ceil(y0); y <= y1; y += step) {
                    s.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + py(y).toFixed(1) + '" y2="' + py(y).toFixed(1) + '" stroke="#888" stroke-opacity="0.2"></line>');
                    s.push('<text x="' + (L - 4) + '" y="' + (py(y) + 3).toFixed(1) + '" font-size="10" text-anchor="end" fill="currentColor">' + y + '</text>');
                }
                s.push('<text x="4" y="' + (T + 10) + '" font-size="10" fill="currentColor">FC</text>');
                // misses panel: zero line and +-mAbs
                [mAbs, 0, -mAbs].forEach(function (m) {
                    s.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + pm(m).toFixed(1) + '" y2="' + pm(m).toFixed(1) + '" stroke="#888" stroke-opacity="' + (m === 0 ? 0.6 : 0.2) + '"></line>');
                    s.push('<text x="' + (L - 4) + '" y="' + (pm(m) + 3).toFixed(1) + '" font-size="10" text-anchor="end" fill="currentColor">' + (m > 0 ? '+' : '') + m + '</text>');
                });
                s.push('<text x="4" y="' + (mTop + 10) + '" font-size="10" fill="currentColor">miss</text>');
                // x labels: about 6 dates
                var nT = 6;
                for (var i = 0; i <= nT; i++) {
                    var t = x0 + (x1 - x0) * i / nT, x = px(t);
                    s.push('<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="#888" stroke-opacity="0.12"></line>');
                    s.push('<text x="' + x.toFixed(1) + '" y="' + (H - 6) + '" font-size="10" text-anchor="' + (i === 0 ? 'start' : i === nT ? 'end' : 'middle') + '" fill="currentColor">' + self._benchEsc(new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })) + '</text>');
                }
                // each model: a thin line through its projections, a dot at each, and its misses below
                shown.forEach(function (k) {
                    var c = colors[k], pts = series[k].slice().sort(function (a, b2) { return a.t - b2.t; });
                    var name = self._benchEsc(k.replace('|', ' v'));
                    s.push('<polyline fill="none" stroke="' + c + '" stroke-opacity="0.45" stroke-width="1" points="' + pts.map(function (r) { return px(r.t).toFixed(1) + ',' + py(r.proj).toFixed(1); }).join(' ') + '"></polyline>');
                    pts.forEach(function (r) {
                        var tip = name + '\n' + self._benchEsc(f.when(r.t)) + ': projected ' + f.n2(r.proj) + ', tested ' + f.n2(r.test) + ', miss ' + f.signed(r.miss) + '\nfrom ' + f.n2(r.f1) + ' ' + f.n2(r.days) + ' days before';
                        s.push('<circle cx="' + px(r.t).toFixed(1) + '" cy="' + py(r.proj).toFixed(1) + '" r="3" fill="' + c + '"><title>' + tip + '</title></circle>');
                        s.push('<circle cx="' + px(r.t).toFixed(1) + '" cy="' + pm(Math.max(-mAbs, Math.min(mAbs, r.miss))).toFixed(1) + '" r="2.5" fill="' + c + '"><title>' + tip + '</title></circle>');
                    });
                });
                // the tests on top
                tKeys.forEach(function (t) {
                    s.push('<circle cx="' + px(t).toFixed(1) + '" cy="' + py(tests[t]).toFixed(1) + '" r="3.5" fill="currentColor"><title>FC test ' + self._benchEsc(f.when(t)) + ': ' + f.n2(tests[t]) + '</title></circle>');
                });
                chart.empty();
                var svg = $('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block">' + s.join('') + '</svg>');
                svg.appendTo(chart);
            };
            var load = function () {
                self._benchChartDays = parseInt(selDays.val(), 10);
                chart.empty();
                $('<div></div>').appendTo(chart).css({ fontStyle: 'italic', color: '#888', padding: '1rem' }).text('Loading the scores...');
                var go = function () {
                    $.getApiService('/state/autoSwg/bench/scores?days=' + self._benchChartDays, null, function (r) { rows = Array.isArray(r) ? r : []; draw(); });
                };
                // the variant labels come with the scoreboard
                if (self._bench && self._bench.variants) go();
                else $.getApiService('/state/autoSwg/bench', null, function (b) { self._bench = b || {}; go(); });
            };
            selDays.on('change', load);
            selRows.on('change', function () { self._benchChartRows = selRows.val(); draw(); });
            selHorizon.on('change', draw);
            selMode.on('change', draw);
            load();
        },
        // The CYA path (GET /state/autoSwg/bench/cya?days=): the path as known now, the tests and their status, the stabilizer additions, the rain k and the advice.
        _showBenchCya: function () {
            var self = this, f = self._benchFmt;
            var dlg = $.pic.modalDialog.createDialog('dlgAutoSwgBenchCya', { width: Math.min(900, Math.max(320, (window.innerWidth || 900) - 24)) + 'px', height: 'auto', title: 'Model Bench: CYA Path',
                buttons: [{ text: 'Close', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }] });
            var wrap = $('<div></div>').css({ maxHeight: '36rem', overflowY: 'auto', padding: '.25rem' }).appendTo(dlg);
            var bar = $('<div></div>').appendTo(wrap).css({ fontSize: '.9em', marginBottom: '.3rem' });
            $('<span></span>').text('Last ').appendTo(bar);
            var selDays = $('<select></select>').appendTo(bar);
            [['60', '60 days'], ['120', '120 days'], ['240', '240 days'], ['400', '400 days']].forEach(function (it) { $('<option></option>').attr('value', it[0]).text(it[1]).appendTo(selDays); });
            selDays.val(String(self._benchCyaDays || 120));
            var body = $('<div></div>').appendTo(wrap);
            var statusColor = { first: '#7f7f7f', accepted: '#2ca02c', confirmed: '#1f77b4', doubtful: '#ff7f0e' };
            var statusText = { first: 'first test', accepted: 'accepted', confirmed: 'confirmed by a second test', doubtful: 'doubtful (not used until a second test agrees)' };
            var render = function (c) {
                body.empty();
                var line = function (text, css) { return $('<div></div>').appendTo(body).css($.extend({ fontSize: '.9em', padding: '.1rem 0' }, css || {})).text(text); };
                var src = { none: 'none', rain: 'rain (gauge rain x k per inch)', salt: 'salt (the chlorinator\'s salt reading, salt additions removed)', both: 'rain and salt (rain between salt steps, salt anchoring the level)' }[c.source] || c.source;
                line('CYA on the path now: ' + (typeof c.now === 'number' ? c.now.toFixed(1) + ' ppm' : '--') + (c.anchor ? ', standing on the test of ' + f.day(c.anchor.t) + ' (' + c.anchor.ppm + ' ppm)' : ''), { fontWeight: 'bold' });
                line('Dilution: ' + src + '.');
                if (typeof c.rainK === 'number') line('Rain k: ' + (c.rainK * 100).toFixed(2) + '% of the water per inch of rain' + (typeof c.defaultK === 'number' ? '; the default from the pool\'s area and gallons is ' + (c.defaultK * 100).toFixed(2) + '%' : '')
                    + (c.settings && c.settings.autoK ? ', re-estimated from ' + (c.pairs || 0) + ' test pair' + (c.pairs === 1 ? '' : 's') + ' with rain and no addition between them' : ', fixed') + '.');
                var a = c.advice;
                if (a && a.due) {
                    $('<div></div>').appendTo(body).css({ color: '#0b3d5c', background: '#d6ecfa', padding: '.4rem .6rem', borderRadius: '.25rem', margin: '.3rem 0' }).text('ℹ CYA test advised: ' + a.reason);
                    (a.rules || []).filter(function (r) { return r.rule !== a.rule; }).forEach(function (r) { line('Also (rule ' + r.rule + '): ' + r.reason, { color: '#666', fontSize: '.85em' }); });
                }
                else line('No CYA test is advised now.', { color: '#666' });
                // the chart: the path, the tests (colour by status, a tick from what the path expected), the additions
                var path = Array.isArray(c.path) ? c.path.map(function (p) { return [new Date(p[0]).getTime(), p[1]]; }).filter(function (p) { return isFinite(p[0]) && typeof p[1] === 'number'; }) : [];
                var tests = (c.tests || []).map(function (n) { return $.extend({}, n, { tt: new Date(n.t).getTime() }); });
                var adds = (c.additions || []).map(function (x) { return { tt: new Date(x.t).getTime(), ppm: x.ppm }; });
                if (path.length || tests.length) {
                    var xs = path.map(function (p) { return p[0]; }).concat(tests.map(function (n) { return n.tt; }), adds.map(function (x) { return x.tt; }));
                    var ys = path.map(function (p) { return p[1]; }).concat(tests.map(function (n) { return n.ppm; }), tests.filter(function (n) { return typeof n.projected === 'number'; }).map(function (n) { return n.projected; }));
                    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
                    if (x1 - x0 < 86400000) { x0 -= 43200000; x1 += 43200000; }
                    var y0 = Math.floor((Math.min.apply(null, ys) - 3) / 5) * 5, y1 = Math.ceil((Math.max.apply(null, ys) + 3) / 5) * 5;
                    var W = 860, L = 40, R = 10, T = 14, H1 = 240, B = 22, H = T + H1 + B;
                    var px = function (t) { return L + (t - x0) / (x1 - x0) * (W - L - R); };
                    var py = function (y) { return T + (y1 - y) / (y1 - y0) * H1; };
                    var s = [];
                    var step = (y1 - y0) > 40 ? 10 : 5;
                    for (var y = y0; y <= y1; y += step) {
                        s.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + py(y).toFixed(1) + '" y2="' + py(y).toFixed(1) + '" stroke="#888" stroke-opacity="0.2"></line>');
                        s.push('<text x="' + (L - 4) + '" y="' + (py(y) + 3).toFixed(1) + '" font-size="10" text-anchor="end" fill="currentColor">' + y + '</text>');
                    }
                    s.push('<text x="4" y="10" font-size="10" fill="currentColor">CYA</text>');
                    for (var i = 0; i <= 6; i++) {
                        var t = x0 + (x1 - x0) * i / 6;
                        s.push('<text x="' + px(t).toFixed(1) + '" y="' + (H - 6) + '" font-size="10" text-anchor="' + (i === 0 ? 'start' : i === 6 ? 'end' : 'middle') + '" fill="currentColor">' + self._benchEsc(new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })) + '</text>');
                    }
                    adds.forEach(function (x) {
                        s.push('<line x1="' + px(x.tt).toFixed(1) + '" x2="' + px(x.tt).toFixed(1) + '" y1="' + T + '" y2="' + (T + H1) + '" stroke="#9467bd" stroke-dasharray="4 3"><title>Stabilizer added ' + self._benchEsc(f.when(x.tt)) + ': about ' + x.ppm + ' ppm</title></line>');
                        s.push('<text x="' + (px(x.tt) + 3).toFixed(1) + '" y="' + (T + 9) + '" font-size="10" fill="#9467bd">+' + Math.round(x.ppm) + '</text>');
                    });
                    if (path.length) s.push('<polyline fill="none" stroke="#1f77b4" stroke-width="1.5" points="' + path.map(function (p) { return px(p[0]).toFixed(1) + ',' + py(p[1]).toFixed(1); }).join(' ') + '"></polyline>');
                    tests.forEach(function (n) {
                        var col = statusColor[n.status] || '#333';
                        var tip = 'CYA test ' + self._benchEsc(f.when(n.tt)) + ': ' + n.ppm + ' ppm' + (typeof n.projected === 'number' ? ', the path expected ' + n.projected.toFixed(1) : '') + '\n' + self._benchEsc(statusText[n.status] || n.status || '') + (n.reason ? '\n' + self._benchEsc(n.reason) : '');
                        if (typeof n.projected === 'number') s.push('<line x1="' + px(n.tt).toFixed(1) + '" x2="' + px(n.tt).toFixed(1) + '" y1="' + py(n.projected).toFixed(1) + '" y2="' + py(n.ppm).toFixed(1) + '" stroke="' + col + '" stroke-width="1.5"></line>');
                        s.push('<circle cx="' + px(n.tt).toFixed(1) + '" cy="' + py(n.ppm).toFixed(1) + '" r="4.5" fill="' + (n.status === 'doubtful' ? 'none' : col) + '" stroke="' + col + '" stroke-width="2"><title>' + tip + '</title></circle>');
                    });
                    $('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;margin:.4rem 0">' + s.join('') + '</svg>').appendTo(body);
                    var leg = $('<div></div>').appendTo(body).css({ display: 'flex', flexWrap: 'wrap', gap: '.3rem .9rem', fontSize: '.8em', color: '#666' });
                    $('<span></span>').appendTo(leg).text('Blue line: the path as known now. Purple dashes: stabilizer additions. Tests:');
                    Object.keys(statusColor).forEach(function (k) {
                        var it = $('<span></span>').appendTo(leg);
                        $('<span></span>').appendTo(it).css({ display: 'inline-block', width: '.7rem', height: '.7rem', borderRadius: '50%', border: '2px solid ' + statusColor[k], background: k === 'doubtful' ? 'transparent' : statusColor[k], marginRight: '.25rem', verticalAlign: 'middle' });
                        $('<span></span>').appendTo(it).text(statusText[k]);
                    });
                }
                var table = function (title, cols, data) {
                    if (!data.length) return;
                    $('<div></div>').appendTo(body).css({ fontWeight: 'bold', margin: '.6rem 0 .2rem 0' }).text(title);
                    var tbl = $('<table></table>').css({ width: '100%', borderCollapse: 'collapse', fontSize: '.85em' }).appendTo(body);
                    var head = $('<tr></tr>').appendTo($('<thead></thead>').appendTo(tbl));
                    cols.forEach(function (cc) { $('<th></th>').text(cc[0]).css({ textAlign: cc[1], padding: '.2rem .5rem', borderBottom: '1px solid #999', whiteSpace: 'nowrap' }).appendTo(head); });
                    var tb = $('<tbody></tbody>').appendTo(tbl);
                    data.forEach(function (row) {
                        var tr = $('<tr></tr>').appendTo(tb);
                        row.forEach(function (val, i) { $('<td></td>').text(val).css({ textAlign: cols[i][1], padding: '.2rem .5rem', borderBottom: '1px solid #ddd', whiteSpace: i === row.length - 1 ? 'normal' : 'nowrap' }).appendTo(tr); });
                    });
                };
                table('CYA tests in the period', [['Test', 'left'], ['CYA', 'right'], ['Path expected', 'right'], ['Status', 'left'], ['Why', 'left']],
                    tests.slice().reverse().map(function (n) { return [f.when(n.tt), String(n.ppm), typeof n.projected === 'number' ? n.projected.toFixed(1) : '--', statusText[n.status] || n.status || '', n.reason || '']; }));
                table('Stabilizer additions in the period', [['Added', 'left'], ['About (ppm)', 'right']],
                    adds.slice().reverse().map(function (x) { return [f.when(x.tt), String(x.ppm)]; }));
                table('Recorded CYA tests (newest 10): the path just before each, the rain k before and after, the advice rule then in force', [['Test', 'left'], ['CYA', 'right'], ['Path before', 'right'], ['k before', 'right'], ['k after', 'right'], ['Rule', 'right'], ['Revised scores', 'right'], ['Status', 'left']],
                    (c.records || []).slice().reverse().map(function (r) {
                        var k = function (x) { return typeof x === 'number' ? (x * 100).toFixed(2) + '%' : '--'; };
                        return [f.when(r.t), String(r.ppm), typeof r.projected === 'number' ? r.projected.toFixed(1) : '--', k(r.rainKBefore), k(r.rainKAfter), typeof r.adviceRule === 'number' ? String(r.adviceRule) : '--', r.baseline ? 'baseline' : String(r.revised || 0), (statusText[r.status] || r.status || '') + (r.reason ? ': ' + r.reason : '')];
                    }));
                table('Model drift at the last checks (the burn of the last two weeks with CYA left free)', [['Check', 'left'], ['CYA implied', 'right'], ['Path', 'right'], ['Intervals', 'right'], ['Off', 'left']],
                    (c.drift || []).slice().reverse().map(function (d) { return [f.when(d.t), typeof d.implied === 'number' ? d.implied.toFixed(1) : '--', typeof d.path === 'number' ? d.path.toFixed(1) : '--', String(d.n), d.off ? 'yes' : 'no']; }));
            };
            var load = function () {
                self._benchCyaDays = parseInt(selDays.val(), 10);
                body.empty();
                $('<div></div>').appendTo(body).css({ fontStyle: 'italic', color: '#888', padding: '1rem' }).text('Loading the CYA path...');
                self._benchGet('/state/autoSwg/bench/cya?days=' + self._benchCyaDays, function (c) { render(c || {}); }, function (status) {
                    body.empty();
                    $('<div></div>').appendTo(body).css({ fontStyle: 'italic', color: '#888', padding: '1rem' })
                        .text(status === 404 ? 'This njsPC does not have the bench\'s CYA path yet: its models hold CYA at the last test. The CYA path comes with a newer SWG Assist Model Bench.' : 'The CYA path could not be loaded (' + (status || 'no answer') + ').');
                });
            };
            selDays.on('change', load);
            load();
        },
        // The models (copy, edit, retire), the pool geometry and the CYA settings (GET/PUT /config/autoSwg/bench).
        _showBenchSettings: function () {
            var self = this;
            var dlg = $.pic.modalDialog.createDialog('dlgAutoSwgBenchSettings', { width: Math.min(900, Math.max(320, (window.innerWidth || 900) - 24)) + 'px', height: 'auto', title: 'Model Bench: Models and Settings',
                buttons: [{ text: 'Close', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); self._loadBench(); } }] });
            var wrap = $('<div></div>').css({ maxHeight: '36rem', overflowY: 'auto', padding: '.25rem' }).appendTo(dlg);
            var msg = $('<div></div>').css({ fontWeight: 'bold', color: '#2a7', padding: '.2rem 0' }).hide();
            var put = function (body, what, done) {
                $.putApiService('/config/autoSwg/bench', body, 'Saving the bench settings...', function (s) {
                    msg.text(what).show();
                    render(s || {});
                    if (done) done(s);
                });
            };
            var section = function (title) { return $('<div></div>').appendTo(wrap).css({ fontWeight: 'bold', margin: '.7rem 0 .25rem 0', borderBottom: '1px solid #999' }).text(title); };
            var field = function (parent, label, input, note) {
                var row = $('<div></div>').appendTo(parent).css({ display: 'flex', alignItems: 'center', gap: '.5rem', margin: '.15rem 0', fontSize: '.9em' });
                $('<label></label>').appendTo(row).text(label).css({ width: '15rem', flex: '0 0 auto' });
                input.appendTo(row);
                if (note) $('<span></span>').appendTo(row).css({ color: '#888', fontSize: '.9em' }).text(note);
                return input;
            };
            var num = function (val, w) { return $('<input type="number" step="any">').val(typeof val === 'number' ? val : '').css({ width: w || '6rem' }); };
            var render = function (s) {
                wrap.empty();
                msg.appendTo(wrap);
                var vs = Array.isArray(s.variants) ? s.variants : [];
                // enabled
                var line = $('<div></div>').appendTo(wrap).css({ margin: '.2rem 0' });
                var cbEnabled = $('<input type="checkbox">').prop('checked', s.enabled !== false).appendTo(line);
                $('<span></span>').appendTo(line).text(' The bench is on (it fits every model at each automatic check and scores them at each new FC test)').css({ fontSize: '.9em' });
                cbEnabled.on('change', function () { put({ enabled: cbEnabled.is(':checked') }, cbEnabled.is(':checked') ? 'The bench is on.' : 'The bench is off. Its files are kept.'); });
                section('Models');
                $('<div></div>').appendTo(wrap).css({ fontSize: '.85em', color: '#666', marginBottom: '.3rem' })
                    .text('An edit that changes how a model works makes a new version: the old version\'s scores are kept and scored apart, so a change never mixes with what came before. A label alone keeps the version. Retire stops fitting and scoring a model and keeps its scores; Restore starts it again.');
                var tbl = $('<table></table>').css({ width: '100%', borderCollapse: 'collapse', fontSize: '.85em' }).appendTo(wrap);
                var head = $('<tr></tr>').appendTo($('<thead></thead>').appendTo(tbl));
                [['Model', 'left'], ['Version', 'right'], ['What it does', 'left'], ['', 'left']].forEach(function (c) { $('<th></th>').text(c[0]).css({ textAlign: c[1], padding: '.2rem .5rem', borderBottom: '1px solid #999' }).appendTo(head); });
                var tb = $('<tbody></tbody>').appendTo(tbl);
                vs.forEach(function (v) {
                    var tr = $('<tr></tr>').appendTo(tb);
                    if (v.retired) tr.css({ color: '#999' });
                    $('<td></td>').appendTo(tr).css({ padding: '.2rem .5rem', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' }).append($('<div></div>').css({ fontWeight: 'bold' }).text(v.id + (v.retired ? ' (retired)' : ''))).append($('<div></div>').text(v.label || ''));
                    $('<td></td>').appendTo(tr).css({ padding: '.2rem .5rem', borderBottom: '1px solid #ddd', textAlign: 'right' }).text('v' + v.version);
                    $('<td></td>').appendTo(tr).css({ padding: '.2rem .5rem', borderBottom: '1px solid #ddd' }).text(self._benchDescribe(v));
                    var act = $('<td></td>').appendTo(tr).css({ padding: '.2rem .5rem', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' });
                    var link = function (text, fn) { $('<span></span>').appendTo(act).text(text).css({ cursor: 'pointer', textDecoration: 'underline', marginRight: '.6rem', color: '#2a6fa8' }).on('click', fn); };
                    link('Edit', function () { self._showBenchVariantEditor(v, false, vs, function (nv) { put({ variants: [nv] }, 'Saved ' + nv.id + '.'); }); });
                    if (v.kind !== 'live') link('Copy', function () { self._showBenchVariantEditor(v, true, vs, function (nv) { put({ variants: [nv] }, 'Added ' + nv.id + ' (version 1).'); }); });
                    link(v.retired ? 'Restore' : 'Retire', function () {
                        var nv = $.extend({}, v);
                        if (v.retired) delete nv.retired; else nv.retired = true;
                        put({ variants: [nv] }, (v.retired ? 'Restored ' : 'Retired ') + v.id + '. Its scores are kept.');
                    });
                });
                // geometry
                var g = s.geometry || {};
                section('Pool geometry (the sun on the water: the wall\'s shade and the screen)');
                $('<div></div>').appendTo(wrap).css({ fontSize: '.85em', color: '#666', marginBottom: '.3rem' })
                    .text('Used for the pool sun of every model with a pool sun term, from the next check on. It does not start new model versions. Distances along the wall are in feet from the outline\'s origin.');
                var gBox = $('<div></div>').appendTo(wrap);
                var gf = {
                    wallFacingDeg: field(gBox, 'The wall faces (degrees from north)', num(g.wallFacingDeg)),
                    edgeHeightIn: field(gBox, 'Wall (roof edge) height', num(g.edgeHeightIn), 'inches above the deck'),
                    deckToWaterIn: field(gBox, 'Deck to water', num(g.deckToWaterIn), 'inches'),
                    nearestIn: field(gBox, 'Wall to the nearest water', num(g.nearestIn), 'inches'),
                    pitchDeg: field(gBox, 'Screen roof pitch', num(g.pitchDeg), 'degrees'),
                    meshOpen: field(gBox, 'Screen mesh lets through', num(g.meshOpen), '0 to 1, sun straight on'),
                    frameShade: field(gBox, 'Cage frame shades', num(g.frameShade), '0 to 0.9 of the beam'),
                    gridFt: field(gBox, 'Grid spacing', num(g.gridFt), 'feet (0.25 to 5)')
                };
                var e = g.enclosure || {};
                var ex0 = field(gBox, 'Screen cage starts at', num(e.x0), 'feet along the wall');
                var ew = field(gBox, 'Screen cage width', num(e.width), 'feet along the wall');
                var ed = field(gBox, 'Screen cage depth', num(e.depth), 'feet from the wall');
                var outline = field(gBox, 'Pool outline [[x, y], ...] in feet', $('<textarea rows="3"></textarea>').css({ width: '100%', fontFamily: 'monospace', fontSize: '.85em' }).val(JSON.stringify(g.outline || [])));
                var gBtn = $('<div class="picBtnPanel btn-panel"></div>').appendTo(wrap);
                $('<div></div>').appendTo(gBtn).actionButton({ text: 'Save Geometry', icon: '<i class="fas fa-save"></i>' }).on('click', function () {
                    var body = { enclosure: {} };
                    Object.keys(gf).forEach(function (k) { var x = parseFloat(gf[k].val()); if (isFinite(x)) body[k] = x; });
                    [['x0', ex0], ['width', ew], ['depth', ed]].forEach(function (p) { var x = parseFloat(p[1].val()); if (isFinite(x)) body.enclosure[p[0]] = x; });
                    var ol;
                    try { ol = JSON.parse(outline.val()); } catch (err) { ol = undefined; }
                    if (!Array.isArray(ol) || ol.length < 3 || !ol.every(function (p) { return Array.isArray(p) && p.length >= 2 && isFinite(Number(p[0])) && isFinite(Number(p[1])); })) {
                        $.pic.modalDialog.createConfirm('dlgAutoSwgBenchOutline', { message: 'The outline must be a list of at least three [x, y] points in feet, for example [[0, 0], [10, 0], [10, 5]].', width: '420px', height: 'auto', title: 'Pool Outline',
                            buttons: [{ text: 'OK', icon: '<i class="fas fa-check"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }] });
                        return;
                    }
                    body.outline = ol;
                    put({ geometry: body }, 'Saved the geometry. It applies from the next check.');
                });
                // CYA (step 2 of the bench; an older njsPC has no cya block and ignores it)
                if (s.cya) {
                    var c = s.cya;
                    section('CYA path');
                    $('<div></div>').appendTo(wrap).css({ fontSize: '.85em', color: '#666', marginBottom: '.3rem' })
                        .text('How the CYA between tests is worked out for the models on the CYA path, and when a test is doubtful. Stabilizer additions logged in PoolMath are steps on the path.');
                    var cBox = $('<div></div>').appendTo(wrap);
                    var selSrc = $('<select></select>');
                    [['none', 'None (held between tests and additions)'], ['rain', 'Rain (gauge rain x k per inch)'], ['salt', 'Salt (the chlorinator\'s salt reading)'], ['both', 'Rain and salt']].forEach(function (it) { $('<option></option>').attr('value', it[0]).text(it[1]).appendTo(selSrc); });
                    selSrc.val(c.source);
                    field(cBox, 'Dilution from', selSrc);
                    var rainK = field(cBox, 'Rain k (% of the water per inch)', num(typeof c.rainK === 'number' ? Math.round(c.rainK * 10000) / 100 : undefined), 'blank: from the pool\'s area and gallons; 0 to 5');
                    var cbAutoK = field(cBox, 'Re-estimate k from the tests', $('<input type="checkbox">').prop('checked', c.autoK !== false), 'from test pairs with rain and no addition between them');
                    var priorPairs = field(cBox, 'The default k counts as', num(c.priorPairs), 'test pairs (pulls the estimate toward it while there are few)');
                    var jump = field(cBox, 'A rise with nothing added is doubtful above', num(c.jumpPpm), 'ppm (3 to 50)');
                    var cBtn = $('<div class="picBtnPanel btn-panel"></div>').appendTo(wrap);
                    $('<div></div>').appendTo(cBtn).actionButton({ text: 'Save CYA Settings', icon: '<i class="fas fa-save"></i>' }).on('click', function () {
                        var body = { source: selSrc.val(), autoK: cbAutoK.is(':checked') };
                        var k = parseFloat(rainK.val());
                        body.rainK = isFinite(k) ? k / 100 : null;
                        var pp = parseFloat(priorPairs.val()); if (isFinite(pp)) body.priorPairs = pp;
                        var j = parseFloat(jump.val()); if (isFinite(j)) body.jumpPpm = j;
                        put({ cya: body }, 'Saved the CYA settings. They apply from the next check.');
                    });
                }
            };
            $.getApiService('/config/autoSwg/bench', null, 'Loading the bench settings...', function (s) { render(s || {}); });
        },
        // Edits a model, or (copy) makes a new one from it. `done` gets the variant to PUT.
        _showBenchVariantEditor: function (v, copy, all, done) {
            var self = this;
            var buttons = [
                { text: copy ? 'Add Model' : 'Save Model', icon: '<i class="fas fa-save"></i>', click: function () { save(this); } },
                { text: 'Cancel', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }
            ];
            var dlg = $.pic.modalDialog.createDialog('dlgAutoSwgBenchVariantEdit', { width: '560px', height: 'auto', title: copy ? 'Copy Model ' + v.id : 'Edit Model ' + v.id + ' (v' + v.version + ')', buttons: buttons });
            var err = $('<div></div>').appendTo(dlg).css({ color: '#c0392b', fontWeight: 'bold', padding: '.2rem 0' }).hide();
            var field = function (label, input, note) {
                var row = $('<div></div>').appendTo(dlg).css({ display: 'flex', alignItems: 'center', gap: '.5rem', margin: '.2rem 0', fontSize: '.9em' });
                $('<label></label>').appendTo(row).text(label).css({ width: '11rem', flex: '0 0 auto' });
                input.appendTo(row);
                if (note) $('<span></span>').appendTo(row).css({ color: '#888', fontSize: '.9em' }).text(note);
                return input;
            };
            var num = function (val) { return $('<input type="number" step="any">').val(typeof val === 'number' ? val : '').css({ width: '5rem' }); };
            var select = function (items, val) { var s = $('<select></select>'); items.forEach(function (it) { $('<option></option>').attr('value', it[0]).text(it[1]).appendTo(s); }); s.val(val); return s; };
            var newId = v.id + '-copy';
            for (var k = 2; all.some(function (x) { return x.id === newId; }); k++) newId = v.id + '-copy' + k;
            var fId = field('Name (id)', $('<input type="text" maxlength="40">').val(copy ? newId : v.id).prop('disabled', !copy).css({ width: '14rem' }), copy ? 'letters, digits, . _ -' : '');
            var fLabel = field('Label', $('<input type="text" maxlength="80">').val((copy ? 'Copy of ' : '') + (v.label || '')).css({ width: '20rem' }));
            var x = {};
            if (v.kind === 'plain') x.windowDays = field('Average over', num(v.windowDays), 'days (1 to 60)');
            if (v.kind === 'model') {
                x.sun = field('Sun term', select([['pool', 'Pool sun (on the water)'], ['station', 'Station sun'], ['poolHourHigh', 'Pool sun from the hour highs'], ['clearPool', 'Clear-sky pool sun x clearness'], ['none', 'No sun term']], v.sun || 'pool'));
                x.fcTerm = field('Burn scales with', select([['fcCya', 'FC/CYA'], ['fc', 'FC alone']], v.fcTerm || 'fcCya'));
                x.cya = field('CYA', select([['path', 'The path between tests'], ['held', 'Held at the last test']], v.cya || 'held'));
                x.fcPath = field('FC inside the gap', select([['model', 'Follows the model'], ['held', 'Held at the start reading']], v.fcPath || 'model'));
                x.fitDays = field('Fit on the last', num(v.fitDays), 'days (7 to 120)');
                x.ridge = field('Ridge strength', num(v.ridge), '0 to 100 (pulls each fit toward the one before)');
                x.minIntervals = field('Fewest FC intervals', num(v.minIntervals), 'below this it uses the 14-day average (2 to 50)');
                x.minGapDays = field('Shortest interval', num(v.minGapDays), 'days (0 to 3)');
                x.temp = field('Water temperature factor', $('<input type="checkbox">').prop('checked', v.temp === true));
                x.rainWash = field('Rain wash-in term', $('<input type="checkbox">').prop('checked', v.rainWash === true));
            }
            $('<div></div>').appendTo(dlg).css({ fontSize: '.85em', color: '#666', marginTop: '.4rem' })
                .text(copy ? 'The copy starts at version 1 and is fitted from the next check. Replay scores it over the past.' : 'If this changes how the model works it becomes version ' + (v.version + 1) + '; the scores of version ' + v.version + ' are kept and scored apart.');
            var save = function (dlgEl) {
                var nv = { id: copy ? String(fId.val()).trim() : v.id, kind: v.kind, label: String(fLabel.val()).trim() };
                if (!/^[A-Za-z0-9._-]{1,40}$/.test(nv.id)) { err.text('The name may use letters, digits, dot, dash and underscore (up to 40).').show(); return; }
                if (copy && all.some(function (y) { return y.id === nv.id; })) { err.text('A model named ' + nv.id + ' already exists.').show(); return; }
                if (!copy && v.retired) nv.retired = true;
                Object.keys(x).forEach(function (key) {
                    var inp = x[key];
                    if (inp.is('select')) nv[key] = inp.val();
                    else if (inp.is(':checkbox')) { if (inp.is(':checked')) nv[key] = true; }
                    else { var n = parseFloat(inp.val()); if (isFinite(n)) nv[key] = n; }
                });
                $.pic.modalDialog.closeDialog(dlgEl);
                done(nv);
            };
        },
        // Works the scores out over the past (POST /state/autoSwg/bench/replay?since=days).
        _showBenchReplay: function () {
            var self = this;
            var days;
            var dlg = $.pic.modalDialog.createDialog('dlgAutoSwgBenchReplay', { width: '480px', height: 'auto', title: 'Model Bench: Replay',
                buttons: [
                    { text: 'Start Replay', icon: '<i class="fas fa-play"></i>', click: function () {
                        var n = parseInt(days.val(), 10);
                        if (!(n >= 7 && n <= 548)) n = 120;
                        $.pic.modalDialog.closeDialog(this);
                        $.postApiService('/state/autoSwg/bench/replay?since=' + n, {}, 'Starting the replay...', function () {
                            if (!makeBool(self._benchAcc.attr('data-expanded'))) self._benchAcc[0].expanded(true);
                            setTimeout(function () { self._loadBench(); }, 1500);
                        });
                    } },
                    { text: 'Cancel', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }
                ] });
            $('<div></div>').appendTo(dlg).css({ fontSize: '.9em', marginBottom: '.5rem' })
                .text('Works every model\'s fits and scores out over the past, as if the bench had been running, each test scored with the fit as of the 10:00 or 22:00 check before it. '
                    + 'Replay rows replace the earlier replay rows and are kept apart from live rows, which are never touched. It runs in the background on njsPC; the status line follows it. It never changes the SWG %.');
            var row = $('<div></div>').appendTo(dlg).css({ display: 'flex', alignItems: 'center', gap: '.5rem' });
            $('<label></label>').appendTo(row).text('Replay the last');
            days = $('<input type="number" min="7" max="548" step="1">').val(120).css({ width: '5rem' }).appendTo(row);
            $('<span></span>').appendTo(row).text('days (7 to 548)');
        },
        // Every score row as CSV (GET /state/autoSwg/bench/scores?days=548&format=csv; the server names the file).
        _downloadBenchCsv: function () {
            var self = this;
            var link = document.createElement('a');
            link.href = self._benchUrl('/state/autoSwg/bench/scores?days=548&format=csv');
            link.setAttribute('download', 'autoSwgBenchScores.csv');
            document.body.appendChild(link);
            link.click();
            $(link).remove();
        },
        // The CYA test advice (state.autoSwg.benchCyaAdvice, from the Model Bench) beside the salt note; nothing when no test is due.
        _renderBenchCyaAdvice: function (result) {
            var self = this;
            var a = result && result.benchCyaAdvice;
            if (a && a.due && a.reason) {
                var more = (Array.isArray(a.rules) ? a.rules : []).filter(function (r) { return r.rule !== a.rule; }).map(function (r) { return r.reason; });
                self._elBenchCyaNote.text('ℹ CYA test advised: ' + a.reason + (more.length ? ' Also: ' + more.join(' ') : '')).show();
            }
            else self._elBenchCyaNote.hide();
        }
    });
})(jQuery);

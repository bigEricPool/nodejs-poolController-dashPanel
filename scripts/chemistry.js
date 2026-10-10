

(function ($) {
    // "2d 6h", "6h 5m", or "due now" -- kept to 2 units for brevity.
    function fmtAutoSwgCountdown(ms) {
        if (ms <= 0) return 'due now';
        var mins = Math.floor(ms / 60000);
        var days = Math.floor(mins / 1440); mins -= days * 1440;
        var hours = Math.floor(mins / 60); mins -= hours * 60;
        var parts = [];
        if (days > 0) parts.push(days + 'd');
        if (days > 0 || hours > 0) parts.push(hours + 'h');
        if (days === 0) parts.push(mins + 'm');
        return parts.join(' ');
    }
    // How the automatic change that tripped the warning reads: "from 15% to 30% (+15 points; the threshold is 10) by the automatic check at 10:00 AM".
    // The earlier percent and the threshold come from njsPC; an older njsPC that does not send them gets "to 30%".
    function autoSwgLargeChangeText(data) {
        var to = data.lastAppliedPct, from = data.lastAutoApplyPreviousPct, text;
        if (typeof from === 'number' && typeof to === 'number') {
            var moved = to - from;
            text = 'from ' + from + '% to ' + to + '% (' + (moved > 0 ? '+' : '') + moved + ' points' + (typeof data.lastAutoApplyThresholdPct === 'number' ? '; the threshold is ' + data.lastAutoApplyThresholdPct : '') + ')';
        }
        else text = 'to ' + to + '%';
        if (data.lastAppliedAt) {
            var at = new Date(data.lastAppliedAt);
            if (!isNaN(at.getTime())) text += ' by the automatic check at ' + at.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        }
        return text;
    }
    // The warning that even 100% SWG can't reach the target within the window the last
    // apply was aiming for -- only while that deadline is still ahead (afterward there's
    // no longer a target being missed). Empty string when there's nothing to warn about.
    function autoSwgTargetWarning(data) {
        if (!data || !data.lastAppliedTargetWarning || !data.lastAppliedTargetDate) return '';
        return new Date(data.lastAppliedTargetDate).getTime() > Date.now() ? data.lastAppliedTargetWarning : '';
    }
    // The informational counterpart: FC is so far above target that consumption alone (SWG
    // at 0%) won't bring it down by the deadline. Same window as the warning above.
    function autoSwgTargetInfo(data) {
        if (!data || !data.lastAppliedTargetInfo || !data.lastAppliedTargetDate) return '';
        return new Date(data.lastAppliedTargetDate).getTime() > Date.now() ? data.lastAppliedTargetInfo : '';
    }
    // Direction arrow, target %, time remaining, and the target FC that step is chasing --
    // e.g. "↓ to 45% in 2d 6h for target FC of 5 ppm", optionally with the target date/time
    // appended. lastAppliedTargetFc is whatever targetFc was in effect at the apply that
    // scheduled this step, not necessarily today's config (which may have changed since).
    function describeAutoSwgStep(data, withDate) {
        // lastAppliedPct, not currentPct -- currentPct is only refreshed by a Check Now, so
        // right after an Apply it can still hold the pre-apply value.
        var verb = data.stepPct > data.lastAppliedPct ? 'rises to ' : 'drops to ';
        var target = new Date(data.stepAt);
        // "at the end of the target period (target FC 8.5 ppm) SWG drops to 15% in 1d 15h (10/7/26, 6:41 AM)": a later change from what is running now, not the recommendation.
        var s = 'at the end of the target period' + (typeof data.lastAppliedTargetFc === 'number' ? ' (target FC ' + data.lastAppliedTargetFc + ' ppm)' : '') + ' SWG ' + verb + data.stepPct + '% in ' + fmtAutoSwgCountdown(target.getTime() - Date.now());
        if (withDate) s += ' (' + target.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ')';
        // the period can end while the SWG is off, and the step is then set for one minute after it next starts: say when the period ends
        var end = data.lastAppliedTargetDate ? new Date(data.lastAppliedTargetDate) : null;
        if (end && !isNaN(end.getTime()) && Math.abs(target.getTime() - end.getTime()) > 10 * 60000) s += '; the target period ends ' + end.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ' with the SWG off';
        return s;
    }
    $.widget("pic.chemistry", {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            el[0].initChemistry = function (data) { self._initChemistry(data); };
            el[0].setChlorinatorData = function (data) { self.setChlorinatorData(data); };
            el[0].setChemControllerData = function (data) { self.setChemControllerData(data); };
            el[0].setChemDoserData = function (data) { self.setChemDoserData(data); };
            el[0].setAutoSwgData = function (data) { self.setAutoSwgData(data); };
            // The countdown in the AutoSwg summary is worked out when it is drawn, so draw it again once a minute (the page only gets a new update when something changes).
            self._autoSwgTick = setInterval(function () {
                if (el.closest('body').length === 0) { clearInterval(self._autoSwgTick); self._autoSwgTick = undefined; return; }
                if (self._lastAutoSwgData) self._renderAutoSwgSummary(self._lastAutoSwgData);
            }, 60000);
        },
        setChlorinatorData: function (data) {
            var self = this, o = self.options, el = self.element;
            if (data.isActive !== false && el.find('div.picChlorinator[data-id=' + data.id + ']').length === 0) {
                console.log(`RESETTING CHLOR DIV`);
                var div = $('<div></div>');
                div.appendTo(el);
                div.chlorinator(data);
            }
            else
                el.find('div.picChlorinator[data-id=' + data.id + ']').each(function () { this.setEquipmentData(data); });
        },
        setChemControllerData: function (data) {
            var self = this, o = self.options, el = self.element;
            if (data.isActive !== false && el.find('div.picChemController[data-id=' + data.id + ']').length === 0) {
                var div = $('<div></div>');
                div.appendTo(el);
                div.chemController(data);
            }
            else
                el.find('div.picChemController[data-id=' + data.id + ']').each(function () { this.setEquipmentData(data); });
        },
        setChemDoserData: function (data) {
            var self = this, o = self.options, el = self.element;
            if (data.isActive !== false && el.find('div.picChemDoser[data-id=' + data.id + ']').length === 0) {
                var div = $('<div></div>');
                div.appendTo(el);
                div.chemDoser(data);
            }
            else
                el.find('div.picChemDoser[data-id=' + data.id + ']').each(function () { this.setEquipmentData(data); });
        },
        _initChemistry: function (data) {
            var self = this, o = self.options, el = self.element;
            el.find('div.picChlorinator').each(function () {
                this.stopCountdownSuperChlor();
            });
            el.empty();
            self._elAutoSwgSummary = undefined;

            let div = $('<div class="picCircuitTitle control-panel-title"></div>');
            div.appendTo(el);
            let span = $('<span class="picCircuitTitle"></span>');
            span.appendTo(div);
            span.text('Chemistry');
            if (typeof data !== 'undefined' && (
                (typeof data.chlorinators !== 'undefined' && data.chlorinators.length > 0) ||
                (typeof data.chemControllers !== 'undefined' && data.chemControllers.length > 0) ||
                (typeof data.chemDosers !== 'undefined' && data.chemDosers.length > 0)))
                el.show();
            else
                el.hide();
            if (typeof data !== 'undefined') {
                if (typeof data.chlorinators !== 'undefined' && data.chlorinators.length > 0) {
                    for (let i = 0; i < data.chlorinators.length; i++) {
                        $('<div></div>').appendTo(el).chlorinator(data.chlorinators[i]);
                    }
                }
                if (typeof data.chemControllers !== 'undefined' && data.chemControllers.length > 0) {
                    for (let i = 0; i < data.chemControllers.length; i++) {
                        $('<div></div>').appendTo(el).chemController(data.chemControllers[i]);
                    }
                }
                if (typeof data.chemDosers !== 'undefined' && data.chemDosers.length > 0) {
                    for (let i = 0; i < data.chemDosers.length; i++) {
                        $('<div></div>').appendTo(el).chemDoser(data.chemDosers[i]);
                    }
                }
                self._renderAutoSwgSummary(data.autoSwg);
            }
        },
        // Live updates arrive over the 'autoSwg' socket event (emitted whenever
        // njsPC's AutoSwg state changes -- e.g. after Check Now or Apply on the
        // config panel). A full page (re)load gets the last known values instead
        // via _initChemistry's /state/all payload above.
        setAutoSwgData: function (data) {
            var self = this, o = self.options, el = self.element;
            self._renderAutoSwgSummary(data);
        },
        // Small companion block: shows the last applied change and, if one is pending, the
        // step direction/countdown -- so that status is visible on the dashboard without
        // opening config. The current SWG % itself isn't repeated here -- that's already
        // shown live on the Chlorinator widget above. Sourced from the last-known state
        // (page load, or the live 'autoSwg' socket event after an Apply/step happens
        // elsewhere). Deliberately shows nothing from an unapplied calculation
        // (recommendedPct, maintenancePct, projectedCurrentFc, the live rationale) --
        // that preview belongs on the calculation screen only, never here, until it's
        // actually been applied. Only shown once something has actually been applied
        // (lastAppliedAt is unset until then). Clicking it opens the full status popup.
        _renderAutoSwgSummary: function (data) {
            var self = this, el = self.element;
            self._lastAutoSwgData = data;
            // Shown once something has been applied, or while the periodic automatic check is
            // running (so its next due time is visible even before the first apply).
            if (!data || (!data.lastAppliedAt && !data.nextAutoCheckAt)) {
                if (self._elAutoSwgSummary) self._elAutoSwgSummary.hide();
                if (self._elAutoSwgAwayBadge) self._elAutoSwgAwayBadge.hide();
                if (self._elAutoSwgDetailsToggle) { self._elAutoSwgDetailsToggle.hide(); self._elAutoSwgDetails.hide(); }
                return;
            }
            if (!self._elAutoSwgSummary || self._elAutoSwgSummary.closest('body').length === 0) {
                self._elAutoSwgSummary = $('<div class="picAutoSwgSummary"></div>')
                    .css({
                        cursor: 'pointer', padding: '.4rem 0', margin: '.25rem 0',
                        fontSize: '.85em', color: '#666'
                    })
                    .attr('title', 'Click for Automatic SWG % status')
                    .on('click', function () { self._showAutoSwgPopup(); })
                    .appendTo(el);
                // Shown while Away protection is on, above everything else here, so it is plain at a glance that the vacation settings are in place.
                self._elAutoSwgAwayBadge = $('<div></div>').css({
                    fontWeight: 'bold', fontSize: '1em', color: '#fff', background: '#117a8b',
                    padding: '.4rem .6rem', borderRadius: '.25rem', margin: '.25rem 0', textAlign: 'center', cursor: 'pointer'
                }).attr('title', 'Click for Automatic SWG % status').on('click', function () { self._showAutoSwgPopup(); }).hide().insertBefore(self._elAutoSwgSummary);
                // The controller's name -- leftmost and larger than the status text that follows.
                $('<span class="picAutoSwgLabel"></span>').css({ fontSize: '1.05em', fontWeight: 'bold', color: '#333', marginRight: '.4rem' })
                    .text('Auto SWG %').appendTo(self._elAutoSwgSummary);
                self._elAutoSwgSummary.append($('<span></span>'));
                // Fully-automatic mode applies changes with no human review -- flag it loudly
                // here if the most recent one moved the % by more than the configured warning
                // threshold, since the dashboard summary is the one place most likely to be
                // seen without deliberately going looking for it.
                self._elAutoSwgWarning = $('<div></div>').css({
                    fontWeight: 'bold', fontSize: '1em', color: '#fff', background: '#c0392b',
                    padding: '.4rem .6rem', borderRadius: '.25rem', marginTop: '.3rem'
                }).hide().appendTo(self._elAutoSwgSummary.parent());
                // What the njsPC watch found (the chlorinator reports a fault or no output in its run window, the automatic check stopped, a step did not
                // happen): the SWG may not be holding FC, which no recommendation can fix. Red for an alarm, orange for a warning.
                self._elAutoSwgAlerts = $('<div></div>').hide().appendTo(self._elAutoSwgSummary.parent());
                // A fall in the chlorinator's salt reading: the pool was probably diluted (rain, or water removed and refilled).
                self._elAutoSwgSaltNote = $('<div></div>').css({
                    fontSize: '1em', color: '#0b3d5c', background: '#d6ecfa',
                    padding: '.4rem .6rem', borderRadius: '.25rem', marginTop: '.3rem'
                }).hide().appendTo(self._elAutoSwgSummary.parent());
                // Separate from the one above (a different problem, and both can apply): the
                // applied % is already maxed out and still won't reach the target in time.
                self._elAutoSwgTargetWarning = $('<div></div>').css({
                    fontWeight: 'bold', fontSize: '1em', color: '#fff', background: '#d35400',
                    padding: '.4rem .6rem', borderRadius: '.25rem', marginTop: '.3rem'
                }).hide().appendTo(self._elAutoSwgSummary.parent());
                // FC readings that don't add up (an unlogged chlorine addition or a wrong reading): the
                // calculation left those intervals out until PoolMath is corrected.
                self._elAutoSwgAnomaly = $('<div></div>').css({
                    fontSize: '1em', color: '#fff', background: '#d35400',
                    padding: '.4rem .6rem', borderRadius: '.25rem', marginTop: '.3rem'
                }).hide().appendTo(self._elAutoSwgSummary.parent());
                // The SWG Rating disagrees with what PoolMath's recent SWG entries imply (a swapped cell?).
                self._elAutoSwgRating = $('<div></div>').css({
                    fontWeight: 'bold', fontSize: '1em', color: '#fff', background: '#d35400',
                    padding: '.4rem .6rem', borderRadius: '.25rem', marginTop: '.3rem'
                }).hide().appendTo(self._elAutoSwgSummary.parent());
                // Informational (not a warning): FC is high enough that even 0% SWG won't reach
                // the target by the deadline.
                self._elAutoSwgTargetInfo = $('<div></div>').css({
                    fontSize: '1em', color: '#fff', background: '#2a6fa8',
                    padding: '.4rem .6rem', borderRadius: '.25rem', marginTop: '.3rem'
                }).hide().appendTo(self._elAutoSwgSummary.parent());
                // What the check made when you turned Away protection on or off did to the SWG %: a change you caused on purpose, so a plain note, not the red warning.
                self._elAutoSwgAwayNote = $('<div></div>').css({
                    fontSize: '1em', color: '#fff', background: '#2a6fa8',
                    padding: '.4rem .6rem', borderRadius: '.25rem', marginTop: '.3rem'
                }).hide().appendTo(self._elAutoSwgSummary.parent());
                // The calculation details (the reasoning behind what was applied) expand and collapse,
                // collapsed by default; what was applied, the pending step and every warning/info message
                // above stay visible either way.
                self._autoSwgDetailsOpen = false;
                self._elAutoSwgDetailsToggle = $('<div class="picAutoSwgDetailsToggle"></div>')
                    .css({ cursor: 'pointer', fontSize: '.85em', color: '#666', marginTop: '.3rem', userSelect: 'none' })
                    .append($('<i class="fas fa-chevron-right"></i>').css({ width: '1rem', display: 'inline-block' }))
                    .append($('<span></span>').text('Calculation details'))
                    .attr('title', 'Open the reasoning behind the last applied SWG %')
                    // Opens in the wide status popup (with the details expanded) instead of expanding inside this narrow card, where the long lines wrapped into a tall list.
                    .on('click', function () { self._showAutoSwgPopup({ openDetails: true }); })
                    .hide().appendTo(self._elAutoSwgSummary.parent());
                self._elAutoSwgDetails = $('<div></div>').css({ fontSize: '.8em', color: '#666', padding: '.15rem 0 .15rem 1rem' })
                    .hide().appendTo(self._elAutoSwgSummary.parent());
            }
            var parts = [];
            if (data.lastAppliedAt) parts.push('applied ' + data.lastAppliedPct + '% on ' + new Date(data.lastAppliedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }));
            if (data.stepAt) parts.push('Pending step: ' + describeAutoSwgStep(data, false));
            // Only present while the periodic automatic check is armed (Auto-Apply + automatic checking on).
            if (data.awayStatus === 'active') {
                var awayLine = 'Away Mode Active';
                if (typeof data.awayTargetFc === 'number') awayLine += ' -- vacation target ' + data.awayTargetFc + ' ppm';
                if (data.awayStartedAt) awayLine += ' (since ' + new Date(data.awayStartedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ')';
                self._elAutoSwgAwayBadge.text(awayLine).show();
            }
            else self._elAutoSwgAwayBadge.hide();
            if (data.awayChangeNote) self._elAutoSwgAwayNote.text('ℹ ' + data.awayChangeNote).off('click').on('click', function () { self._showAutoSwgPopup(); }).show();
            else self._elAutoSwgAwayNote.hide();
            if (data.nextAutoCheckAt) parts.push('Next auto check: ' + new Date(data.nextAutoCheckAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }));
            // One fact to a line (what is applied, what happens next, when the next check is), not one run-on line that wraps on a narrow card.
            self._elAutoSwgSummary.find('span:last').html(parts.join('<br>'));
            self._elAutoSwgSummary.show();
            if (data.lastAutoApplyLargeChange) {
                // Tapping the banner opens the calculation details; Dismiss clears it once you have seen the change (applying a reviewed result or changing the % by hand also clears it).
                self._elAutoSwgWarning.empty()
                    .append($('<span></span>').text('⚠ AUTOMATIC CHANGE EXCEEDED THRESHOLD: SWG % was changed ' + autoSwgLargeChangeText(data) + ' with no manual review -- tap to review.'))
                    .append($('<span></span>').text('Dismiss').css({ display: 'inline-block', marginLeft: '.6rem', padding: '.1rem .5rem', border: '1px solid #fff', borderRadius: '.25rem', cursor: 'pointer', fontSize: '.8em' })
                        .on('click', function (e) { e.stopPropagation(); $.putApiService('state/autoSwg/acknowledge', {}, function () { }); }))
                    .off('click').on('click', function () { self._showAutoSwgPopup(); }).show();
            }
            else self._elAutoSwgWarning.hide();
            self._elAutoSwgAlerts.empty();
            var swgAlerts = Array.isArray(data.alerts) ? data.alerts : [];
            swgAlerts.forEach(function (a) {
                var alarm = a.level === 'alarm';
                var elAlert = $('<div></div>').css({ fontWeight: 'bold', fontSize: '1em', color: '#fff', background: alarm ? '#c0392b' : '#d35400', padding: '.4rem .6rem', borderRadius: '.25rem', marginTop: '.3rem' })
                    .text('⚠ ' + a.text + (a.since ? ' (since ' + new Date(a.since).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ')' : '')).appendTo(self._elAutoSwgAlerts);
                // "njsPC was not running" is a notice, not a condition that clears itself: Dismiss hides it (applying a result you asked for does too). The outage still counts in the calculation.
                if (String(a.id || '').indexOf('outage-') === 0) {
                    $('<span></span>').text('Dismiss').css({ display: 'inline-block', marginLeft: '.6rem', padding: '.1rem .5rem', border: '1px solid #fff', borderRadius: '.25rem', cursor: 'pointer', fontSize: '.8em', fontWeight: 'normal' })
                        .on('click', function (e) { e.stopPropagation(); $.putApiService('state/autoSwg/dismissOutages', { id: a.id }, function () { }); }).appendTo(elAlert);
                }
            });
            self._elAutoSwgAlerts.toggle(swgAlerts.length > 0);
            if (data.saltNote) self._elAutoSwgSaltNote.text('ℹ ' + String(data.saltNote).split('. ')[0] + '.').attr('title', data.saltNote).off('click').on('click', function () { self._showAutoSwgPopup(); }).show();
            else self._elAutoSwgSaltNote.hide();
            var targetWarning = autoSwgTargetWarning(data);
            if (targetWarning) self._elAutoSwgTargetWarning.text('⚠ ' + targetWarning).off('click').on('click', function () { self._showAutoSwgPopup(); }).show();
            else self._elAutoSwgTargetWarning.hide();
            if (data.lastAppliedFcAnomalyNote) self._elAutoSwgAnomaly.text('⚠ Check PoolMath: an FC reading or chlorine addition may be missing -- tap for details.').off('click').on('click', function () { self._showAutoSwgPopup(); }).show();
            else self._elAutoSwgAnomaly.hide();
            if (data.lastAppliedRatingNote) self._elAutoSwgRating.text('⚠ SWG Rating may be out of date: PoolMath\'s recent SWG entries imply a different rated output -- tap for details.').off('click').on('click', function () { self._showAutoSwgPopup(); }).show();
            else self._elAutoSwgRating.hide();
            var targetInfo = autoSwgTargetInfo(data);
            if (targetInfo) self._elAutoSwgTargetInfo.text('ℹ ' + targetInfo).off('click').on('click', function () { self._showAutoSwgPopup(); }).show();
            else self._elAutoSwgTargetInfo.hide();
            // Calculation details: the rationale behind what was applied (never an unapplied preview).
            var rationale = Array.isArray(data.lastAppliedRationale) ? data.lastAppliedRationale : [];
            self._elAutoSwgDetails.empty();
            self._autoSwgHasDetails = !!(data.lastAppliedAt && rationale.length > 0);
            if (self._autoSwgHasDetails) {
                $('<div></div>').text('From the ' + data.lastAppliedPct + '% applied on ' + new Date(data.lastAppliedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ':').appendTo(self._elAutoSwgDetails);
                var detailsUl = $('<ul></ul>').css({ margin: '.15rem 0' }).appendTo(self._elAutoSwgDetails);
                rationale.forEach(function (line) { $('<li></li>').appendTo(detailsUl).text(line); });
            }
            self._applyAutoSwgDetailsState();
        },
        // Shows the calculation details only while expanded (and there are details to show).
        _applyAutoSwgDetailsState: function () {
            var self = this;
            if (!self._elAutoSwgDetailsToggle) return;
            var has = !!self._autoSwgHasDetails, open = !!self._autoSwgDetailsOpen;
            self._elAutoSwgDetailsToggle.toggle(has);
            self._elAutoSwgDetailsToggle.find('i').removeClass('fa-chevron-right fa-chevron-down').addClass(open ? 'fa-chevron-down' : 'fa-chevron-right');
            self._elAutoSwgDetails.toggle(has && open);
        },
        // Full status -- the pending step (if any) with its target date/time, the last
        // applied change, and the rationale text behind it. Like the summary line, this
        // only ever reflects what's actually applied, and doesn't repeat the current SWG %
        // shown live on the Chlorinator widget.
        _showAutoSwgPopup: function (opts) {
            var self = this;
            var data = self._lastAutoSwgData || {};
            var buttons = [
                { text: 'Open Settings', icon: '<i class="fas fa-cog"></i>', click: function () { $.pic.modalDialog.closeDialog(this); self._goToAutoSwgCheck(); } },
                { text: 'Close', icon: '<i class="far fa-window-close"></i>', click: function () { $.pic.modalDialog.closeDialog(this); } }
            ];
            var dlg = $.pic.modalDialog.createDialog('dlgAutoSwgStatus', { width: Math.min(780, Math.max(300, (window.innerWidth || 780) - 24)) + 'px', height: 'auto', title: 'Automatic SWG % Status', buttons: buttons });   // wide, so the long calculation lines wrap less and the popup is not as tall; narrower than the screen on a phone
            var addLine = function (text, style) { $('<div></div>').css($.extend({ padding: '.15rem 0' }, style || {})).text(text).appendTo(dlg); };
            if (data.awayStatus === 'active') {
                addLine('Away Mode Active' + (typeof data.awayTargetFc === 'number' ? ' -- vacation target ' + data.awayTargetFc + ' ppm' : ''), { fontWeight: 'bold', color: '#fff', background: '#117a8b', padding: '.4rem .6rem', borderRadius: '.25rem', marginBottom: '.3rem' });
            }
            if (data.awayChangeNote) addLine('ℹ ' + data.awayChangeNote, { color: '#fff', background: '#2a6fa8', padding: '.4rem .6rem', borderRadius: '.25rem', marginBottom: '.3rem' });
            if (data.lastAutoApplyLargeChange) {
                addLine('⚠ AUTOMATIC CHANGE EXCEEDED THRESHOLD: moved ' + autoSwgLargeChangeText(data) + ' with no manual review.',
                    { fontWeight: 'bold', color: '#fff', background: '#c0392b', padding: '.4rem .6rem', borderRadius: '.25rem', marginBottom: '.3rem' });
            }
            var targetWarning = autoSwgTargetWarning(data);
            if (targetWarning) {
                addLine('⚠ ' + targetWarning, { fontWeight: 'bold', color: '#fff', background: '#d35400', padding: '.4rem .6rem', borderRadius: '.25rem', marginBottom: '.3rem' });
            }
            // Only in this popup, not as a dashboard banner -- it's a caution about how reliable
            // the last apply's projection was, not something that needs attention.
            if (data.lastAppliedRatingNote) {
                addLine('⚠ ' + data.lastAppliedRatingNote, { fontWeight: 'bold', color: '#fff', background: '#d35400', padding: '.4rem .6rem', borderRadius: '.25rem', marginBottom: '.3rem' });
            }
            if (data.lastAppliedFcAnomalyNote) {
                addLine('⚠ ' + data.lastAppliedFcAnomalyNote, { color: '#fff', background: '#d35400', padding: '.4rem .6rem', borderRadius: '.25rem', marginBottom: '.3rem' });
            }
            if (data.lastAppliedStaleFcNote) {
                addLine('ℹ ' + data.lastAppliedStaleFcNote, { color: '#5a4300', background: '#ffe9a8', padding: '.4rem .6rem', borderRadius: '.25rem', marginBottom: '.3rem' });
            }
            var targetInfo = autoSwgTargetInfo(data);
            if (targetInfo) addLine('ℹ ' + targetInfo, { color: '#fff', background: '#2a6fa8', padding: '.4rem .6rem', borderRadius: '.25rem', marginBottom: '.3rem' });
            if (data.stepAt) addLine('Pending step: ' + describeAutoSwgStep(data, true), { fontWeight: 'bold', color: '#a60' });
            if (data.nextAutoCheckAt) addLine('Next automatic check: ' + new Date(data.nextAutoCheckAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }), { fontSize: '.85em', color: '#666' });
            if (data.lastAppliedAt) addLine('Last applied: ' + data.lastAppliedPct + '% on ' + new Date(data.lastAppliedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }), { fontSize: '.85em', color: '#666' });
            // The reasoning behind what was applied expands and collapses (collapsed each time the popup
            // opens); the warnings, the pending step and what was last applied above stay visible.
            if (Array.isArray(data.lastAppliedRationale) && data.lastAppliedRationale.length) {
                var detailsOpen = !!(opts && opts.openDetails);   // opened from the card's Calculation details: show them expanded
                var chevron = $('<i class="fas ' + (detailsOpen ? 'fa-chevron-down' : 'fa-chevron-right') + '"></i>').css({ width: '1rem', display: 'inline-block' });
                var detailsBody = $('<div></div>').css({ padding: '.15rem 0 .15rem 1rem' }).toggle(detailsOpen);
                $('<div></div>').css({ fontSize: '.85em', color: '#666', marginTop: '.4rem', cursor: 'pointer', userSelect: 'none' })
                    .append(chevron).append($('<span></span>').text('Calculation details'))
                    .attr('title', 'Show or hide the reasoning behind the last applied SWG %')
                    .on('click', function () {
                        detailsOpen = !detailsOpen;
                        chevron.removeClass('fa-chevron-right fa-chevron-down').addClass(detailsOpen ? 'fa-chevron-down' : 'fa-chevron-right');
                        detailsBody.toggle(detailsOpen);
                    })
                    .appendTo(dlg);
                detailsBody.appendTo(dlg);
                $('<div></div>').css({ fontSize: '.8em', color: '#666' }).text('From the ' + data.lastAppliedPct + '% applied on ' + new Date(data.lastAppliedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) + ':').appendTo(detailsBody);
                var appliedUl = $('<ul></ul>').css({ fontSize: '.8em', color: '#666', margin: '.15rem 0' }).appendTo(detailsBody);
                data.lastAppliedRationale.forEach(function (line) { $('<li></li>').appendTo(appliedUl).text(line); });
            }
            // The "Refresh & Adjust to Target" recalculation only lives on the calculation
            // screen (previews never show here on the dashboard) -- point there when it's
            // actually actionable, i.e. while a glide-to-target is still in flight.
            if (data.lastAppliedTargetDate && new Date(data.lastAppliedTargetDate).getTime() > Date.now()) {
                $('<div></div>').css({ fontSize: '.8em', color: '#666', marginTop: '.4rem', fontStyle: 'italic' }).text('Open Settings to refresh with the latest PoolMath data.').appendTo(dlg);
            }
        },
        // Opens Settings (if not already open), switches to the Chemistry tab,
        // and expands/scrolls to the AutoSwg panel's "Check Now" section. The
        // config page loads its tabs asynchronously (from /config/all) and each
        // tab's contents are built the first time it's selected, so this polls
        // briefly for each step to appear rather than assuming exact timing.
        _goToAutoSwgCheck: function () {
            var deadline = Date.now() + 6000;
            function poll(test, action) {
                var found = test();
                if (found && found.length) { action(found); return; }
                if (Date.now() > deadline) return;
                setTimeout(function () { poll(test, action); }, 150);
            }
            function selectChemistryTab() {
                poll(
                    function () { return $('div.configContainer div.picTabPanel'); },
                    function (tabs) {
                        poll(
                            function () { var t = tabs.find('div.picTab[data-tabid=tabChemistry]'); return t.length ? tabs : null; },
                            function (tabs) { tabs[0].selectTabById('tabChemistry'); scrollToAutoSwgPanel(); }
                        );
                    }
                );
            }
            function scrollToAutoSwgPanel() {
                poll(
                    function () { return $('div.cfgAutoSwg div.picAccordian'); },
                    function (acc) {
                        if (typeof acc[0].expanded === 'function') acc[0].expanded(true);
                        acc[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                );
            }
            if ($('div.dashOuter').attr('data-panel') !== 'configuration') {
                $('div.picConfigIcon').trigger('click');
            }
            selectChemistryTab();
        }
    });
    $.widget('pic.chlorinator', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].setEquipmentData = function (data) { self.setEquipmentData(data); };
            el[0].stopCountdownSuperChlor = function (data) { self.stopCountdownSuperChlor(); };
        },
        setEquipmentData: function (data) {
            var self = this, o = self.options, el = self.element;
            try {
                el.attr('data-saltrequired', data.saltRequired);
                if (data.isActive === false) el.hide();
                else el.show();
                el.attr('data-active', data.isActive === false ? false : true);
                //data.state = data.currentOutput > 0 ? 'on' : 'off';
                el.find('div.picChlorinatorState').attr('data-status', data.currentOutput > 0 ? 'on' : 'off');
                dataBinder.bind(el, data);
                let sc = el.find('div.picSuperChlor');
                if (data.superChlor) {
                    sc.show();
                    // if (o.superChlorTimer) this.stopCountdownSuperChlor();
                    if (data.superChlorRemaining > 0) {
                        if (o.superChlorTimer === null || typeof o.superChlorTimer === 'undefined') o.superChlorTimer = setInterval(function () { self.countdownSuperChlor(); }, 1000);
                        el.find('div.picSuperChlorBtn label.picSuperChlor').text('Cancel Chlorinate');
                        el.find('div.picSuperChlorBtn div.picIndicator').attr('data-status', 'on');
                    }
                }
                else {
                    if (o.superChlorTimer) this.stopCountdownSuperChlor();
                    o.superChlorTimer = null;
                    sc.hide();
                    el.find('div.picSuperChlorBtn label.picSuperChlor').text('Super Chlorinate');
                    el.find('div.picSuperChlorBtn div.picIndicator').attr('data-status', 'off');
                }
                if (typeof data.status !== 'object' || data.status.val === 128) el.find('div.picSuperChlorBtn').hide();
                else el.find('div.picSuperChlorBtn').show();
                // due to granularity of chlor time remaining, if we are <1 min off then don't reset the counter.
                // this caused a small but annoying bug where if you opened the chlorinator settings it would reset the counter to the prev value
                if (data.superChlorRemaining - el.data('remaining') <= 0 || data.superChlorRemaining - el.data('remaining') >= 60 || isNaN(el.data('remaining'))) {
                    el.data('remaining', data.superChlorRemaining);
                }
                if (typeof data.status !== 'undefined') el.attr('data-status', data.status.name);
                else el.attr('data-status', '');
            }
            catch (err) { console.log({ m: 'Error setting chlorinator data', err: err, chlor: data }); }
            var pnl = el.parents('div.picChemistry:first');
            if (pnl.find('div.picChlorinator[data-active=true], div.picChemController[data-active=true]').length > 0)
                pnl.show();
            else
                pnl.hide();
        },
        countdownSuperChlor: function () {
            var self = this, o = self.options, el = self.element;
            let rem = Math.max(el.data('remaining') - 1, 0);
            if (rem === 0 || isNaN(rem)) this.stopCountdownSuperChlor();
            el.find('span.picSuperChlorRemaining').each(function () {
                $(this).text(dataBinder.formatDuration(rem));
            });
            el.data('remaining', rem);
        },
        stopCountdownSuperChlor: function () {
            var self = this, o = self.options, el = self.element;
            clearInterval(o.superChlorTimer);
            o.superChlorTimer = null;
        },
        putPoolSetpoint: function (setPoint) {
            var self = this, o = self.options, el = self.element;
            $.putApiService('state/chlorinator/poolSetpoint', { id: parseInt(el.attr('data-id'), 10), setPoint: setPoint }, function () { });

        },
        putSpaSetpoint: function (setPoint) {
            var self = this, o = self.options, el = self.element;
            $.putApiService('state/chlorinator/spaSetpoint', { id: parseInt(el.attr('data-id'), 10), setPoint: setPoint }, function () { });

        },
        putSuperChlorHours: function (hours) {
            var self = this, o = self.options, el = self.element;
            $.putApiService('state/chlorinator/superChlorHours', { id: parseInt(el.attr('data-id'), 10), hours: hours }, function () { });

        },
        putChlorValues: function (hours) {
            var self = this, o = self.options, el = self.element;
            $.putApiService('config/chlorinator', { id: parseInt(el.attr('data-id'), 10), superChlorHours: o.superChlorHoursTarget, poolSetpoint: o.poolSetpointTarget, spaSetpoint: o.spaSetpointTarget }, function () { });
        },
        // Debounces a Pool/Spa Setpoint edit same as before, but routes it through
        // _confirmManualSwgChange rather than straight to putChlorValues, so a pending AutoSwg
        // step gets a chance to warn before it's cancelled out from under the user.
        _scheduleChlorValuesSave: function (data) {
            var self = this, o = self.options;
            if (typeof o.putChlorValuesTimer !== 'undefined' && o.putChlorValuesTimer) {
                clearTimeout(o.putChlorValuesTimer);
                o.putChlorValuesTimer = null;
            }
            o.putChlorValuesTimer = setTimeout(function () { self._confirmManualSwgChange(data); }, 1500);
        },
        // A manual Pool/Spa Setpoint change cancels any pending AutoSwg step (see
        // ChlorinatorState.onPoolSetpointChanged in njsPC) -- warn before actually submitting so
        // the user isn't surprised the pending step just disappeared, and let them back out.
        // `data` is the chlorinator state fetched when this popover opened, used to revert the
        // spinners to their pre-edit values on Cancel.
        _confirmManualSwgChange: function (data) {
            var self = this, o = self.options, el = self.element;
            $.getApiService('/state/autoSwg', null, function (result) {
                if (result && result.stepAt) {
                    $.pic.modalDialog.createConfirm('dlgConfirmManualSwgOverride', {
                        message: 'AutoSwg has a pending step (' + describeAutoSwgStep(result, true) + '). Changing the SWG % now will cancel it. Continue?',
                        width: '420px', height: 'auto', title: 'Cancel Pending AutoSwg Step?',
                        buttons: [
                            {
                                text: 'Continue', icon: '<i class="fas fa-check"></i>',
                                click: function () { $.pic.modalDialog.closeDialog(this); self.putChlorValues(); }
                            },
                            {
                                text: 'Cancel', icon: '<i class="far fa-window-close"></i>',
                                click: function () {
                                    $.pic.modalDialog.closeDialog(this);
                                    o.poolSetpointTarget = data.poolSetpoint;
                                    o.spaSetpointTarget = data.spaSetpoint;
                                    let poolSpinner = el.find('div.picValueSpinner[data-bind="poolSetpoint"]')[0];
                                    let spaSpinner = el.find('div.picValueSpinner[data-bind="spaSetpoint"]')[0];
                                    if (poolSpinner) poolSpinner.val(data.poolSetpoint);
                                    if (spaSpinner) spaSpinner.val(data.spaSetpoint);
                                }
                            }
                        ]
                    });
                }
                else self.putChlorValues();
            });
        },
        putSuperChlorinate: function (bSet) {
            var self = this, o = self.options, el = self.element;
            if (!bSet) el.find('label.picSuperChlor').text('Cancelling...');
            else el.find('label.picSuperChlor').text('Initializing...');
            el.find('div.picToggleSuperChlor > div.picIndicator').attr('data-status', 'pending');
            $.putApiService('state/chlorinator/superChlorinate', { id: parseInt(el.attr('data-id'), 10), superChlorinate: bSet }, function () { });

        },
        _buildPopover: function () {
            var self = this, o = self.options, el = self.element;
            el.on('click', function (evt) {
                if (!$.pic.icSecurity.canWrite(0)) return;
                $.getApiService('/state/chlorinator/' + el.attr('data-id'), function (data, status, xhr) {
                    console.log(data);
                    var divPopover = $('<div class="picChlorSettings"></div>');
                    divPopover.appendTo(el);
                    divPopover.on('initPopover', function (evt) {
                        let saltReqd = parseFloat(el.attr('data-saltrequired'));
                        if (saltReqd > 0) $('<div class="picSaltReqd"><i class="fas fa-bell"></i><span> Add ' + (saltReqd / 40).toFixed(2) + ' 40lb bags of salt</span></div>').appendTo(evt.contents());
                        if (data.body.val === 32 || data.body.val === 0) {
                            //let divSetpoint = $('<div class="picPoolSetpoint picSetpoint"><label class="picInline-label picSetpointText">Pool Set Point</label><div class="picValueSpinner" data-bind="poolSetpoint"></div></div>');
                            //divSetpoint.appendTo(evt.contents());
                            //divSetpoint.find('div.picValueSpinner').each(function () {
                            //    $(this).valueSpinner({ val: data.poolSetpoint, min: 0, max: 100, step: 1 });
                            //    $(this).on('change', function (e) { self.putPoolSetpoint(e.value); });
                            //});

                            $('<div></div>').appendTo(evt.contents()).css({ display: 'block' }).valueSpinner({
                                binding: 'poolSetpoint',
                                canEdit: true, labelText: 'Pool Setpoint', min: 0, max: 100, step: 1, units: '%',
                                labelAttrs: { style: { width: '7rem' } }
                            }).on('change', function (e) {
                                o.poolSetpointTarget = e.value;
                                self._scheduleChlorValuesSave(data);
                            });
                            if (data.lockSetpoints) { $('div.picValueSpinner[data-bind="poolSetpoint"]').addClass('disabled'); }
                        }
                        if (data.body.val === 32 || data.body.val === 1) {
                            // Add in the spa setpoint.
                            //let divSetpoint = $('<div class="picSpaSetpoint picSetpoint"><label class="picInline-label picSetpointText">Spa Set Point</label><div class="picValueSpinner" data-bind="spaSetpoint"></div></div>');
                            //divSetpoint.appendTo(evt.contents());
                            //divSetpoint.find('div.picValueSpinner').each(function () {
                            //    $(this).valueSpinner({ val: data.spaSetpoint, min: 0, max: 100, step: 1 });
                            //    $(this).on('change', function (e) { self.putSpaSetpoint(e.value); });
                            //});
                            $('<div></div>').appendTo(evt.contents()).css({ display: 'block' }).valueSpinner({
                                binding: 'spaSetpoint',
                                canEdit: true, labelText: 'Spa Setpoint', min: 0, max: 100, step: 1, units: '%',
                                labelAttrs: { style: { width: '7rem' } }
                            }).on('change', function (e) {
                                o.spaSetpointTarget = e.value;
                                self._scheduleChlorValuesSave(data);
                            });
                            if (data.lockSetpoints) { $('div.picValueSpinner[data-bind="spaSetpoint"]').addClass('disabled'); }
                        }

                        //let divSuperChlorHours = $('<div class="picSuperChlorHours picSetpoint"><label class="picInline-label picSetpointText">Super Chlorinate</label><div class="picValueSpinner" data-bind="superChlorHours"></div><label class="picUnits">Hours</label></div>');
                        //divSuperChlorHours.appendTo(evt.contents());
                        //divSuperChlorHours.find('div.picValueSpinner').each(function () {
                        //    $(this).valueSpinner({ val: data.superChlorHours, min: 1, max: 96, step: 1 });
                        //    $(this).on('change', function (e) { self.putSuperChlorHours(e.value); });
                        //});
                        $('<div></div>').appendTo(evt.contents()).css({ display: 'block' }).valueSpinner({
                            binding: 'superChlorHours',
                            canEdit: true, labelText: 'Super Chlorinate', min: 1, max: 96, step: 1, units: 'hours',
                            labelAttrs: { style: { width: '7rem' } }
                        }).addClass('picPoolSetpoint').addClass('picSetpoint').
                            on('change', function (e) {
                                o.superChlorHoursTarget = e.value;
                                if (typeof o.putChlorValuesTimer !== 'undefined') {
                                    clearTimeout(o.putChlorValuesTimer);
                                    o.putChlorValuesTimer = null;
                                }
                                o.putChlorValuesTimer = setTimeout(function () { self.putChlorValues() }, 1500);
                            });

                        // Add in the super chlorinate button.
                        let btn = $('<div class="picSuperChlorBtn btn"></div>');
                        btn.appendTo(evt.contents());

                        let toggle = $('<div class="picToggleSuperChlor"></div>');
                        toggle.appendTo(btn);
                        toggle.toggleButton();
                        // if current countdown timer is between 0-60s, don't reset the display
                        if (data.superChlorRemaining - el.data('remaining') > 0 && data.superChlorRemaining - el.data('remaining') < 60) {
                            data.superChlorRemaining = el.data('remaining');
                        }
                        let lbl = $('<div><div><label class="picSuperChlor">Super Chlorinate</label></div><div class="picSuperChlorRemaining"><span class="picSuperChlorRemaining" data-bind="superChlorRemaining" data-fmttype="duration"></span></div></div>');
                        lbl.appendTo(btn);
                        btn.on('click', function (e) {
                            e.preventDefault();
                            let bSet = makeBool(btn.find('div.picIndicator').attr('data-status') !== 'on');
                            self.putSuperChlorinate(bSet);
                        });
                        if (typeof data.status === 'undefined' || data.status.val === 128) btn.hide();
                        self.setEquipmentData(data);
                    });
                    divPopover.on('click', function (e) { e.stopImmediatePropagation(); e.preventDefault(); });
                    divPopover.popover({ title: 'Chlorinator Settings', popoverStyle: 'modal', placement: { target: evt.target } });
                    divPopover[0].show(evt.target);
                });
                evt.preventDefault();
                evt.stopImmediatePropagation();
            });
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.addClass('picChlorinator');
            var div = $('<div class="picChlorinatorState picIndicator"></div>');
            el.attr('data-id', o.id);
            div.appendTo(el);
            div.attr('data-ison', o.currentOutput > 0);
            div.attr('data-status', o.currentOutput > 0 ? 'on' : 'off');

            $('<label class="picChlorinatorName" data-bind="name"></label>').appendTo(el);
            $('<span class="picSaltLevel picData"><label class="picInline-label">Salt</label><span class="picSaltLevel" data-bind="saltLevel" data-fmttype="number" data-fmtmask="#,##0" data-fmtempty="----"></span><label class="picUnits">ppm</label></span>').appendTo(el);
            $('<span class="picCurrentOutput picData"><label class="picInline-label">Output</label><span class="picCurrentOutput" data-bind="currentOutput"></span><label class="picUnits">%</label></span>').appendTo(el);

            $('<div class="picChlorStatus picData"><span class="picStatus" data-bind="status.desc"></span></div>').appendTo(el);
            $('<div class="picSuperChlor picData"><label class="picInline-label">Super Chlor:</label><span class="picSuperChlorRemaining" data-bind="superChlorRemaining" data-fmttype="duration"></span></div>').appendTo(el);
            self.setEquipmentData(o);
            self._buildPopover();
        }
    });
    $.widget('pic.chemController', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].setEquipmentData = function (data) { self.setEquipmentData(data); };
        },
        setDosingStatus: function (stat, chem, type) {
            var self = this, o = self.options, el = self.element;
            if (typeof chem === 'undefined' || typeof chem.dosingStatus === 'undefined' || chem.enabled === false)
                stat.hide();
            else {
                switch (chem.dosingStatus.name) {
                    case 'dosing':
                        stat.empty();
                        var vol = !isNaN(chem.doseVolume) ? chem.doseVolume : 0;
                        var volDosed = !isNaN(chem.dosingVolumeRemaining) ? vol - chem.dosingVolumeRemaining : 0;
                        if (chem.delayTimeRemaining > 0) {
                            if (type === 'ORP' && chem.useChlorinator) {
                                $('<span></span>').appendTo(stat).text(`Chlorinating: ${vol.format('#,#0.####0')}lbs`);
                            }
                            else
                                $('<span></span>').appendTo(stat).text(`Dosing ${type}: ${vol.format('#,##0')}mL`);
                            $('<span></span>').appendTo(stat).css({ float: 'right' }).text(`Delay: ${dataBinder.formatDuration(chem.delayTimeRemaining)}`);
                        }
                        else {
                            if (type === 'ORP' && chem.useChlorinator) {
                                $('<span></span>').appendTo(stat).text(`Chlorinating: ${volDosed.format('#,#0.####0')}lbs of ${vol.format('#,#0.####0')}lbs - ${dataBinder.formatDuration(chem.dosingTimeRemaining)}`);
                            }
                            else
                                $('<span></span>').appendTo(stat).text(`Dosing ${type}: ${volDosed.format('#,##0')}mL of ${vol.format('#,##0')}mL - ${dataBinder.formatDuration(chem.dosingTimeRemaining)}`);
                        }
                        stat.show();
                        break;
                    case 'mixing':
                        stat.empty();
                        $('<span></span>').appendTo(stat).text(`Mixing ${type}: ${dataBinder.formatDuration(chem.mixTimeRemaining)}`);
                        stat.show();
                        break;
                    default:
                        stat.hide();
                        break;
                }
            }
        },
        setWarnings: function (data) {
            var self = this, o = self.options, el = self.element;
            var arr = [];
            // Put together the list of warnings.
            if (typeof data.status !== 'undefined' && data.status.val > 0) arr.push(data.status);
            if (typeof data.alarms !== 'undefined') {
                var alarms = data.alarms;
                if (typeof alarms.freezeProtect !== 'undefined' && alarms.freezeProtect.val > 0) arr.push(alarms.freezeProtect);
                if (typeof alarms.flowSensorFault !== 'undefined' && alarms.flowSensorFault.val > 0) arr.push(alarms.flowSensorFault);
                if (typeof alarms.pHPumpFault !== 'undefined' && alarms.pHPumpFault.val > 0) arr.push(alarms.pHPumpFault);
                if (typeof alarms.pHProbeFault !== 'undefined' && alarms.pHProbeFault.val > 0) arr.push(alarms.pHProbeFault);
                if (typeof alarms.orpPumpFault !== 'undefined' && alarms.orpPumpFault.val > 0) arr.push(alarms.orpPumpFault);
                if (typeof alarms.orpProbeFault !== 'undefined' && alarms.orpProbeFault.val > 0) arr.push(alarms.orpProbeFault);
                if (typeof alarms.chlorFault !== 'undefined' && alarms.chlorFault.val > 0) arr.push(alarms.chlorFault);
                if (typeof alarms.bodyFault !== 'undefined' && alarms.bodyFault.val > 0) arr.push(alarms.bodyFault);
                if (typeof alarms.flow !== 'undefined' && alarms.flow.val > 0) arr.push(alarms.flow);
                if (typeof alarms.pH !== 'undefined' && alarms.pH.val > 0) arr.push(alarms.pH);
                if (typeof alarms.pHTank !== 'undefined' && alarms.pHTank.val > 0) arr.push(alarms.pHTank);
                if (typeof alarms.orp !== 'undefined' && alarms.orp.val > 0) arr.push(alarms.orp);
                if (typeof alarms.orpTank !== 'undefined' && alarms.orpTank.val > 0) arr.push(alarms.orpTank);
            }
            if (typeof data.warnings !== 'undefined') {
                var warns = data.warnings;
                if (typeof warns.waterChemistry !== 'undefined' && warns.waterChemistry.val > 0) arr.push(warns.waterChemistry);
                if (typeof warns.chlorinatorCommError !== 'undefined' && warns.chlorinatorCommError.val > 0) arr.push(warns.chlorinatorCommError);
                if (typeof warns.invalidSetup !== 'undefined' && warns.invalidSetup.val > 0 && warns.invalidSetup.name !== 'ok') arr.push(warns.invalidSetup);
                if (typeof warns.pHDailyLimitReached !== 'undefined' && warns.pHDailyLimitReached.val > 0) arr.push(warns.pHDailyLimitReached);
                if (typeof warns.pHLockout !== 'undefined' && warns.pHLockout.val > 0) arr.push(warns.pHLockout);
                if (typeof warns.orpDailyLimitReached !== 'undefined' && warns.orpDailyLimitReached.val > 0) arr.push(warns.orpDailyLimitReached);
            }
            var divWarnings = el.find('div.chemcontroller-warnings');
            divWarnings.empty();
            if (arr.length > 0) divWarnings.show();
            else divWarnings.hide();
            for (var i = 0; i < arr.length; i++) {
                var w = arr[i];
                var warn = $('<div></div>').addClass('chemcontroller-warning').appendTo(divWarnings);
                // Add in the icon.
                $('<i></i>').addClass('fas').addClass('fa-exclamation-triangle').appendTo(warn);
                $('<span></span>').addClass('chemcontroller-warning-text').text(w.desc).appendTo(warn);
            }
        },
        setEquipmentData: function (data) {
            var self = this, o = self.options, el = self.element;
            try {
                if (data.isActive === false) el.hide();
                else el.show();
                el.attr('data-active', data.isActive === false ? false : true);
                var ph = typeof data.ph !== 'undefined' && typeof data.ph.pump !== 'undefined' && data.ph.pump.isDosing ? true : false;
                var orp = typeof data.orp !== 'undefined' && typeof data.orp.pump !== 'undefined' && data.orp.pump.isDosing ? true : false;
                el.find('div.picChemControllerState').attr('data-status', ph || orp ? 'on' : 'off');
                let siTitle = typeof data.siCalcType === 'undefined' || data.siCalcType.name === 'undefined' ? 'Bal' : data.siCalcType.name === 'lsi' ? 'LSI' : 'CSI';
                //console.log(data);
                el.find('label.siTitle').each(function () {
                    $(this).text(siTitle);
                });

                dataBinder.bind(el, data);
                if (typeof data.status !== 'undefined') el.attr('data-status', data.status.name);
                else el.attr('data-status', '');
            }
            catch (err) { console.log({ m: 'Error setting chem controller data', err: err, chem: data }); }
            var pnl = el.parents('div.picChemistry:first');
            if (pnl.find('div.picChlorinator[data-active=true], div.picChemController[data-active=true]').length > 0) {
                pnl.show();
                // Now lets add in our status.
                self.setDosingStatus(el.find('div.chemcontroller-status-ph'), data.ph, 'pH');
                self.setDosingStatus(el.find('div.chemcontroller-status-orp'), data.orp, 'ORP');
                self.setWarnings(data);
            }
            else
                pnl.hide();
        },
        _buildPopover: function () {
            var self = this, o = self.options, el = self.element;
            el.on('click', function (evt) {
                if (!$.pic.icSecurity.canWrite(0)) return;
                $.getApiService('/state/chemController/' + el.attr('data-id'), function (data, status, xhr) {
                    console.log(data);
                    var divPopover = $('<div class="picChemControllerSettings"></div>');
                    divPopover.appendTo(el);
                    divPopover.on('initPopover', function (evt) {
                        var divSettings = $('<div></div>').appendTo(evt.contents()).css({ display: 'inline-block', verticalAlign: 'top', width: '347px' }).chemControllerSettings(data);
                    });
                    divPopover.on('click', function (e) { e.stopImmediatePropagation(); e.preventDefault(); });
                    divPopover.popover({ title: 'Chemistry Settings', popoverStyle: 'modal', placement: { target: evt.target } });
                    divPopover[0].show(evt.target);
                });
                evt.preventDefault();
                evt.stopImmediatePropagation();
            });
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.addClass('picChemController');
            el.attr('data-id', o.id);

            var line = $('<div class="chemControllerDiv"></div>').appendTo(el);
            var div = $('<div class="picChemControllerState picIndicator"></div>');
            div.appendTo(line);
            $('<label></label>').addClass('picControllerName').attr('data-bind', 'name').appendTo(line);
            let span = $('<span></span>').addClass('pHLevel').addClass('picData').appendTo(line);
            $('<label></label>').addClass('picInline-label').text('pH').appendTo(line);
            $('<span></span>').addClass('phLevel').attr('data-bind', 'ph.level').attr('data-fmttype', 'number').attr('data-fmtmask', '#,##0.0#').attr('data-emptymask', '-.-').appendTo(line);
            span = $('<span></span>').addClass('orpLevel').addClass('picData').appendTo(line);
            $('<label></label>').addClass('picInline-label').text('ORP').appendTo(line);
            $('<span></span>').addClass('phLevel').attr('data-bind', 'orp.level').attr('data-fmttype', 'number').attr('data-fmtmask', '#,##0.0').attr('data-emptymask', '-.-').appendTo(line);
            span = $('<span></span>').addClass('lsiIndex').addClass('picData').appendTo(line);
            $('<label></label>').addClass('picInline-label').addClass('siTitle').text('Bal').appendTo(line);
            $('<span></span>').addClass('saturationIndex').attr('data-bind', 'saturationIndex').attr('data-fmttype', 'number').attr('data-fmtmask', '#,##0.0#').attr('data-emptymask', '-.-').appendTo(line);

            //$('<span class="orpLevel picData"><label class="picInline-label">ORP</label><span class="orpLevel" data-bind="orp.probe.level"></span></span>').appendTo(line);
            //$('<span class="lsiIndex picData"><label class="picInline-label">Bal</label><span class="saturationIndex" data-bind="saturationIndex"></span></span>').appendTo(line);

            //$('<div class="picChlorStatus picData"><span class="picStatus" data-bind="status.desc"></span></div>').appendTo(el);
            $('<div></div>').addClass('chemcontroller-status').addClass('chemcontroller-status-ph').appendTo(el).hide();
            $('<div></div>').addClass('chemcontroller-status').addClass('chemcontroller-status-orp').appendTo(el).hide();
            $('<div></div>').addClass('chemcontroller-warnings').appendTo(el).hide();
            self.setEquipmentData(o);
            self._buildPopover();
        }
    });
    $.widget('pic.chemDoser', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].setEquipmentData = function (data) { self.setEquipmentData(data); };
        },
        setDosingStatus: function (stat, chem) {
            var self = this, o = self.options, el = self.element;
            if (typeof chem === 'undefined' || typeof chem.dosingStatus === 'undefined' || chem.enabled === false)
                stat.hide();
            else {
                switch (chem.dosingStatus.name) {
                    case 'dosing':
                        stat.empty();
                        var vol = !isNaN(chem.doseVolume) ? chem.doseVolume : 0;
                        var volDosed = !isNaN(chem.dosingVolumeRemaining) ? vol - chem.dosingVolumeRemaining : 0;
                        if (chem.delayTimeRemaining > 0) {
                            $('<span></span>').appendTo(stat).text(`Dosing: ${vol.format('#,##0')}mL`);
                            $('<span></span>').appendTo(stat).css({ float: 'right' }).text(`Delay: ${dataBinder.formatDuration(chem.delayTimeRemaining)}`);
                        }
                        else {
                            $('<span></span>').appendTo(stat).text(`Dosing: ${volDosed.format('#,##0')}mL of ${vol.format('#,##0')}mL - ${dataBinder.formatDuration(chem.dosingTimeRemaining)}`);
                        }
                        stat.show();
                        break;
                    case 'mixing':
                        stat.empty();
                        $('<span></span>').appendTo(stat).text(`Mixing: ${dataBinder.formatDuration(chem.mixTimeRemaining)}`);
                        stat.show();
                        break;
                    default:
                        stat.hide();
                        break;
                }
            }
        },
        setWarnings: function (data) {
            var self = this, o = self.options, el = self.element;
            var arr = [];
            // Put together the list of warnings.
            if (typeof data.status !== 'undefined' && data.status.val > 0) arr.push(data.status);
            if (typeof data.alarms !== 'undefined') {
                var alarms = data.alarms;
                if (typeof alarms.freezeProtect !== 'undefined' && alarms.freezeProtect.val > 0) arr.push(alarms.freezeProtect);
                if (typeof alarms.flowSensorFault !== 'undefined' && alarms.flowSensorFault.val > 0) arr.push(alarms.flowSensorFault);
                if (typeof alarms.pumpFault !== 'undefined' && alarms.pumpFault.val > 0) arr.push(alarms.pumpFault);
                if (typeof alarms.bodyFault !== 'undefined' && alarms.bodyFault.val > 0) arr.push(alarms.bodyFault);
                if (typeof alarms.flow !== 'undefined' && alarms.flow.val > 0) arr.push(alarms.flow);
                if (typeof alarms.tank !== 'undefined' && alarms.tank.val > 0) arr.push(alarms.tank);
            }
            if (typeof data.warnings !== 'undefined') {
                var warns = data.warnings;
                if (typeof warns.chlorinatorCommError !== 'undefined' && warns.chlorinatorCommError.val > 0) arr.push(warns.chlorinatorCommError);
                if (typeof warns.invalidSetup !== 'undefined' && warns.invalidSetup.val > 0 && warns.invalidSetup.name !== 'ok') arr.push(warns.invalidSetup);
                if (typeof warns.dailyLimitReached !== 'undefined' && warns.dailyLimitReached.val > 0) arr.push(warns.dailyLimitReached);
                if (typeof warns.lockout !== 'undefined' && warns.lockout.val > 0) arr.push(warns.lockout);
            }
            var divWarnings = el.find('div.chemdoser-warnings');
            divWarnings.empty();
            if (arr.length > 0) divWarnings.show();
            else divWarnings.hide();
            for (var i = 0; i < arr.length; i++) {
                var w = arr[i];
                var warn = $('<div></div>').addClass('chemdoser-warning').appendTo(divWarnings);
                // Add in the icon.
                $('<i></i>').addClass('fas').addClass('fa-exclamation-triangle').appendTo(warn);
                $('<span></span>').addClass('chemcontroller-warning-text').text(w.desc).appendTo(warn);
            }
        },
        setEquipmentData: function (data) {
            var self = this, o = self.options, el = self.element;
            try {
                if (data.isActive === false) el.hide();
                else el.show();
                el.attr('data-active', data.isActive === false ? false : true);
                el.find('div.picChemDoserState').attr('data-status', data.pump.isDosing ? 'on' : 'off');
                dataBinder.bind(el, data);
                if (typeof data.status !== 'undefined') el.attr('data-status', data.status.name);
                else el.attr('data-status', '');
            }
            catch (err) { console.log({ m: 'Error setting chem doser data', err: err, chem: data }); }
            var pnl = el.parents('div.picChemistry:first');
            if (pnl.find('div.picChlorinator[data-active=true], div.picChemDoser[data-active=true]').length > 0) {
                pnl.show();
                // Now lets add in our status.
                self.setDosingStatus(el.find('div.chemdoser-status'), data);
                self.setWarnings(data);
            }
            else
                pnl.hide();
        },
        _buildPopover: function () {
            var self = this, o = self.options, el = self.element;
            el.on('click', function (evt) {
                if (!$.pic.icSecurity.canWrite(0)) return;
                $.getApiService('/state/chemDoser/' + el.attr('data-id'), function (data, status, xhr) {
                    console.log(data);
                    var divPopover = $('<div class="picChemDoserSettings"></div>');
                    divPopover.appendTo(el);
                    divPopover.on('initPopover', function (evt) {
                        var divSettings = $('<div></div>').appendTo(evt.contents()).css({ display: 'inline-block', verticalAlign: 'top', width: '347px' }).chemDoserSettings(data);
                    });
                    divPopover.on('click', function (e) { e.stopImmediatePropagation(); e.preventDefault(); });
                    divPopover.popover({ title: 'Chemistry Settings', popoverStyle: 'modal', placement: { target: evt.target } });
                    divPopover[0].show(evt.target);
                });
                evt.preventDefault();
                evt.stopImmediatePropagation();
            });
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.addClass('picChemDoser');
            el.attr('data-id', o.id);

            var line = $('<div class="chemDoserDiv"></div>').appendTo(el);
            var div = $('<div class="picChemDoserState picIndicator"></div>');
            div.appendTo(line);
            $('<label></label>').addClass('picDoserName').attr('data-bind', 'name').appendTo(line);
            var last24 = $('<div></div>').css({ display: 'inline-block', float: 'right' }).appendTo(line);
            $('<span></span>').addClass('picData').text(`Last 24 hours `).appendTo(last24);
            $('<span></span>').addClass('picData').attr('data-bind', 'dailyVolumeDosed').attr('data-fmttype', 'number').attr('data-fmtmask', '#,##0.0#').attr('data-emptymask', '--.--').appendTo(last24);
            $('<span></span>').addClass('picUnits').text('mL').appendTo(last24);
            $('<div></div>').addClass('chemdoser-status').appendTo(el).hide();
            $('<div></div>').addClass('chemdoser-warnings').appendTo(el).hide();
            self.setEquipmentData(o);
            self._buildPopover();
        }
    });
    $.widget('pic.chemControllerSettings', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].setEquipmentData = function (data) { self.setEquipmentData(data); };
        },
        setEquipmentData: function (data) {
            var self = this, o = self.options, el = self.element;
            //console.log(data);
            el.find('div.picChemLevel[data-chemtype="pH"]').each(function () { this.val(data.ph.level); });
            el.find('div.picChemLevel[data-chemtype="ORP"]').each(function () { this.val(data.orp.level); });
            if (typeof data.orp.pump.type !== 'undefined' && typeof data.ph.pump.type !== 'undefined') {
                if (data.orp.doserType.val === 0 && data.ph.doserType.val === 0) el.find('div.chem-daily').hide();
                else el.find('div.chem-daily').show();
            }
            if (typeof data.orp.pump.type !== 'undefined') {
                if ((data.orp.enabled && (data.orp.pump.type.name !== 'none' || data.orp.doserType.val === 1) && data.orp.useChlorinator !== true)) {
                    el.find('div.picChemTank[data-chemtype="orp"]').show();
                    el.find('div.daily-dose[data-chemtype="orp"]').show();
                }
                else {
                    el.find('div.picChemTank[data-chemtype="orp"]').hide();
                    el.find('div.daily-dose[data-chemtype="orp"]').hide();
                }
            }
            if (typeof data.ph.pump.type !== 'undefined') {
                if ((data.ph.enabled && (data.ph.pump.type.name !== 'none' || data.orp.doserType.val === 1))) {
                    el.find('div.picChemTank[data-chemtype="acid"]').show();
                    el.find('div.daily-dose[data-chemtype="acid"]').show();
                }
                else {
                    el.find('div.picChemTank[data-chemtype="acid"]').hide();
                    el.find('div.daily-dose[data-chemtype="acid"]').hide();
                }
            }
            let siTitle = typeof data.siCalcType === 'undefined' || data.siCalcType.name === 'undefined' ? 'Water Balance' : data.siCalcType.name === 'lsi' ? 'LSI Balance' : 'CSI Balance';
            el.find('div.chem-balance-label').text(siTitle);
            //el.find('div.chem-balance-label').each(function () {
            //    $(this).text(siTitle);
            //});
            // If this is IntelliChem then all the manual dosing buttons need to go away.  We don't have
            // control over this for IntelliChem.
            if (typeof data.type === 'undefined' || data.type.name === 'intellichem') {
                el.find('div#btnCancelAcid').hide();
                el.find('div#btnCancelMixAcid').hide();
                el.find('div#btnMixAcid').hide();
                el.find('div#btnDoseAcid').hide();
                el.find('div#btnCancelOrp').hide();
                el.find('div#btnCancelMixOrp').hide();
                el.find('div#btnMixOrp').hide();
                el.find('div#btnDoseOrp').hide();
            }
            else {
                // If we are dosing I need to kill the manual dose window as well as change the buttons
                // to stop dosing.
                if (typeof data.ph !== 'undefined' && typeof data.ph.dosingStatus !== 'undefined') {
                    // We can be monitoring, mixing, or dosing.
                    // If we are monitoring we can mix or dose.
                    if (data.ph.dosingStatus.name === 'monitoring') {
                        el.find('div#btnCancelAcid').hide();
                        el.find('div#btnCancelMixAcid').hide();
                        // Don't let an idiot dose when the pool is off or flow is not detected.
                        if (data.flowDetected === true && data.isBodyOn === true) el.find('div#btnDoseAcid').show();
                        else el.find('div#btnDoseAcid').hide();
                        // The chem controller will take care of the countdown for mixing if the
                        // settings are to mix only when flow is detected in the specified body.
                        el.find('div#btnMixAcid').show();
                    }
                    else if (data.ph.dosingStatus.name === 'dosing') {
                        el.find('div#btnCancelAcid').show();
                        el.find('div#btnCancelMixAcid').hide();
                        el.find('div#btnDoseAcid').hide();
                        // If we are dosing the user can cancel the dose by starting the mix.
                        el.find('div#btnMixAcid').show();
                    }
                    else if (data.ph.dosingStatus.name === 'mixing') {
                        el.find('div#btnCancelAcid').hide();
                        el.find('div#btnCancelMixAcid').show();
                        el.find('div#btnMixAcid').hide();
                        if (data.flowDetected === true && data.isBodyOn === true) el.find('div#btnDoseAcid').show();
                    }
                    else {
                        // No one knows what is going on so hide all the manual buttons.
                        el.find('div#btnCancelAcid').hide();
                        el.find('div#btnCancelMixAcid').hide();
                        el.find('div#btnMixAcid').hide();
                        el.find('div#btnDoseAcid').hide();
                    }

                    //if (data.ph.dosingStatus.name !== 'dosing') {
                    //    // Change the button to stop dosing.
                    //    if (data.flowDetected === false || data.isBodyOn === false)
                    //        el.find('div#btnDoseAcid').hide();
                    //    else
                    //        el.find('div#btnDoseAcid').show();
                    //    el.find('div#btnCancelAcid').hide();
                    //}
                    //else {
                    //    el.find('div#btnCancelAcid').show();
                    //    el.find('div#btnDoseAcid').hide();
                    //}
                }
                if (typeof data.orp !== 'undefined' && typeof data.orp.dosingStatus !== 'undefined') {
                    if (data.orp.dosingStatus.name === 'monitoring') {
                        el.find('div#btnCancelOrp').hide();
                        el.find('div#btnCancelMixOrp').hide();
                        // Don't let an idiot dose when the pool is off or flow is not detected.
                        if (data.flowDetected === true && data.isBodyOn === true) el.find('div#btnDoseOrp').show();
                        else el.find('div#btnDoseOrp').hide();
                        // The chem controller will take care of the countdown for mixing if the
                        // settings are to mix only when flow is detected in the specified body.
                        el.find('div#btnMixOrp').show();
                    }
                    else if (data.orp.dosingStatus.name === 'dosing') {
                        el.find('div#btnCancelOrp').show();
                        el.find('div#btnCancelMixOrp').hide();
                        el.find('div#btnDoseOrp').hide();
                        // If we are dosing the user can cancel the dose by starting the mix.
                        el.find('div#btnMixOrp').show();
                    }
                    else if (data.orp.dosingStatus.name === 'mixing') {
                        el.find('div#btnCancelOrp').hide();
                        el.find('div#btnCancelMixOrp').show();
                        el.find('div#btnMixOrp').hide();
                        if (data.flowDetected === true && data.isBodyOn === true) el.find('div#btnDoseOrp').show();
                    }
                    else {
                        // No one knows what is going on so hide all the manual buttons.
                        el.find('div#btnCancelOrp').hide();
                        el.find('div#btnCancelMixOrp').hide();
                        el.find('div#btnMixOrp').hide();
                        el.find('div#btnDoseOrp').hide();
                    }

                    //if (data.orp.dosingStatus.name !== 'dosing') {
                    //    // Change the button to stop dosing.
                    //    if (data.flowDetected === false || data.isBodyOn === false)
                    //        el.find('div#btnDoseOrp').hide();
                    //    else
                    //        el.find('div#btnDoseOrp').show();
                    //    el.find('div#btnCancelOrp').hide();
                    //}
                    //else {
                    //    el.find('div#btnCancelOrp').show();
                    //    el.find('div#btnDoseOrp').hide();
                    //}
                }
            }
            self.dataBind(data);
        },
        dataBind: function (data) {
            var self = this, o = self.options, el = self.element;
            var ph = data.ph;
            var orp = data.orp;
            if (typeof ph !== 'undefined' && typeof ph.tolerance !== 'undefined') {
                el.find('div.picChemLevel[data-chemtype="pH"]').each(function () {
                    this.scales([
                        { class: 'chemLevel-lred', min: 6.7, max: ph.tolerance.low - .2, labelEnd: (ph.tolerance.low - .2).format('0.0') },
                        { class: 'chemLevel-lyellow', min: ph.tolerance.low - .2, max: ph.tolerance.low, labelEnd: ph.tolerance.low.format('0.0') },
                        { class: 'chemLevel-green', min: ph.tolerance.low, max: ph.tolerance.high, labelEnd: ph.tolerance.high.format('0.0') },
                        { class: 'chemLevel-ryellow', min: ph.tolerance.high, max: ph.tolerance.high + .2, labelEnd: (ph.tolerance.high + .2).format('0.0') },
                        { class: 'chemLevel-rred', min: ph.tolerance.high + .2, max: 8.4, labelEnd: '' }]);
                });
            }
            if (typeof orp !== 'undefined' && typeof orp.tolerance !== 'undefined') {
                el.find('div.picChemLevel[data-chemtype="ORP"]').each(function () {
                    this.scales([
                        { class: 'chemLevel-lred', min: 400, max: orp.tolerance.low - 150, labelEnd: (orp.tolerance.low - 150).format('0') },
                        { class: 'chemLevel-lyellow', min: orp.tolerance.low - 150, max: orp.tolerance.low, labelEnd: orp.tolerance.low.format('0') },
                        { class: 'chemLevel-green', min: orp.tolerance.low, max: orp.tolerance.high, labelEnd: orp.tolerance.high.format('0') },
                        { class: 'chemLevel-ryellow', min: orp.tolerance.high, max: orp.tolerance.high + 100, labelEnd: (orp.tolerance.high + 100).format('0') },
                        { class: 'chemLevel-rred', min: orp.tolerance.high + 100, max: 1000, labelEnd: '' }
                    ]);

                });
            }
            dataBinder.bind(el, data);
        },
        _createTankAttributesDialog(chemType, tankElem) {
            var self = this, o = self.options, el = self.element;
            var tank = tankElem[0].tank();
            console.log(tank);
            var chemName = tank.chemType ? tank.chemType.charAt(0).toUpperCase() + tank.chemType.slice(1) : chemType;
            var dlg = $.pic.modalDialog.createDialog('dlgChemTankAttributes', {
                width: '447px',
                height: 'auto',
                title: `${chemName} Supply Tank Level`,
                position: { my: "center bottom", at: "center top", of: el },
                buttons: [
                    {
                        text: 'Save', icon: '<i class="fas fa-save"></i>',
                        click: function (e) {
                            var t = { id: parseInt(el.attr('data-eqid'), 10) };
                            t[chemType.toLowerCase()] = { tank: dataBinder.fromElement(dlg) };
                            $.pic.modalDialog.closeDialog(this);
                            $.putApiService('/state/chemController', t, function (c, status, xhr) {
                                self.setEquipmentData(c);
                            });
                        }
                    },
                    {
                        text: 'Cancel', icon: '<i class="far fa-window-close"></i>',
                        click: function () { $.pic.modalDialog.closeDialog(this); }
                    }
                ]
            });
            $('<div></div>').appendTo(dlg).html(`Set the current level for the tank.  As ${chemName.toLowerCase()} is pumped from the tank the level will be reduced by the amount of the chemical dose.`);
            $('<hr></hr>').appendTo(dlg).css({ margin: '2px' });
            var divPnl = $('<div></div>').appendTo(dlg).css({ display: 'inline-block' });
            var line = $('<div></div>').appendTo(divPnl);

            var capacity = $('<div></div>').appendTo(line).staticField({
                labelText: 'Capacity', dataType: 'number',
                units: tank.units, value: tank.capacity, fmtMask: '#,##0.###',
                labelAttrs: { style: { width: '4.7rem' } }
            });
            line = $('<div></div>').appendTo(divPnl);
            var qty = $('<div></div>').appendTo(line).valueSpinner({
                canEdit: true, labelText: 'Level', binding: 'level', min: 0, max: tank.capacity, step: tankElem[0].incrementStep(),
                fmtMask: tankElem.attr('data-fmtMask'),
                labelAttrs: { style: { width: '4.7rem' } },
                inputAttrs: { style: { width: '7rem' } }
            }).on('change', function (e) {
                pct.text(`${capacity[0].val() !== 0 ? Math.round((qty[0].val() / capacity[0].val()) * 100) : 0}%`);
            });

            divPnl = $('<div></div>').appendTo(dlg).css({ display: 'inline-block' });
            let pct = $('<div></div>').appendTo(divPnl).addClass('tank-attr-percent').css({ fontSize: '2em', textAlign: 'center', padding: '.5em' });
            dataBinder.bind(dlg, tank);
            pct.text(`${tank.capacity !== 0 ? Math.round((tank.level / tank.capacity) * 100) : 0}%`);
            dlg.css({ overflow: 'visible' });
        },
        _createManualDoseDialog(chemical, chemType, elBtn) {
            var self = this, o = self.options, el = self.element;
            var chemName = chemical.charAt(0).toUpperCase() + chemical.slice(1);
            var dlg = $.pic.modalDialog.createDialog('dlgManualChemDose', {
                width: '357px',
                height: 'auto',
                title: `Start Manual ${chemName} Dose`,
                position: { my: "center top", at: "center top", of: el },
                buttons: [
                    {
                        text: 'Start Dosing', icon: '<i class="fas fa-fill-drip"></i>',
                        click: function (e) {
                            var d = dataBinder.fromElement(dlg);
                            d = $.extend(true, d, { id: parseInt(el.attr('data-eqid'), 10), chemType: chemType });
                            console.log(d);
                            $.pic.modalDialog.closeDialog(this);
                            $.putApiService('/state/chemController/manualDose', d, function (c, status, xhr) {
                                self.setEquipmentData(c);
                            });
                        }
                    },
                    {
                        text: 'Cancel', icon: '<i class="far fa-window-close"></i>',
                        click: function () { $.pic.modalDialog.closeDialog(this); }
                    }
                ]
            });
            $('<div></div>').appendTo(dlg).html(`Supply a manual ${chemName.toLowerCase()} dose amount in mL.  Then press the Start Dosing button.`);
            $('<hr></hr>').appendTo(dlg).css({ margin: '2px' });
            var divPnl = $('<div></div>').appendTo(dlg).css({ display: 'inline-block' });
            var line = $('<div></div>').appendTo(divPnl);
            $('<div></div>').appendTo(line).valueSpinner({
                canEdit: true, labelText: 'Dose Amount', binding: 'volume', min: 0, max: 1000, step: 10,
                fmtMask: '#,##0', units: 'mL',
                labelAttrs: { style: { marginRight: '.15rem' } },
                inputAttrs: { style: { width: '7rem' } }
            }).on('change', function (e) {

            });
            divPnl = $('<div></div>').appendTo(dlg).css({ display: 'inline-block' });
            dlg.css({ overflow: 'visible' });
        },
        _createManualMixDialog(chemical, chemType, elBtn) {
            var self = this, o = self.options, el = self.element;
            var chemName = chemical.charAt(0).toUpperCase() + chemical.slice(1);
            var dlg = $.pic.modalDialog.createDialog('dlgManualChemMix', {
                width: '357px',
                height: 'auto',
                title: `Start Manual ${chemName} Mix`,
                position: { my: "center top", at: "center top", of: el },
                buttons: [
                    {
                        text: 'Start Mixing', icon: '<i class="fas fa-blender"></i>',
                        click: function (e) {
                            var d = dataBinder.fromElement(dlg);
                            d = $.extend(true, d, { id: parseInt(el.attr('data-eqid'), 10), chemType: chemType });
                            console.log(d);
                            $.pic.modalDialog.closeDialog(this);
                            $.putApiService('/state/chemController/manualMix', d, function (c, status, xhr) {
                                self.setEquipmentData(c);
                            });
                        }
                    },
                    {
                        text: 'Cancel', icon: '<i class="far fa-window-close"></i>',
                        click: function () { $.pic.modalDialog.closeDialog(this); }
                    }
                ]
            });
            $('<div></div>').appendTo(dlg).html(`Supply the ${chemName.toLowerCase()} mixing time in hours and minutes.  Then press the Start Mixing button.`);
            $('<hr></hr>').appendTo(dlg).css({ margin: '2px' });
            var divPnl = $('<div></div>').appendTo(dlg).css({ display: 'inline-block' });
            var line = $('<div></div>').appendTo(divPnl);
            $('<div></div>').appendTo(line).valueSpinner({
                canEdit: true, labelText: 'Mixing Time', binding: 'hours', min: 0, max: 48, step: 1,
                fmtMask: '#,##0', units: 'hrs',
                labelAttrs: { style: { marginRight: '.15rem' } },
                inputAttrs: { style: { width: '3rem' } }
            }).on('change', function (e) {

            });
            $('<div></div>').appendTo(line).valueSpinner({
                canEdit: true, labelText: '', binding: 'minutes', min: 0, max: 59, step: 1,
                fmtMask: '#,##0', units: 'min',
                labelAttrs: { style: { marginRight: '.15rem' } },
                inputAttrs: { style: { width: '3rem' } }
            }).on('change', function (e) {

            });

            divPnl = $('<div></div>').appendTo(dlg).css({ display: 'inline-block' });
            dlg.css({ overflow: 'visible' });
        },
        _confirmCancelDose: function (chemical, chemType) {
            var self = this, o = self.options, el = self.element;
            $.pic.modalDialog.createConfirm('dlgConfirmCancelDosing', {
                message: `Are you sure you want to Cancel ${chemical} dosing?`,
                width: '350px',
                height: 'auto',
                title: 'Confirm Cancel Dosing',
                buttons: [{
                    text: 'Yes', icon: '<i class="fas fa-trash"></i>',
                    click: function () {
                        var d = { id: parseInt(el.attr('data-eqid'), 10), chemType: chemType };
                        console.log(d);
                        $.pic.modalDialog.closeDialog(this);
                        $.putApiService('/state/chemController/cancelDosing', d, function (c, status, xhr) {
                            self.setEquipmentData(c);
                        });
                    }
                },
                {
                    text: 'No', icon: '<i class="far fa-window-close"></i>',
                    click: function () { $.pic.modalDialog.closeDialog(this); }
                }]
            });
        },
        _confirmCancelMix: function (chemical, chemType) {
            var self = this, o = self.options, el = self.element;
            $.pic.modalDialog.createConfirm('dlgConfirmCancelDosing', {
                message: `Are you sure you want to Cancel ${chemical} mixing?`,
                width: '350px',
                height: 'auto',
                title: 'Confirm Cancel Mixing',
                buttons: [{
                    text: 'Yes', icon: '<i class="fas fa-trash"></i>',
                    click: function () {
                        var d = { id: parseInt(el.attr('data-eqid'), 10), chemType: chemType };
                        console.log(d);
                        $.pic.modalDialog.closeDialog(this);
                        $.putApiService('/state/chemController/cancelMixing', d, function (c, status, xhr) {
                            self.setEquipmentData(c);
                        });
                    }
                },
                {
                    text: 'No', icon: '<i class="far fa-window-close"></i>',
                    click: function () { $.pic.modalDialog.closeDialog(this); }
                }]
            });
        },
        saveControllerState: function () {
            var self = this, o = self.options, el = self.element;
            var cont = dataBinder.fromElement(el);
            // Don't save the tank data.
            console.log(cont);
            cont.orp.tank = undefined;
            cont.ph.tank = undefined;
            $.putApiService('/state/chemController', cont, function (c, status, xhr) {
                self.setEquipmentData(c);
            });

        },
        _openHistoryDialog: function () {
            var self = this, o = self.options, el = self.element;
            $.getApiService(`/state/chemController/${o.id}/doseHistory`, null, 'Loading Dose History...', function (h, status, xhr) {
                console.log(h);
                if ((typeof h.ph !== 'undefined' && h.ph.length > 0) || (typeof h.orp !== 'undefined' && h.orp.length > 0)) {
                    var dlg = $.pic.modalDialog.createDialog('dlgDoseHistory', {
                        message: 'Chemical Dose History',
                        width: '390px',
                        height: 'auto',
                        title: 'Dose History',
                        buttons: [{
                            text: 'Close', icon: '<i class="far fa-window-close"></i>',
                            click: function () { $.pic.modalDialog.closeDialog(this); }
                        }]
                    });
                    var tabBar = $('<div></div>').appendTo(dlg).tabBar();
                    if (typeof h.ph !== 'undefined' && h.ph.length > 0) {
                        var tabPh = tabBar[0].addTab({ id: 'tabPhDoses', text: `${o.ph.chemType} Doses` });
                        $('<div></div>').appendTo(tabPh).pnlChemDoseHistory({
                            id: o.id,
                            chemType: 'pH',
                            chemical: o.ph,
                            history: h.ph,
                            equipmentType: 'chemController'
                        });
                    }
                    if (typeof h.orp !== 'undefined' && h.orp.length > 0) {
                        var tabOrp = tabBar[0].addTab({ id: 'tabOrpDoses', text: `${o.orp.chemType} Doses` });
                        $('<div></div>').appendTo(tabOrp).pnlChemDoseHistory({
                            id: o.id,
                            chemType: 'ORP',
                            chemical: o.orp,
                            history: h.orp
                        });
                    }
                    tabBar[0].selectFirstVisibleTab();
                }
            });
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            var divLine = $('<div></div>').appendTo(el);
            var grpSetpoints = $('<fieldset></fieldset>').css({ display: 'inline-block', verticalAlign: 'top', width: '100%' }).appendTo(divLine);
            var data = o;
            el.addClass('pnl-chemcontroller-settings');
            el.attr('data-eqid', data.id);
            $('<input type="hidden"></input>').appendTo(el).attr('data-dataType', 'int').attr('data-bind', 'id');
            $('<legend></legend>').text('Setpoints').appendTo(grpSetpoints);
            divLine = $('<div></div>').appendTo(grpSetpoints);
            $('<input type="hidden"></input>').attr('data-bind', 'id').attr('data-datatype', 'int').val(data.id).appendTo(divLine);
            var type = typeof data !== 'undefined' && typeof data.type !== 'undefined' ? data.type : { val: 0 };
            var phRange = type.ph || { min: 7.2, max: 7.6 };

            $('<div></div>').appendTo(divLine).valueSpinner({ canEdit: true, labelText: 'pH', binding: 'ph.setpoint', min: phRange.min, max: phRange.max, step: .1, units: '', inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { marginRight: '.25rem' } } })
                .on('change', function (e) {
                    el.find('div.picChemLevel[data-chemtype=pH').each(function () {
                        this.target(e.value);
                    });
                });
            $('<div></div>').appendTo(divLine).valueSpinner({ canEdit: true, labelText: 'ORP', binding: 'orp.setpoint', min: 400, max: 800, step: 10, units: 'mV', inputAttrs: { style: { width: '3.5rem' } }, labelAttrs: { style: { marginRight: '.25rem', marginLeft: '1.5rem' } } })
                .on('change', function (e) {
                    el.find('div.picChemLevel[data-chemtype=ORP').each(function () {
                        this.target(e.value);
                    });
                });

            divLine = $('<div></div>').appendTo(el);
            var grpIndex = $('<fieldset></fieldset>').css({ display: 'inline-block', verticalAlign: 'top', width: '100%' }).appendTo(divLine);
            $('<legend></legend>').text('Index Values').appendTo(grpIndex);
            divLine = $('<div></div>').appendTo(grpIndex);
            $('<div></div>').appendTo(divLine).valueSpinner({ labelText: 'Total Alkalinity', canEdit: true, binding: 'alkalinity', min: 25, max: 800, step: 10, units: 'ppm', inputAttrs: { maxlength: 4 }, labelAttrs: { style: { width: '8.3rem', marginRight: '.25rem' } } });
            divLine = $('<div></div>').appendTo(grpIndex);
            $('<div></div>').appendTo(divLine).valueSpinner({ labelText: 'Calcium Hardness', canEdit: true, binding: 'calciumHardness', min: 25, max: 800, step: 1, units: 'ppm', inputAttrs: { maxlength: 4 }, labelAttrs: { style: { width: '8.3rem', marginRight: '.25rem' } } });
            divLine = $('<div></div>').appendTo(grpIndex);
            $('<div></div>').appendTo(divLine).valueSpinner({ labelText: 'Cyanuric Acid', canEdit: true, binding: 'cyanuricAcid', min: 0, max: 201, step: 1, units: 'ppm', inputAttrs: { maxlength: 4 }, labelAttrs: { style: { width: '8.3rem', marginRight: '.25rem' } } });
            divLine = $('<div></div>').appendTo(grpIndex);
            $('<div></div>').appendTo(divLine).valueSpinner({ labelText: 'Borates', canEdit: true, binding: 'borates', min: 0, max: 201, step: 1, units: 'ppm', inputAttrs: { maxlength: 4 }, labelAttrs: { style: { width: '8.3rem', marginRight: '.25rem' } } });
            var grpLevels = $('<fieldset></fieldset>').css({ display: 'inline-block', verticalAlign: 'top', width: '100%' }).appendTo(el);
            $('<legend></legend>').text('Current Levels').appendTo(grpLevels);
            divLine = $('<div></div>').css({ display: 'inline-block', verticalAlign: 'top' }).appendTo(grpLevels);
            var divVal = $('<div></div>').appendTo(divLine).css({ display: 'inline-block', verticalAlign: 'top', textAlign: 'center' });
            $('<div></div>').addClass('chem-balance-label').text('Water Balance').appendTo(divVal);
            $('<div></div>').addClass('chem-balance-value').attr('data-bind', 'saturationIndex').attr('data-fmtmask', '#,##0.0#').attr('data-fmttype', 'number').appendTo(divVal);
            var divTotal = $('<div></div>').appendTo(divVal).addClass('chem-daily').addClass('ph').css({ textAlign: 'left' }).on('click', () => { self._openHistoryDialog(); });

            $('<div></div>').appendTo(divTotal).text('Dosed last 24hrs').css({ fontSize: '10pt', lineHeight: '1' });
            $('<hr></hr>').appendTo(divTotal).css({ margin: '1px' });
            $('<div></div>').addClass('daily-dose').attr('data-chemtype', 'acid').appendTo(divTotal).staticField({ labelText: 'Acid', binding: 'ph.dailyVolumeDosed', dataType: 'number', fmtMask: '#,##0', emptyMask: '----', units: 'mL', inputAttrs: { style: { width: '2.25rem', textAlign: 'right', display: 'inline-block' } }, labelAttrs: { style: { width: '3.3rem' } } }).css({ fontSize: '10pt', display: 'block', lineHeight: '1' });
            $('<div></div>').addClass('daily-dose').attr('data-chemtype', 'orp').appendTo(divTotal).staticField({ labelText: 'Chlorine', binding: 'orp.dailyVolumeDosed', dataType: 'number', fmtMask: '#,##0', emptyMask: '----', units: 'mL', inputAttrs: { style: { width: '2.25rem', textAlign: 'right', display: 'inline-block' } }, labelAttrs: { style: { width: '3.3rem' } } }).css({ fontSize: '10pt', display: 'block', lineHeight: '1' });
            // A good balanced saturationIndex is between +- 0.3
            divLine = $('<div></div>').css({ display: 'inline-block', margin: '0px auto', width: '210px', textAlign: 'center' }).appendTo(grpLevels);
            $('<div></div>').chemTank({
                chemType: 'acid', labelText: 'Acid Tank',
                max: data.ph.tank.capacity || 0
            }).css({ width: '80px', height: '120px' }).attr('data-bind', 'ph.tank').attr('data-datatype', 'number').appendTo(divLine)
                .on('click', function (evt) {
                    self._createTankAttributesDialog('pH', $(evt.currentTarget));
                }).hide();
            $('<div></div>').chemTank({
                chemType: 'orp', labelText: 'ORP Tank',
                max: data.orp.tank.capacity || 0
            }).css({ width: '80px', height: '120px' }).attr('data-bind', 'orp.tank').attr('data-datatype', 'number').appendTo(divLine)
                .on('click', function (evt) {
                    self._createTankAttributesDialog('ORP', $(evt.currentTarget));
                }).hide();
            divLine = $('<div></div>').appendTo(grpLevels).css({ textAlign: 'center' });
            if (data.ph.enabled === true && data.ph.pump.type.val !== 0 && data.ph.doserType.val !== 0) {
                var divBtnAcidCont = $('<div></div>').appendTo(divLine).addClass('divDoseOrp').css({ display: 'inline-block' });
                $('<div></div>').appendTo(divBtnAcidCont).actionButton({ id: 'btnDoseAcid', text: 'Dose Acid', icon: '<i class="fas fa-fill-drip"></i>' }).css({ width: '9rem', textAlign: 'left' })
                    .on('click', function (evt) {
                        self._createManualDoseDialog('Acid', 'ph');
                    }).hide();
                $('<div></div>').appendTo(divBtnAcidCont).actionButton({ id: 'btnCancelAcid', text: 'Stop Acid', icon: '<i class="burst-animated fas fa-fill-drip"></i>' }).css({ width: '9rem', textAlign: 'left' })
                    .on('click', function (evt) {
                        self._confirmCancelDose('Acid', 'ph');
                    }).hide();
                $('<div></div>').appendTo(divBtnAcidCont).actionButton({ id: 'btnMixAcid', text: 'Mix Acid', icon: '<i class="fas fa-blender"></i>' }).css({ width: '9rem', textAlign: 'left' })
                    .on('click', function (evt) {
                        self._createManualMixDialog('Acid', 'ph');
                    }).hide();
                $('<div></div>').appendTo(divBtnAcidCont).actionButton({ id: 'btnCancelMixAcid', text: 'Stop Acid Mix', icon: '<i class="burst-animated fas fa-blender"></i>' }).css({ width: '9rem', textAlign: 'left' })
                    .on('click', function (evt) {
                        self._confirmCancelMix('Acid', 'ph');
                    }).hide();

            }
            if (data.orp.enabled === true && data.orp.pump.type.val !== 0 && data.orp.useChlorinator !== true && data.orp.doserType.val !== 0) {
                var divBtnOrpCont = $('<div></div>').appendTo(divLine).addClass('divDoseOrp').css({ display: 'inline-block' });
                $('<div></div>').appendTo(divBtnOrpCont).actionButton({ id: 'btnDoseOrp', text: 'Dose Chlorine', icon: '<i class="fas fa-fill-drip"></i>' }).css({ width: '9rem', textAlign: 'left' })
                    .on('click', function (evt) {
                        self._createManualDoseDialog('Chlorine', 'orp');
                    }).hide();
                $('<div></div>').appendTo(divBtnOrpCont).actionButton({ id: 'btnCancelOrp', text: 'Stop Chlorine', icon: '<i class="burst-animated fas fa-fill-drip"></i>' }).css({ width: '9rem', textAlign: 'left' })
                    .on('click', function (evt) {
                        self._confirmCancelDose('Chlorine', 'orp');
                    }).hide();
                $('<div></div>').appendTo(divBtnOrpCont).actionButton({ id: 'btnMixOrp', text: 'Mix Chlorine', icon: '<i class="fas fa-blender"></i>' }).css({ width: '9rem', textAlign: 'left' })
                    .on('click', function (evt) {
                        self._createManualMixDialog('Chlorine', 'orp');
                    }).hide();
                $('<div></div>').appendTo(divBtnOrpCont).actionButton({ id: 'btnCancelMixOrp', text: 'Stop Chlor Mix', icon: '<i class="burst-animated fas fa-blender"></i>' }).css({ width: '9rem', textAlign: 'left' })
                    .on('click', function (evt) {
                        self._confirmCancelMix('Chlorine', 'orp');
                    }).hide();
            }
            divLine = $('<div></div>').appendTo(grpLevels);
            pHLvl = $('<div></div>').chemLevel({
                labelText: 'pH', chemType: 'pH', min: 6.7, max: 8.4,
                fmtMask: '#,##0.##',
                scales: [
                    { class: 'chemLevel-lred', min: 6.7, max: 7.0, labelEnd: '7.0' },
                    { class: 'chemLevel-lyellow', min: 7.0, max: 7.2, labelEnd: '7.2' },
                    { class: 'chemLevel-green', min: 7.2, max: 7.6, labelEnd: '7.6' },
                    { class: 'chemLevel-ryellow', min: 7.6, max: 7.9, labelEnd: '7.9' },
                    { class: 'chemLevel-rred', min: 7.9, max: 8.4, labelEnd: '' }
                ]
            }).appendTo(divLine);
            pHLvl[0].target(data.ph.setpoint);
            pHLvl[0].val(data.ph.level);

            divLine = $('<div></div>').appendTo(grpLevels);
            orpLvl = $('<div></div>').chemLevel({
                labelText: 'ORP', chemType: 'ORP', min: 400, max: 1000,
                fmtMask: '#,##0.##',
                scales: [
                    { class: 'chemLevel-lred', min: 400, max: 500, labelEnd: '500' },
                    { class: 'chemLevel-lyellow', min: 500, max: 650, labelEnd: '650' },
                    { class: 'chemLevel-green', min: 650, max: 800, labelEnd: '800' },
                    { class: 'chemLevel-ryellow', min: 800, max: 900, labelEnd: '900' },
                    { class: 'chemLevel-rred', min: 900, max: 1000, labelEnd: '' }
                ]
            }).appendTo(divLine);
            orpLvl[0].target(data.orp.setpoint);
            orpLvl[0].val(data.orp.level);
            self.setEquipmentData(data);
            el.on('change', 'div.picValueSpinner', function () {
                self.saveControllerState();
            });
        }
    });
    $.widget('pic.chemDoserSettings', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
            el[0].setEquipmentData = function (data) { self.setEquipmentData(data); };
        },
        setEquipmentData: function (data) {
            var self = this, o = self.options, el = self.element;
                // If we are dosing I need to kill the manual dose window as well as change the buttons
                // to stop dosing.
            if (typeof data !== 'undefined' && typeof data.dosingStatus !== 'undefined') {
                // We can be monitoring, mixing, or dosing.
                // If we are monitoring we can mix or dose.
                if (data.dosingStatus.name === 'monitoring') {
                    el.find('div#btnCancelDose').hide();
                    el.find('div#btnCancelMix').hide();
                    // Don't let an idiot dose when the pool is off or flow is not detected.
                    if (data.flowDetected === true && data.isBodyOn === true) el.find('div#btnDose').show();
                    else el.find('div#btnDose').hide();
                    // The chem controller will take care of the countdown for mixing if the
                    // settings are to mix only when flow is detected in the specified body.
                    el.find('div#btnMix').show();
                }
                else if (data.dosingStatus.name === 'dosing') {
                    el.find('div#btnCancelDose').show();
                    el.find('div#btnCancelMix').hide();
                    el.find('div#btnDose').hide();
                    // If we are dosing the user can cancel the dose by starting the mix.
                    el.find('div#btnMix').show();
                }
                else if (data.dosingStatus.name === 'mixing') {
                    el.find('div#btnCancelDose').hide();
                    el.find('div#btnCancelMix').show();
                    el.find('div#btnMix').hide();
                    if (data.flowDetected === true && data.isBodyOn === true) el.find('div#btnDose').show();
                }
                else {
                    // No one knows what is going on so hide all the manual buttons.
                    el.find('div#btnCancelDose').hide();
                    el.find('div#btnCancelMix').hide();
                    el.find('div#btnMix').hide();
                    el.find('div#btnDose').hide();
                }
            }
            if (typeof data.mixingTime === 'number' && (typeof data.mixingTimeHours === 'undefined' || typeof data.mixingTimeMinutes === 'undefined')) {
                data.mixingTimeHours = Math.floor(data.mixingTime / 3600);
                data.mixingTimeMinutes = (data.mixingTime - (data.mixingTimeHours * 3600)) / 60;
            }
            self.dataBind(data);
        },
        dataBind: function (data) {
            var self = this, o = self.options, el = self.element;
            dataBinder.bind(el, data);
        },
        _createTankAttributesDialog(chemType, tankElem) {
            var self = this, o = self.options, el = self.element;
            var tank = tankElem[0].tank();
            console.log(tank);
            var chemName = tank.chemType ? tank.chemType.charAt(0).toUpperCase() + tank.chemType.slice(1) : chemType;
            var dlg = $.pic.modalDialog.createDialog('dlgChemTankAttributes', {
                width: '447px',
                height: 'auto',
                title: `${chemName} Supply Tank Level`,
                position: { my: "center bottom", at: "center top", of: el },
                buttons: [
                    {
                        text: 'Save', icon: '<i class="fas fa-save"></i>',
                        click: function (e) {
                            var t = { id: parseInt(el.attr('data-eqid'), 10) };
                            t.tank = dataBinder.fromElement(dlg);
                            console.log(t);
                            $.pic.modalDialog.closeDialog(this);
                            $.putApiService('/state/chemDoser', t, function (c, status, xhr) {
                                self.setEquipmentData(c);
                            });
                        }
                    },
                    {
                        text: 'Cancel', icon: '<i class="far fa-window-close"></i>',
                        click: function () { $.pic.modalDialog.closeDialog(this); }
                    }
                ]
            });
            $('<div></div>').appendTo(dlg).html(`Set the current level for the tank.  As ${chemName.toLowerCase()} is pumped from the tank the level will be reduced by the amount of the chemical dose.`);
            $('<hr></hr>').appendTo(dlg).css({ margin: '2px' });
            var divPnl = $('<div></div>').appendTo(dlg).css({ display: 'inline-block' });
            var line = $('<div></div>').appendTo(divPnl);

            var capacity = $('<div></div>').appendTo(line).staticField({
                labelText: 'Capacity', dataType: 'number',
                units: tank.units, value: tank.capacity, fmtMask: '#,##0.###',
                labelAttrs: { style: { width: '4.7rem' } }
            });
            line = $('<div></div>').appendTo(divPnl);
            var qty = $('<div></div>').appendTo(line).valueSpinner({
                canEdit: true, labelText: 'Level', binding: 'level', min: 0, max: tank.capacity, step: tankElem[0].incrementStep(),
                fmtMask: tankElem.attr('data-fmtMask'),
                labelAttrs: { style: { width: '4.7rem' } },
                inputAttrs: { style: { width: '7rem' } }
            }).on('change', function (e) {
                pct.text(`${capacity[0].val() !== 0 ? Math.round((qty[0].val() / capacity[0].val()) * 100) : 0}%`);
            });

            divPnl = $('<div></div>').appendTo(dlg).css({ display: 'inline-block' });
            let pct = $('<div></div>').appendTo(divPnl).addClass('tank-attr-percent').css({ fontSize: '2em', textAlign: 'center', padding: '.5em' });
            dataBinder.bind(dlg, tank);
            pct.text(`${tank.capacity !== 0 ? Math.round((tank.level / tank.capacity) * 100) : 0}%`);
            dlg.css({ overflow: 'visible' });
        },
        _createManualDoseDialog(chemical, chemType, elBtn) {
            var self = this, o = self.options, el = self.element;
            var chemName = chemical.charAt(0).toUpperCase() + chemical.slice(1);
            var dlg = $.pic.modalDialog.createDialog('dlgManualChemDose', {
                width: '357px',
                height: 'auto',
                title: `Start Manual ${chemName} Dose`,
                position: { my: "center top", at: "center top", of: el },
                buttons: [
                    {
                        text: 'Start Dosing', icon: '<i class="fas fa-fill-drip"></i>',
                        click: function (e) {
                            var d = dataBinder.fromElement(dlg);
                            d = $.extend(true, d, { id: parseInt(el.attr('data-eqid'), 10), chemType: chemType });
                            console.log(d);
                            $.pic.modalDialog.closeDialog(this);
                            $.putApiService('/state/chemDoser/manualDose', d, function (c, status, xhr) {
                                self.setEquipmentData(c);
                            });
                        }
                    },
                    {
                        text: 'Cancel', icon: '<i class="far fa-window-close"></i>',
                        click: function () { $.pic.modalDialog.closeDialog(this); }
                    }
                ]
            });
            $('<div></div>').appendTo(dlg).html(`Supply a manual ${chemName.toLowerCase()} dose amount in mL.  Then press the Start Dosing button.`);
            $('<hr></hr>').appendTo(dlg).css({ margin: '2px' });
            var divPnl = $('<div></div>').appendTo(dlg).css({ display: 'inline-block' });
            var line = $('<div></div>').appendTo(divPnl);
            $('<div></div>').appendTo(line).valueSpinner({
                canEdit: true, labelText: 'Dose Amount', binding: 'volume', min: 0, max: 1000, step: 10,
                fmtMask: '#,##0', units: 'mL',
                labelAttrs: { style: { marginRight: '.15rem' } },
                inputAttrs: { style: { width: '7rem' } }
            }).on('change', function (e) {

            });
            divPnl = $('<div></div>').appendTo(dlg).css({ display: 'inline-block' });
            dlg.css({ overflow: 'visible' });
        },
        _createManualMixDialog(chemical, chemType, elBtn) {
            var self = this, o = self.options, el = self.element;
            var chemName = chemical.charAt(0).toUpperCase() + chemical.slice(1);
            var dlg = $.pic.modalDialog.createDialog('dlgManualChemMix', {
                width: '357px',
                height: 'auto',
                title: `Start Manual ${chemName} Mix`,
                position: { my: "center top", at: "center top", of: el },
                buttons: [
                    {
                        text: 'Start Mixing', icon: '<i class="fas fa-blender"></i>',
                        click: function (e) {
                            var d = dataBinder.fromElement(dlg);
                            d = $.extend(true, d, { id: parseInt(el.attr('data-eqid'), 10), chemType: chemType });
                            console.log(d);
                            $.pic.modalDialog.closeDialog(this);
                            $.putApiService('/state/chemController/manualMix', d, function (c, status, xhr) {
                                self.setEquipmentData(c);
                            });
                        }
                    },
                    {
                        text: 'Cancel', icon: '<i class="far fa-window-close"></i>',
                        click: function () { $.pic.modalDialog.closeDialog(this); }
                    }
                ]
            });
            $('<div></div>').appendTo(dlg).html(`Supply the ${chemName.toLowerCase()} mixing time in hours and minutes.  Then press the Start Mixing button.`);
            $('<hr></hr>').appendTo(dlg).css({ margin: '2px' });
            var divPnl = $('<div></div>').appendTo(dlg).css({ display: 'inline-block' });
            var line = $('<div></div>').appendTo(divPnl);
            $('<div></div>').appendTo(line).valueSpinner({
                canEdit: true, labelText: 'Mixing Time', binding: 'hours', min: 0, max: 48, step: 1,
                fmtMask: '#,##0', units: 'hrs',
                labelAttrs: { style: { marginRight: '.15rem' } },
                inputAttrs: { style: { width: '3rem' } }
            }).on('change', function (e) {

            });
            $('<div></div>').appendTo(line).valueSpinner({
                canEdit: true, labelText: '', binding: 'minutes', min: 0, max: 59, step: 1,
                fmtMask: '#,##0', units: 'min',
                labelAttrs: { style: { marginRight: '.15rem' } },
                inputAttrs: { style: { width: '3rem' } }
            }).on('change', function (e) {

            });

            divPnl = $('<div></div>').appendTo(dlg).css({ display: 'inline-block' });
            dlg.css({ overflow: 'visible' });
        },
        _confirmCancelDose: function (chemical, chemType) {
            var self = this, o = self.options, el = self.element;
            $.pic.modalDialog.createConfirm('dlgConfirmCancelDosing', {
                message: `Are you sure you want to Cancel ${chemical} dosing?`,
                width: '350px',
                height: 'auto',
                title: 'Confirm Cancel Dosing',
                buttons: [{
                    text: 'Yes', icon: '<i class="fas fa-trash"></i>',
                    click: function () {
                        var d = { id: parseInt(el.attr('data-eqid'), 10), chemType: chemType };
                        console.log(d);
                        $.pic.modalDialog.closeDialog(this);
                        $.putApiService('/state/chemDoser/cancelDosing', d, function (c, status, xhr) {
                            self.setEquipmentData(c);
                        });
                    }
                },
                {
                    text: 'No', icon: '<i class="far fa-window-close"></i>',
                    click: function () { $.pic.modalDialog.closeDialog(this); }
                }]
            });
        },
        _confirmCancelMix: function (chemical, chemType) {
            var self = this, o = self.options, el = self.element;
            $.pic.modalDialog.createConfirm('dlgConfirmCancelDosing', {
                message: `Are you sure you want to Cancel ${chemical} mixing?`,
                width: '350px',
                height: 'auto',
                title: 'Confirm Cancel Mixing',
                buttons: [{
                    text: 'Yes', icon: '<i class="fas fa-trash"></i>',
                    click: function () {
                        var d = { id: parseInt(el.attr('data-eqid'), 10), chemType: chemType };
                        console.log(d);
                        $.pic.modalDialog.closeDialog(this);
                        $.putApiService('/state/chemDoser/cancelMixing', d, function (c, status, xhr) {
                            self.setEquipmentData(c);
                        });
                    }
                },
                {
                    text: 'No', icon: '<i class="far fa-window-close"></i>',
                    click: function () { $.pic.modalDialog.closeDialog(this); }
                }]
            });
        },
        saveControllerState: function () {
            var self = this, o = self.options, el = self.element;
            var cont = dataBinder.fromElement(el);
            cont.tank = undefined;
            console.log(cont);
            $.putApiService('/state/chemDoser', cont, function (c, status, xhr) {
                self.setEquipmentData(c);
            });

        },
        _openHistoryDialog: function () {
            var self = this, o = self.options, el = self.element;
            $.getApiService(`/state/chemDoser/${o.id}/doseHistory`, null, 'Loading Dose History...', function (h, status, xhr) {
                console.log(h);
                if (h.length > 0) {
                    var dlg = $.pic.modalDialog.createDialog('dlgDoseHistory', {
                        message: 'Chemical Dose History',
                        width: '390px',
                        height: 'auto',
                        title: 'Dose History',
                        buttons: [{
                            text: 'Close', icon: '<i class="far fa-window-close"></i>',
                            click: function () { $.pic.modalDialog.closeDialog(this); }
                        }]
                    });
                    var tabBar = $('<div></div>').appendTo(dlg).tabBar();
                    var tab = tabBar[0].addTab({ id: 'tabDoses', text: `${o.chemType} Doses` });
                    $('<div></div>').appendTo(tab).pnlChemDoseHistory({
                        id: o.id,
                        chemType: o.chemType,
                        chemical: o,
                        history: h,
                        equipmentType: 'chemDoser'
                    });
                    tabBar[0].selectFirstVisibleTab();
                }
            });
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            var divLine = $('<div></div>').appendTo(el);
            var grpSetpoints = $('<fieldset></fieldset>').css({ display: 'inline-block', verticalAlign: 'top', width: '100%' }).appendTo(divLine);
            var data = o;
            console.log(data);
            el.addClass('pnl-chemdoser-settings');
            el.attr('data-eqid', data.id);
            $('<input type="hidden"></input>').appendTo(el).attr('data-dataType', 'int').attr('data-bind', 'id');
            $('<legend></legend>').text('Setpoints').appendTo(grpSetpoints);
            divLine = $('<div></div>').appendTo(grpSetpoints);
            $('<input type="hidden"></input>').attr('data-bind', 'id').attr('data-datatype', 'int').val(data.id).appendTo(divLine);
            divLine = $('<div></div>').appendTo(grpSetpoints).addClass('pnl-dose-volume');
            $('<div></div>').appendTo(divLine).valueSpinner({ canEdit: true, binding: 'dosingVolume', labelText: 'Dose', min: 0, max: 9999, dataType: 'number', fmtMask:"#,##0", labelAttrs: { style: { width: '3rem' } }, inputAttrs: { style: { width: '3.7rem' } }, units: 'mL per Dose' });
            divLine = $('<div></div>').appendTo(grpSetpoints);
            $('<div></div>').appendTo(divLine).valueSpinner({ canEdit: true, binding: 'mixingTimeHours', labelText: 'Every', min: 0, max: 23, dataType: 'number', labelAttrs: { style: { width: '3rem' } }, inputAttrs: { style: { width: '3rem' } }, units: 'hrs' });
            $('<div></div>').appendTo(divLine).valueSpinner({ canEdit: true, binding: 'mixingTimeMinutes', labelText: 'Minutes', min: 0, max: 59, dataType: 'number', labelAttrs: { style: { display: 'none' } }, inputAttrs: { style: { width: '2.1rem' } }, style: { marginLeft: '.15rem' }, units: 'min' });
            divLine = $('<div></div>').appendTo(grpSetpoints);
            $('<hr></hr>').appendTo(divLine).css({ margin: '4px' });
            divLine = $('<div></div>').appendTo(grpSetpoints);
            $('<div></div>').appendTo(divLine).valueSpinner({ canEdit: true, binding: 'maxDailyVolume', labelText: 'Max 24 hour limit', min: 0, max: 9999, dataType: 'number', fmtMask: "#,##0", labelAttrs: { style: { width:'8.7rem' } }, inputAttrs: { style: { width: '3.7rem' } }, style: { marginLeft: '.15rem' }, units: 'mL' });
            divLine = $('<div></div>').appendTo(el);
            var grpLevels = $('<fieldset></fieldset>').css({ display: 'inline-block', verticalAlign: 'top', width: '100%' }).appendTo(el);
            $('<legend></legend>').text('Current Levels').appendTo(grpLevels);
            divLine = $('<div></div>').css({ display: 'inline-block', verticalAlign: 'top' }).appendTo(grpLevels);
            var divVal = $('<div></div>').appendTo(divLine).css({ display: 'inline-block', verticalAlign: 'top', textAlign: 'center' });
            var divTotal = $('<div></div>').appendTo(divVal).addClass('chem-daily').css({ textAlign: 'left' }).on('click', () => { self._openHistoryDialog(); });
            $('<div></div>').appendTo(divTotal).text('Dosed last 24hrs').css({ fontSize: '10pt', lineHeight: '1' });
            $('<hr></hr>').appendTo(divTotal).css({ margin: '1px' });
            $('<div></div>').addClass('daily-dose').attr('data-chemtype', data.chemType.toLowerCase()).appendTo(divTotal).staticField({ labelText: data.chemType, binding: 'dailyVolumeDosed', dataType: 'number', fmtMask: '#,##0', emptyMask: '----', units: 'mL', inputAttrs: { style: { width: '2.25rem', textAlign: 'right', display: 'inline-block' } }, labelAttrs: { style: { width: '3.3rem' } } }).css({ fontSize: '10pt', display: 'block', lineHeight: '1' });
            divLine = $('<div></div>').css({ display: 'inline-block', margin: '0px auto', width: '210px', textAlign: 'center' }).appendTo(grpLevels);
            $('<div></div>').chemTank({
                chemType: data.chemType.toLowerCase(), labelText: `${data.chemType}`,
                max: data.tank.capacity || 0
            }).css({ width: '80px', height: '120px' }).attr('data-bind', 'tank').attr('data-datatype', 'number').appendTo(divLine)
                .on('click', function (evt) {
                    self._createTankAttributesDialog(data.chemType, $(evt.currentTarget));
                }).hide();
            divLine = $('<div></div>').appendTo(grpLevels).css({ textAlign: 'center' });
            if (data.enabled === true && data.pump.type.val !== 0) {
                var divBtnCont = $('<div></div>').appendTo(divLine).css({ display: 'inline-block' });
                el.find('div.picChemTank').show();
                $('<div></div>').appendTo(divBtnCont).actionButton({ id: 'btnDose', text: `Dose ${data.chemType || ''}`, icon: '<i class="fas fa-fill-drip"></i>' }).css({ width: '9rem', textAlign: 'left' })
                    .on('click', function (evt) {
                        self._createManualDoseDialog(data.chemType, 'ph');
                    }).hide();
                $('<div></div>').appendTo(divBtnCont).actionButton({ id: 'btnCancelDose', text: 'Stop Dose', icon: '<i class="burst-animated fas fa-fill-drip"></i>' }).css({ width: '9rem', textAlign: 'left' })
                    .on('click', function (evt) {
                        self._confirmCancelDose(data.chemType, 'ph');
                    }).hide();
                $('<div></div>').appendTo(divBtnCont).actionButton({ id: 'btnMix', text: `Mix ${data.chemType || ''}`, icon: '<i class="fas fa-blender"></i>' }).css({ width: '9rem', textAlign: 'left' })
                    .on('click', function (evt) {
                        self._createManualMixDialog(data.chemType, 'ph');
                    }).hide();
                $('<div></div>').appendTo(divBtnCont).actionButton({ id: 'btnCancelMix', text: 'Stop Mix', icon: '<i class="burst-animated fas fa-blender"></i>' }).css({ width: '9rem', textAlign: 'left' })
                    .on('click', function (evt) {
                        self._confirmCancelMix(data.chemType, 'ph');
                    }).hide();

            }
            self.setEquipmentData(data);
            el.on('change', 'div.picValueSpinner', function () {
                self.saveControllerState();
            });
        }
    });

    $.widget('pic.pnlChemDoseHistory', {
        options: {},
        _create: function () {
            var self = this, o = self.options, el = self.element;
            self._buildControls();
        },
        _buildControls: function () {
            var self = this, o = self.options, el = self.element;
            el.addClass('pnl-chemDoseHistory');
            el.attr('data-id', o.id);
            var list = $('<div></div>').addClass('pnl-chemDoseList').appendTo(el);
            var sel = $('<div></div>').appendTo(list).selectList({
                id: 'chemDose',
                key: 'end',
                canCreate: false,
                actions: { canCreate: false },
                caption: 'Doses last 24 hours', itemName: 'Dose',
                columns: [
                    {
                        binding: 'start', fmtType: 'date', fmtMask: 'MM/dd hh:mmtt', text: 'Start', cellStyle: { width: '97px' },
                        style: { width: '97px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
                    },
                    {
                        binding: 'timeDosed', text: 'Duration', fmtType: 'duration', fmtMask: '#', cellStyle: { textAlign: 'right', width: '77px' },
                        style: { width: '77px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
                    },
                    {
                        binding: 'volumeDosed', fmtType: 'number', fmtMask: '#,##0.00', text: 'Dosed', cellStyle: { textAlign: 'right', width: '57px' },
                        style: { width: '57px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
                    },
                    { binding: 'status', text: 'Status', style: { width: '117px' }, cellStyle: { width: '117px' } }
                ]
            }).css({ width: '363px' });
            sel.find('div.slist-body').css({ fontSize: '.8rem', maxHeight: '97px', overflowY: 'auto' });
            var btnPnl = $('<div class="picBtnPanel btn-panel"></div>').appendTo(el);
            $('<div></div>').appendTo(btnPnl).actionButton({ text: 'Clear History', icon: '<i class="fas fa-broom" ></i>' }).on('click', function (evt) {
                if (o.equipmentType === 'chemDoser') {
                    $.putApiService(`/state/chemDoser/${o.id}/doseHistory/clear`, {}, `Clearing ${o.chemType.toUpperCase()} history...`, function (data, status, xhr) {
                        sel[0].clear();
                    });

                }
                else {
                    $.putApiService(`/state/chemController/${o.id}/doseHistory/${o.chemType.toLowerCase()}/clear`, {}, `Clearing ${o.chemType.toUpperCase()} history...`, function (data, status, xhr) {
                        sel[0].clear();
                    });
                }
            });
            // Add in all the rows.
            for (var i = 0; i < o.history.length; i++)
                sel[0].addRow(o.history[i]);
        }
    });


})(jQuery);

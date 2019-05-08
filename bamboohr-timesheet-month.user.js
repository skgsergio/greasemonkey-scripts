// ==UserScript==
// @name         BambooHR Timesheet Fill Month
// @namespace    bamboohr.sconde.net
// @version      0.3
// @description  Fill BambooHR Timesheet month with templates
// @author       Sergio Conde
// @match        https://*.bamboohr.com/employees/timesheet/?id=*
// @grant        GM.getValue
// @grant        GM.setValue
// @homepageURL  https://github.com/skgsergio/bamboohr-timesheet-greasemonkey/
// @supportURL   https://github.com/skgsergio/bamboohr-timesheet-greasemonkey/issues
// @updateURL    https://raw.githubusercontent.com/skgsergio/bamboohr-timesheet-greasemonkey/master/bamboohr-timesheet-month.user.js
// ==/UserScript==

'use strict';

/*
   Don't touch this, won't persist across updates.

   Load BambooHR for the first time with the script and then open this script Storage preferences and edit there.
 */
const DEFAULT_TEMPLATES = {
  'default': [{ start: '8:30', end: '13:00' }, { start: '13:30', end: '17:00' }],
  'Fri': [{ start: '8:30', end: '14:30' }, { start: '15:30', end: '17:30' }]
};

/* Here be dragons */
(async function() {
  let TEMPLATES = await GM.getValue('TEMPLATES');

  if (!TEMPLATES) {
    TEMPLATES = DEFAULT_TEMPLATES;
    GM.setValue('TEMPLATES', TEMPLATES);
  }

  let span = document.createElement('span');
  document.querySelector('.TimesheetSummary').prepend(span);

  let btn = document.createElement('button');
  span.append(btn);

  btn.type = 'button';
  btn.classList.value = 'btn btnLarge btnAction TimesheetSummary__clockButton';
  btn.innerText = 'Fill Month';

  btn.onclick = function () {
    let work_days = document.querySelectorAll('.TimesheetSlat:not(.js-timesheet-showWeekends)');
    let skipped = [];
    let entries = [];
    let idx = 0;

    for (const day of work_days) {
      let dow = day.querySelector('.TimesheetSlat__day .TimesheetSlat__dayOfWeek').innerText;
      let dd = day.querySelector('.TimesheetSlat__day .TimesheetSlat__dayDate').innerText;

      // Vacations and Bank Holidays creates an extraInfoItem item, if present we skip the day.
      let extra_info = day.querySelector('.TimesheetSlat__data .TimesheetSlat__extraInfoItem');
      if (extra_info) {
        skipped.push(`${dow} ${dd} ${new Date().getFullYear()}: ${extra_info.innerText}`);
        continue;
      }

      // Build the date in the format used by BambooHR Timesheet
      let date = new Date(`${dow} ${dd} ${new Date().getFullYear()}`);
      let date_str = `${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)}`;

      // Get the working time slots for the dow
      let slots = TEMPLATES['default'];
      if (TEMPLATES.hasOwnProperty(name)) {
        slots = TEMPLATES[name];
      }

      // Generate the entries for this day
      for (const slot of slots) {
        idx += 1;

        entries.push({
          id: null,
          trackingId: idx,
          employeeId: SESSION_USER.employeeId,
          date: date_str,
          start: slot.start,
          end: slot.end,
          note: ''
        });
      }
    }

    fetch(
      `${window.location.origin}/timesheet/clock/entries`,
      {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        referrer: 'client',
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'x-csrf-token': CSRF_TOKEN
        },
        body: JSON.stringify({ entries: entries })
      }
    ).then(data => {
      if (data.status == 200) {
        alert(`Created ${entries.length} entries.\n\nSkipped days:\n${skipped.join('\n')}`);
      } else {
        data.text().then(t => alert(`Request error!\nHTTP Code: ${data.status}\nResponse:\n${t}`));
      }
    }).catch(err => alert(`Fetch error!\n\n${err}`));

    return false;
  }
})();

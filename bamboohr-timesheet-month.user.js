// ==UserScript==
// @name         BambooHR Timesheet Fill Month
// @namespace    month.timesheet.bamboohr.sconde.net
// @version      1.0
// @description  Fill BambooHR Timesheet month with templates
// @author       Sergio Conde
// @match        https://*.bamboohr.com/employees/timesheet/*
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
  'default': [{ start: '8:15', end: '13:00' }, { start: '13:30', end: '16:45' }],
  'Fri': [{ start: '8:15', end: '14:30' }, { start: '15:30', end: '17:15' }]
};

const DEFAULT_ENTROPY_MINUTES = 10;

/* Here be dragons */
(async function() {
  let TEMPLATES = await GM.getValue('TEMPLATES');

  if (!TEMPLATES) {
    TEMPLATES = DEFAULT_TEMPLATES;
    GM.setValue('TEMPLATES', TEMPLATES);
  }

  let ENTROPY_MINUTES = await GM.getValue('ENTROPY_MINUTES');

  if (!ENTROPY_MINUTES) {
    ENTROPY_MINUTES = DEFAULT_ENTROPY_MINUTES;
    GM.setValue('ENTROPY_MINUTES', ENTROPY_MINUTES);
  }

  let span = document.createElement('span');
  document.querySelector('.TimesheetSummary').prepend(span);

  /* Fill Month */
  let btn_fill = document.createElement('button');
  span.append(btn_fill);

  btn_fill.type = 'button';
  btn_fill.classList.value = 'btn btnLarge btnAction TimesheetSummary__clockButton';
  btn_fill.innerText = 'Fill Month';

  btn_fill.onclick = function () {
    let work_days = document.querySelectorAll('.TimesheetSlat:not(.js-timesheet-showWeekends):not(.TimesheetSlat--disabled)');
    let skipped = [];
    let entries = [];
    let tracking_id = 0;

    for (const day of work_days) {
      let dow = day.querySelector('.TimesheetSlat__day .TimesheetSlat__dayOfWeek').innerText;
      let dd = day.querySelector('.TimesheetSlat__day .TimesheetSlat__dayDate').innerText;
      let formated_date = `${dow} ${dd} ${new Date().getFullYear()}`;

      // Vacations and Bank Holidays creates an extraInfoItem item, if present we skip the day.
      let extra_info = day.querySelector('.TimesheetSlat__data .TimesheetSlat__extraInfoItem');
      if (extra_info) {
        skipped.push(`${formated_date}: ${extra_info.innerText}`);
        continue;
      }

      // Build the date in the format used by BambooHR Timesheet
      let date = new Date(formated_date);
      let date_str = `${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)}`;

      // Get the working time slots for the dow
      let slots = TEMPLATES['default'];
      if (TEMPLATES.hasOwnProperty(dow)) {
        slots = TEMPLATES[dow];
      }

      // Generate the entries for this day
      let minute_diff = [...Array(slots.length)].map(_ => Math.ceil(Math.random() * ENTROPY_MINUTES));

      for (const [idx, slot] of slots.entries()) {
        tracking_id += 1;

        let start = new Date(`${formated_date} ${slot.start}`)
        start.setMinutes(start.getMinutes() + minute_diff[idx])

        let end = new Date(`${formated_date} ${slot.end}`)
        end.setMinutes(end.getMinutes() + minute_diff[minute_diff.length - 1 - idx])

        entries.push({
          id: null,
          trackingId: tracking_id,
          employeeId: unsafeWindow.currentlyEditingEmployeeId,
          date: date_str,
          start: `${start.getHours()}:${('0' + start.getMinutes()).slice(-2)}`,
          end: `${end.getHours()}:${('0' + end.getMinutes()).slice(-2)}`,
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
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'x-csrf-token': unsafeWindow.CSRF_TOKEN
        },
        body: JSON.stringify({ entries: entries })
      }
    ).then(data => {
      if (data.status == 200) {
        alert(`Created ${entries.length} entries.\n\nSkipped days:\n${skipped.join('\n')}`);
        location.reload();
      } else {
        data.text().then(t => alert(`Request error!\nHTTP Code: ${data.status}\nResponse:\n${t}`));
      }
    }).catch(err => alert(`Fetch error!\n\n${err}`));

    return false;
  }

  /* Delete Month */
  let btn_del = document.createElement('button');
  span.append(btn_del);

  btn_del.type = 'button';
  btn_del.classList.value = 'btn btnLarge btnAction TimesheetSummary__clockButton';
  btn_del.innerText = 'Delete Month';

  btn_del.onclick = function () {
    let tsd = JSON.parse(document.getElementById('js-timesheet-data').innerHTML);
    let entries = [];

    for (const [day, details] of Object.entries(tsd.timesheet.dailyDetails)) {
      for (const entry of details.clockEntries) {
        entries.push(entry.id)
      }
    }

    fetch(
      `${window.location.origin}/timesheet/clock/entries`,
      {
        method: 'DELETE',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'x-csrf-token': unsafeWindow.CSRF_TOKEN
        },
        body: JSON.stringify({ entries: entries })
      }
    ).then(data => {
      if (data.status == 200) {
        alert(`Deleted ${entries.length} entries.`);
        location.reload();
      } else {
        data.text().then(t => alert(`Request error!\nHTTP Code: ${data.status}\nResponse:\n${t}`));
      }
    }).catch(err => alert(`Fetch error!\n\n${err}`));

    return false;
  }
})();

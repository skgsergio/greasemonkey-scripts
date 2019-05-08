// ==UserScript==
// @name         BambooHR Timesheet Fill
// @namespace    bamboohr.sconde.net
// @version      0.4
// @description  Fill BambooHR Timesheet with templates
// @author       Sergio Conde
// @match        https://*.bamboohr.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @homepageURL  https://github.com/skgsergio/bamboohr-timesheet-greasemonkey/
// @supportURL   https://github.com/skgsergio/bamboohr-timesheet-greasemonkey/issues
// @updateURL    https://raw.githubusercontent.com/skgsergio/bamboohr-timesheet-greasemonkey/master/bamboohr-timesheet.user.js
// ==/UserScript==

'use strict';

/*
   Don't touch this, won't persist across updates.

   Load BambooHR for the first time with the script and then open this script Storage preferences and edit there.
 */
const DEFAULT_TEMPLATES = {
  'Mon-Thu': [{ start: '8:30', end: '13:00' }, { start: '13:30', end: '17:00' }],
  'Fri': [{ start: '8:30', end: '14:30' }, { start: '15:30', end: '17:30' }]
};

(async function() {
  let TEMPLATES = await GM.getValue('TEMPLATES');

  if (!TEMPLATES) {
    TEMPLATES = DEFAULT_TEMPLATES;
    GM.setValue('TEMPLATES', TEMPLATES);
  }

  for (const template of Object.keys(TEMPLATES)) {
    let link = document.createElement('li');
    link.innerHTML = `<a href="#" data-template="${template}">Fill Timesheet: ${template}</a>`;

    link.querySelector('a').onclick = function () {
      let now = new Date();
      // Do JS have propper date formatting? :facepalm:
      let date = prompt("Please enter the date", `${now.getFullYear()}-${('0' + (now.getMonth() + 1)).slice(-2)}-${('0' + now.getDate()).slice(-2)}`);

      if (!date) {
        alert("Canceled!");
        return false;
      }

      let entries = [];
      for (const [idx, slot] of TEMPLATES[this.dataset.template].entries()) {
        entries.push({
          id: null,
          trackingId: idx + 1,
          employeeId: SESSION_USER.employeeId,
          date: date,
          start: slot.start,
          end: slot.end,
          note: ''
        });
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
          alert('Done!');
        } else {
          data.text().then(t => alert(`Request error!\nHTTP Code: ${data.status}\nResponse:\n${t}`));
        }
      }).catch(err => alert(`Fetch error!\n\n${err}`));

      return false;
    };

    window.document.querySelector('ul#nav-tabs').append(link);
  }
})();

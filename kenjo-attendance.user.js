// ==UserScript==
// @name         Kenjo Attendance Fill Month
// @namespace    attendance.kenjo.sconde.net
// @version      1.1
// @description  Fill Kenjo Attendance month with templates
// @author       Sergio Conde
// @match        https://app.kenjo.io/*
// @match        https://app.orgos.io/*
// @grant        GM.getValue
// @grant        GM.setValue
// @homepageURL  https://github.com/skgsergio/greasemonkey-scripts
// @supportURL   https://github.com/skgsergio/greasemonkey-scripts/issues
// @updateURL    https://raw.githubusercontent.com/skgsergio/greasemonkey-scripts/master/kenjo-attendance.user.js
// ==/UserScript==

'use strict';

/*
   Don't touch this, won't persist across updates.

   Load Kenjo for the first time with the script and then open this script Storage preferences and edit there.
 */

/* 0 = Sunday, 1 = Monday, ..., 6 = Saturday */
const DEFAULT_SCHEDULE = {
  1: [{ start: '9:00', hours: '8:00', pause: '00:30' }],
  2: [{ start: '9:00', hours: '8:00', pause: '00:30' }],
  3: [{ start: '9:00', hours: '8:00', pause: '00:30' }],
  4: [{ start: '9:00', hours: '8:00', pause: '00:30' }],
  5: [{ start: '9:00', hours: '8:00', pause: '00:30' }]
};

const DEFAULT_ENTROPY_MINUTES = 15;


/**
 * Here be dragons
 **/

/* API Endpoints */

const API_URL = 'https://api.kenjo.io';
const AUTH_COOKIE_URL = `${API_URL}/auth/cookie`;
const ME_URL = `${API_URL}/user-account-db/user-accounts/me`;
const TIMEOFF_URL = `${API_URL}/user-time-off-request/find`;
const CALENDAR_URL = `${API_URL}/calendar-db/find`;
const TEMPLATES_URL = `${API_URL}/calendar-template-db/templates`;
const ATTENDANCE_URL = `${API_URL}/user-attendance-db`;

function USERWORK_URL(userId) {
  return `${API_URL}/user-work-db/${userId}/calendar`;
}


/* Fetch function */

async function fetchUrl(auth, url, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' }

  if (auth) {
    headers.Authorization = auth;
  }

  try {
    const response = await fetch(url, { method, credentials: 'include', headers, body })

    if (!response.ok) {
      throw Error(`HTTP Code: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    throw new Error(`Failed performing request, reload the site and try again.\n\n${method} ${url}\n${err}`);
  }
}


/* AUTH */

async function getAuth() {
  const data = await fetchUrl(null, AUTH_COOKIE_URL);
  return `${data.token_type} ${data.access_token}`;
}

/* GET */

function getUser(auth) {
  return fetchUrl(auth, ME_URL);
}


function getUserCalendar(auth, userId) {
  return fetchUrl(auth, USERWORK_URL(userId));
}


function getCalendarTemplates(auth) {
  return fetchUrl(auth, TEMPLATES_URL);
}


/* POST */

function getCalendar(auth, calendarId) {
  return fetchUrl(
    auth,
    CALENDAR_URL,
    'POST',
    JSON.stringify({
      _id: calendarId
    })
  );
}


function getUserTimeOff(auth, userId, fromDate, toDate) {
  return fetchUrl(
    auth,
    TIMEOFF_URL,
    'POST',
    JSON.stringify({
      _from: { $gte: fromDate },
      _to: { $lte: toDate },
      _userId: userId
    })
  );
}


function addEntry(auth, userId, date, startTime, endTime, breakTime) {
  return fetchUrl(
    auth,
    ATTENDANCE_URL,
    'POST',
    JSON.stringify({
      ownerId: userId,
      date: date,
      startTime: startTime,
      endTime: endTime,
      breakTime: breakTime,
      _approved: false,
      _changesTracking: [],
      _deleted: false,
      _userId: userId
    })
  );
}


/* HELPERS */

function startOfMonth(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0));
}


function endOfMonth(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999));
}

function hhmmToMinutes(str) {
  return str.split(':').reduce((acc, curr) => (acc*60) + +curr);
}


/* MAIN */

var SCHEDULE = {};
var ENTROPY_MINUTES = 0;

async function fillMonth(statusContainer) {
  try {
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    /* Get user info */
    statusContainer.innerText = "Getting user info...";
    const auth = await getAuth();
    const user = await getUser(auth);
    statusContainer.innerText = "Getting user time off...";
    const timeOff = await getUserTimeOff(auth, user.ownerId, monthStart.toISOString(), monthEnd.toISOString());

    /* Get calendar info */
    statusContainer.innerText = "Getting user calendar...";
    const userCalendar = await getUserCalendar(auth, user.ownerId);
    const calendars = await getCalendar(auth, userCalendar.calendarId);
    const templates = await getCalendarTemplates(auth);
    const template = templates.filter(tpl => tpl.templateKey == calendars[0]._calendarTemplateKey)[0];

    /* Parse non working days */
    statusContainer.innerText = "Processing non working days...";
    const nonWorkingDays = [];

    timeOff.forEach((t) => {
      nonWorkingDays.push({
        reason: t._policyName,
        start: new Date(Date.parse(t._from)),
        end: new Date(Date.parse(t._to))
      });
    });

    template.holidays.forEach((h) => {
      const start = new Date(Date.parse(`${h.holidayDate}T00:00:00.000Z`));
      const end = new Date(Date.parse(`${h.holidayDate}T23:59:59.999Z`));

      if (start >= monthStart && start <= monthEnd) {
        nonWorkingDays.push({
          reason: h.holidayKey,
          start: start,
          end: end
        });
      }
    });

    calendars[0]._customHolidays.forEach((h) => {
      const holidayDate = h.holidayDate.split("T")[0];

      const start = new Date(Date.parse(`${holidayDate}T00:00:00.000Z`));
      const end = new Date(Date.parse(`${holidayDate}T23:59:59.999Z`));

      if (start >= monthStart && start <= monthEnd) {
        nonWorkingDays.push({
          reason: h.holidayName,
          start: start,
          end: end
        });
      }
    });

    /* Generate month sheet */
    statusContainer.innerText = "Generating attendance sheet...";
    const entries = [];
    const skippedDays = [];

    for (let day = monthStart; day <= monthEnd; day.setDate(day.getDate() + 1)) {
      /* Check if the day has an schedule */
      if (!(day.getDay() in SCHEDULE) || SCHEDULE[day.getDay()].length == 0) {
        continue;
      }

      /* Check if the day should be skipped (holiday or time off) */
      const skipReasons = nonWorkingDays.filter((nwd) => day >= nwd.start && day <= nwd.end);

      if (skipReasons.length > 0) {
        skippedDays.push({ day: new Date(day.getTime()), reasons: skipReasons.map(sr => sr.reason) });
        continue;
      }

      /* Produce an entry for this day */
      SCHEDULE[day.getDay()].forEach((sch) => {
        const start = hhmmToMinutes(sch.start) + Math.ceil(Math.random() * ENTROPY_MINUTES);
        const pause = hhmmToMinutes(sch.pause);
        const end = start + pause + hhmmToMinutes(sch.hours);

        entries.push({
          date: day.toISOString(),
          start: start,
          end: end,
          pause: pause
        });
      });
    }

    /* Store sheet */
    for (const [idx, ts] of entries.entries()) {
      statusContainer.innerText = `Saving day ${idx+1} of ${entries.length}...`;
      console.log(await addEntry(auth, user.ownerId, ts.date, ts.start, ts.end, ts.pause));
    }

    /* Show info to the user */
    statusContainer.innerText = "Done";

    let skippedTxt = "";
    skippedDays.forEach((s) => { skippedTxt += `\n${s.day.toISOString().split("T")[0]}: ${s.reasons.join(', ')}` });

    alert(`Created ${entries.length} entries.\n\nSkipped days:${skippedTxt}`);

    /* Reload page to reflect changes */
    location.assign(`${location.origin}/cloud/people/${user.ownerId}/attendance`);
  } catch(err) {
    alert(`Kenjo Attendance Fill Month error:\n${err}`);
  }
}

(async function() {
  /* Make schedule and entropy configurable */
  SCHEDULE = await GM.getValue('SCHEDULE');
  if (!SCHEDULE) {
    SCHEDULE = DEFAULT_SCHEDULE;
    GM.setValue('SCHEDULE', SCHEDULE);
  }

  ENTROPY_MINUTES = await GM.getValue('ENTROPY_MINUTES');
  if (!ENTROPY_MINUTES) {
    ENTROPY_MINUTES = DEFAULT_ENTROPY_MINUTES;
    GM.setValue('ENTROPY_MINUTES', ENTROPY_MINUTES);
  }

  /* Add button */
  const extDiv = document.createElement('div');
  extDiv.style.textAlign = "center";

  const monthBtn = document.createElement('button');
  monthBtn.type = 'button';
  monthBtn.innerText = 'Attendance: Fill Month';
  monthBtn.onclick = function() { this.disabled = "disabled"; fillMonth(this); }

  extDiv.append(monthBtn);
  document.body.insertBefore(extDiv, document.body.firstChild);
})();

/* *
   * bt-to 
   * @description Cloudflare Worker that fetches the current agenda from bundestag.de, saves it in a KV database and serves it as an API.
   * @author Jannis Hutt
   * @url https://api.hutt.io/bt-to/
   * @lastEdit 2024-05-20
   *
*/

import cheerio from "cheerio";

// Event Listener für eingehende Anfragen und geplante Aufgaben
addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event));
});

addEventListener("scheduled", (event) => {
    event.waitUntil(updateAgenda());
});

// Hauptfunktion zur Verarbeitung eingehender Anfragen
async function handleRequest(event) {
    const request = event.request;
    const url = new URL(request.url);
    const path = url.pathname;
    const params = url.searchParams;
    const cache = caches.default;
    const cacheKey = new Request(request.url);

    // Überprüfung, ob die Antwort im Cache vorhanden ist
    // let response = await cache.match(cacheKey);
    // if (!response) {
    // Wenn nicht im Cache, dann entsprechende Funktion aufrufen
    if (path === "/bt-to/" || path === "/bt-to") {
        response = await serveDocumentation();
    } else if (path === "/bt-to/ical" || path === "/bt-to/ics") {
        response = await serveAgenda("ical", params);
    } else if (path === "/bt-to/json") {
        response = await serveAgenda("json", params);
    } else if (path === "/bt-to/xml") {
        response = await serveAgenda("xml", params);
    } else if (path === "/bt-to/csv") {
        response = await serveAgenda("csv", params);
    } else {
        response = new Response("Not Found", { status: 404 });
    }

    //     // Antwort für 15 Minuten cachen
    //     response.headers.append("Cache-Control", "max-age=900");
    //     event.waitUntil(cache.put(cacheKey, response.clone()));
    // }

    return response;
}

// Dokumentationsseite der API bereitstellen
async function serveDocumentation() {
    const html = `
<!-- Dokumentation -->
`;
    return new Response(html, {
        headers: { "content-type": "text/html; charset=UTF-8" },
    });
}

// Funktion zur Bereitstellung der Tagesordnung in verschiedenen Formaten
async function serveAgenda(format, params) {
    const year = params.get('year') || new Date().getFullYear();
    const week = params.get('week');
    const month = params.get('month');
    const day = params.get('day');
    const status = params.get('status');

    const currentWeek = getWeekNumber(new Date());
    const currentYear = new Date().getFullYear();

    if (year > currentYear || (year == currentYear && week > currentWeek)) {
        return new Response("Keine Daten für zukünftige Wochen", { status: 400 });
    }

    let agendaItems = [];
    if (week) {
        agendaItems = await getOrFetchAgendaByWeek(year, week);
    } else if (month) {
        agendaItems = await getOrFetchAgendaByMonth(year, month);
    } else if (day) {
        agendaItems = await getOrFetchAgendaByDay(year, month, day);
    } else {
        agendaItems = await getOrFetchAgendaByYear(year);
    }

    // Filter nach Status
    if (status) {
        agendaItems = agendaItems.filter(item => item.status && item.status.includes(status));
    }

    return formatAgendaResponse(format, agendaItems);
}

// 
async function updateAgenda() {
    const year = new Date().getFullYear();
    const week = getWeekNumber(new Date());
    const html = await fetchAgenda(year, week);
    const agendaItems = parseAgenda(html);

    // Fetch existing items from KV storage
    const currentItemsPromises = agendaItems.map(item => data.get(item.uid));
    const currentItems = await Promise.all(currentItemsPromises).then(values => values.map(value => JSON.parse(value)));

    // Update KV storage with new agenda items only if they changed
    const updatedItems = currentItems.map((currentItem, index) => {
        const newItem = agendaItems[index];
        return (newItem.title === currentItem.title && newItem.content === currentItem.content)
            ? currentItem // No change: keep the old item
            : { uid: newItem.uid, data: JSON.stringify(newItem) }; // New item: update the storage with the new data
    });

    const promises = updatedItems.map((item) => (item === currentItem ? Promise.resolve() : data.put(item.uid, item.data)));
    await Promise.all(promises);
}

// Funktionen zum Abrufen oder Abrufen und Speichern der Tagesordnung
async function getOrFetchAgendaByWeek(year, week) {
    let agendaItems = await data.get(`agenda-${year}-${week}`, { type: "json" });
    if (!agendaItems) {
        await fetchAndStoreAgenda(year, week);
        agendaItems = await data.get(`agenda-${year}-${week}`, { type: "json" });
    } else {
        console.log(`Loaded Items for week ${week} in year ${year} from KV database: ${agendaItems}`);
    }
    return agendaItems;
}

async function getOrFetchAgendaByMonth(year, month) {
    let agendaItems = [];
    const weeksInMonth = getWeeksInMonth(year, month);
    for (const week of weeksInMonth) {
        const weekItems = await getOrFetchAgendaByWeek(year, week);
        agendaItems = agendaItems.concat(weekItems);
    }
    return agendaItems;
}

async function getOrFetchAgendaByDay(year, month, day) {
    const week = getWeekNumber(new Date(year, month - 1, day));
    const weekItems = await getOrFetchAgendaByWeek(year, week);
    return weekItems.filter(item => new Date(item.start).getDate() === day);
}

async function getOrFetchAgendaByYear(year) {
    let agendaItems = [];
    const currentDate = new Date();
    const currentWeek = getWeekNumber(currentDate);

    for (let week = 1; week <= (year === currentDate.getFullYear() ? currentWeek : 52); week++) {
        const weekItems = await getOrFetchAgendaByWeek(year, week);
        agendaItems = agendaItems.concat(weekItems);
    }
    return agendaItems;
}

// Wochen in einem Monat ermitteln
function getWeeksInMonth(year, month) {
    const weeks = new Set();
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    for (let day = firstDay; day <= lastDay; day.setDate(day.getDate() + 1)) {
        weeks.add(getWeekNumber(new Date(day)));
    }

    return Array.from(weeks);
}

// Antwortformatierung je nach Anforderung (ical, json, xml, csv)
function formatAgendaResponse(format, agendaItems) {
    let data;
    let contentType;

    if (format === "ical") {
        data = createIcal(agendaItems);
        contentType = "text/calendar; charset=utf-8";
    } else if (format === "json") {
        data = JSON.stringify(agendaItems);
        contentType = "application/json; charset=utf-8";
    } else if (format === "xml") {
        data = createXml(agendaItems);
        contentType = "application/xml; charset=utf-8";
    } else if (format === "csv") {
        data = createCsv(agendaItems);
        contentType = "text/csv; charset=utf-8";
    }

    return new Response(data, {
        headers: { "content-type": contentType },
    });
}

// Tagesordnung für eine bestimmte Woche abrufen und speichern
async function fetchAndStoreAgenda(year, week) {
    const html = await fetchAgenda(year, week);
    const newAgendaItems = await parseAgenda(html);
    await data.put(`agenda-${year}-${week}`, JSON.stringify(newAgendaItems));
    console.log(`New Items fetched for week ${week} in year ${year}: ${JSON.stringify(newAgendaItems)}.`);
}

// Abrufen der Tagesordnung von der Bundestags-Website
async function fetchAgenda(year, week) {
    const response = await fetch(
        `https://www.bundestag.de/apps/plenar/plenar/conferenceweekDetail.form?year=${year}&week=${week}`,
    );
    if (!response.ok) {
        throw new Error("Failed to fetch agenda");
    }
    return await response.text();
}

// Tagesordnung von HTML zu JSON parsen
async function parseAgenda(html) {
    const $ = cheerio.load(html);
    const tables = $("table.bt-table-data");
    const agendaItems = [];
    const months = {
        Januar: 0, Februar: 1, März: 2, April: 3, Mai: 4, Juni: 5,
        Juli: 6, August: 7, September: 8, Oktober: 9, November: 10, Dezember: 11
    };

    tables.each((_, table) => {
        const dateStr = $(table).find("div.bt-conference-title").text().split("(")[0].trim();
        const [day, monthName, year] = dateStr.split(" ");
        const month = months[monthName];
        const date = new Date(year, month, parseInt(day, 10));

        const rows = $(table).find("tbody > tr");
        for (let i = 1; i < rows.length - 1; i++) {
            const startRow = rows[i];
            const endRow = rows[i + 1];

            const startTimeStr = $(startRow).find('td[data-th="Uhrzeit"]').text().trim();
            const endTimeStr = $(endRow).find('td[data-th="Uhrzeit"]').text().trim();

            const [startHour, startMinute] = startTimeStr.split(":").map(Number);
            const [endHour, endMinute] = endTimeStr.split(":").map(Number);

            const startDateTime = new Date(date);
            startDateTime.setHours(startHour, startMinute);

            const endDateTime = new Date(date);
            endDateTime.setHours(endHour, endMinute);

            let top = $(startRow).find('td[data-th="TOP"]').text().trim();
            const thema = $(startRow).find('td[data-th="Thema"] a.bt-top-collapser').text().trim();
            const beschreibungElem = $(startRow).find('td[data-th="Thema"] p');
            const beschreibung = beschreibungElem.length > 0 ? beschreibungElem.html().replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim() : "";
            const urlElem = $(startRow).find('td[data-th="Thema"] div div div button');
            const url = urlElem.length > 0 ? `https://bundestag.de${urlElem.attr("data-url")}` : "";
            const statusElem = $(startRow).find('td[data-th="Status/ Abstimmung"] p');
            const status = statusElem.length > 0 ? statusElem.html().replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim() : "";

            // Prüfen, ob "TOP" vor der Zahl steht, wenn nicht, hinzufügen
            top = top.split(',').map(part => {
                part = part.trim();
                if (/^\d+$/.test(part)) {
                    return `TOP ${part}`;
                }
                return part;
            }).join(', ');

            const eventDescription = status ? `Status: ${status}\n\n${beschreibung}` : beschreibung;

            const agendaItem = {
                start: startDateTime.toISOString(),
                end: endDateTime.toISOString(),
                top: top,
                thema: thema,
                beschreibung: eventDescription,
                url: url,
                status: status,
                uid: generateUID(startDateTime, thema, top),
                dtstamp: new Date().toISOString()
            };
            agendaItems.push(agendaItem);
        }
    });

    return agendaItems;
}


// Hilfsfunktionen
function foldLine(line) {
    if (line.length <= 70) {
        return line;
    }
    let result = "";
    while (line.length > 70) {
        result += line.substring(0, 70) + "\r\n ";
        line = line.substring(70);
    }
    result += line;
    return result;
}

function createIcal(agendaItems) {
    const cal = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//hutt.io//api.hutt.io/bt-to//',
        'CALSCALE:GREGORIAN',
        'COLOR:#808080',
        'X-APPLE-CALENDAR-COLOR:#808080',
        foldLine(`X-WR-CALNAME:Tagesordnung Bundestag`),
        foldLine(`X-WR-CALDESC:Dieses iCal-Feed stellt die aktuelle Tagesordnung des Plenums des Deutschen Bundestages zur Verfügung. Es aktualisiert sich alle 15min selbst. Zwar ist der Sitzungsverlauf auch online unter bundestag.de/tagesordnung einsehbar, doch leider werden diese Daten nicht in einem maschinenlesbaren Format zur Verfügung gestellt. Deshalb war es Zeit, das selbst in die Hand zu nehmen. Mehr Informationen über das Projekt: https://api.hutt.io/bt-to/.`),
        foldLine(`DESCRIPTION:Dieses iCal-Feed stellt die aktuelle Tagesordnung des Plenums des Deutschen Bundestages zur Verfügung. Es aktualisiert sich alle 15min selbst. Zwar ist der Sitzungsverlauf auch online unter bundestag.de/tagesordnung einsehbar, doch leider werden diese Daten nicht in einem maschinenlesbaren Format zur Verfügung gestellt. Deshalb war es Zeit, das selbst in die Hand zu nehmen. Mehr Informationen über das Projekt: https://api.hutt.io/bt-to/.`),
        'SOURCE;VALUE=URI:https://api.hutt.io/bt-to/ical',
        'BEGIN:VTIMEZONE',
        'TZID:Europe/Berlin',
        'BEGIN:STANDARD',
        'TZNAME:CET',
        'DTSTART:19701025T030000',
        'TZOFFSETFROM:+0200',
        'TZOFFSETTO:+0100',
        'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
        'END:STANDARD',
        'BEGIN:DAYLIGHT',
        'TZNAME:CEST',
        'DTSTART:19700329T020000',
        'TZOFFSETFROM:+0100',
        'TZOFFSETTO:+0200',
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
        'END:DAYLIGHT',
        'END:VTIMEZONE'
    ];

    const weeksWithItems = new Set();

    agendaItems.forEach(item => {
        let dtstart = new Date(item.start);
        let dtend = new Date(item.end);

        // Ensure dtend is at least one minute after dtstart
        if (dtend <= dtstart) {
            dtend = new Date(dtstart.getTime() + 60000); // Add one minute
        }

        const weekNumber = getWeekNumber(dtstart);
        weeksWithItems.add(`${dtstart.getFullYear()}-${weekNumber}`);

        cal.push('BEGIN:VEVENT');
        cal.push(foldLine(`UID:${item.uid}`));
        cal.push(foldLine(`DTSTAMP:${formatDate(item.dtstamp)}`));
        cal.push(foldLine(`DTSTART:${formatDate(dtstart.toISOString())}`));
        cal.push(foldLine(`DTEND:${formatDate(dtend.toISOString())}`));
        cal.push(foldLine(`SUMMARY:${item.top ? `${item.top}: ${item.thema}` : item.thema}`));
        cal.push(foldLine(`DESCRIPTION:${item.beschreibung.replace(/\n/g, '\\n')}`));
        if (item.url) {
            cal.push(foldLine(`URL:${item.url}`));
        }
        cal.push('END:VEVENT');
    });

    weeksWithItems.forEach(week => {
        const [year, weekNumber] = week.split('-');
        const monday = getMondayOfISOWeek(weekNumber, year);
        const friday = new Date(monday);
        friday.setDate(monday.getDate() + 4);

        cal.push('BEGIN:VEVENT');
        cal.push(foldLine(`UID:${generateUID(monday, 'Sitzungswoche', '')}`));
        cal.push(foldLine(`DTSTAMP:${formatDate(new Date().toISOString())}`));
        cal.push(foldLine(`DTSTART;VALUE=DATE:${formatDateOnly(monday.toISOString())}`));
        cal.push(foldLine(`DTEND;VALUE=DATE:${formatDateOnly(new Date(friday.getTime() + 24 * 60 * 60 * 1000).toISOString())}`));
        cal.push(foldLine(`SUMMARY:Sitzungswoche`));
        cal.push('END:VEVENT');
    });

    cal.push('END:VCALENDAR'); // Ensure the END:VCALENDAR line is added

    return cal.join('\r\n');  // Ensure CRLF line endings
}

function createXml(agendaItems) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<agenda>\n';
    agendaItems.forEach((item) => {
        xml += "  <event>\n";
        xml += `    <start>${item.start}</start>\n`;
        xml += `    <end>${item.end}</end>\n`;
        xml += `    <top>${item.top}</top>\n`;
        xml += `    <thema>${item.thema}</thema>\n`;
        if (item.status) {
            xml += `    <status>${item.status}</status>\n`;
        }
        xml += `    <beschreibung>${item.beschreibung}</beschreibung>\n`;
        if (item.url) {
            xml += `    <url>${item.url}</url>\n`;
        }
        xml += "  </event>\n";
    });
    xml += "</agenda>";
    return xml;
}

function createCsv(agendaItems) {
    const csvRows = [
        ["Start", "Ende", "TOP", "Thema", "Beschreibung", "URL", "Status"].join(",")
    ];

    agendaItems.forEach(item => {
        const row = [
            item.start,
            item.end,
            item.top,
            item.thema,
            item.beschreibung.replace(/\n/g, " ").replace(/,/g, ";"), // Replace newlines and commas for CSV format
            item.url,
            item.status,
        ].join(",");
        csvRows.push(row);
    });

    return csvRows.join("\n");
}

// Generierung einer eindeutigen ID für jeden Tagesordnungspunkt
function generateUID(startDateTime, thema, top) {
    return `${startDateTime.getTime()}-${thema.replace(/\s+/g, "-").toLowerCase()}-${top.replace(/\s+/g, "-").toLowerCase()}@api.hutt.io`;
}

// Formatieren des Datums nach den Anforderungen des Kalenders
function formatDate(date) {
    return date.replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Formatieren des Datums für getMondayOfISOWeek()
function formatDateOnly(date) {
    return date.split('T')[0].replace(/-/g, '');
}

// Ermitteln, welches Datum der Montag einer Woche hat
function getMondayOfISOWeek(week, year) {
    const simple = new Date(year, 0, 4 + (week - 1) * 7);
    const dayOfWeek = simple.getUTCDay();
    const ISOweekStart = new Date(simple);
    ISOweekStart.setUTCDate(simple.getUTCDate() - (dayOfWeek + 6) % 7);
    return ISOweekStart;
}

// Ermitteln der Kalenderwoche eines bestimmten Datums
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));

    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

    return weekNo;
}

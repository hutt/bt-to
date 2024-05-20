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

    let response;

    if (path === "/bt-to/" || path === "/bt-to") {
        response = await serveDocumentation();
    } else if (path === "/bt-to/data-list") {
        response = await serveDataList(request);
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

    return response;
}

// Dokumentationsseite der API bereitstellen
async function serveDocumentation() {
    const html = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bundestag Tagesordnung API</title>
    <meta name="keywords" content="Bundestag, Parlament, Tagesordnung, Sitzungsverlauf, API, Kalender, iCal, Feed, JSON, XML, CSV, Export, maschinenlesbar, Kalenderabo">
    <meta name="description" content="Endlich maschinenlesbar und als Kalender-Feed: Die Tagesordnung des Bundestages.">
    
    <meta property="og:title" content="Bundestags-TO API">
    <meta property="og:url" content="http://api.hutt.io/bt-to/">
    <meta property="og:image" content="">
    <meta property="og:description" content="Endlich maschinenlesbar und als Kalender-Feed: Die Tagesordnung des Bundestages.">
    <meta property="og:type" content="website">
    
    <meta name="twitter:card" content="summary">
    <meta property="twitter:title" content="Bundestags-TO API">
    <meta property="twitter:description" content="Endlich maschinenlesbar und als Kalender-Feed: Die Tagesordnung des Bundestages.">
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
            color: #333;
        }
        header {
            background-color: #0a4445;
            color: white;
            text-align: center;
            padding: 20px 0;
        }
        h1 {
            font-size: 2em;
            margin: 0;
        }
        h2 {
            font-size: 1.7em;
            color: #0a4445;
            margin-top: 2.5rem;
            margin-bottom: 0;
        }
        main > section:first-child > h2 {
            margin-top: 0;
        }
        h3 {
            font-size: 1.5em;
            font-weight: 400;
            color: #333333;
            margin-top: 1.6rem;
            margin-bottom: 0;
        }
        main {
            max-width: 800px;
            margin: 20px auto;
            padding: 20px;
            background-color: #fff;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        ul {
            list-style-type: disc;
            padding-left: 20px;
        }
        li {
            margin-bottom: 10px;
        }
        li ul {
            padding-left: 20px;
            margin-top: 10px;
            margin-bottom: 20px;
        }
        ul.data {
            list-style-type: none;
        }
        a {
            color: #0a4445;
            text-decoration: none;
            border-bottom: 1px dotted;
        }
        a:hover {
            text-decoration: none;
            border-bottom: 1px solid;
        }
        a.buy-me-a-coffee, a.buy-me-a-coffee:hover {
            text-decoration: none;
            border-bottom: none;
        }
        strong {
            font-weight: 600;
        }
        code {
            background-color: #e8e8e8;
            padding: 2px 4px;
            border-radius: 4px;
        }
        pre {
            background-color: #e8e8e8;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
        }
        footer {
            text-align: center;
            margin-top: 20px;
            margin-bottom: 20px;
            padding: 10px;
            font-size: 0.8em;
            color: #777;
        }
        @media (max-width: 800px) {
            main {
                margin: 1rem;
                padding: 15px;
            }
            footer {
                font-size: 0.6em;
            }
        }
    </style>
</head>
<body>

<header>
    <h1>Bundestag Tagesordnung</h1>
    <p>Inoffizielle iCal-, JSON-, XML- und CSV-API.</p>
</header>

<main>
    <section id="hintergrund">
        <h2>Hintergrund</h2>
        <p>Der Deutsche Bundestag stellt seine Tagesordnung <a href="https://www.bundestag.de/tagesordnung">online zur Verfügung</a> &ndash; nur leider in keinem maschinenlesbaren Format. Da in Sitzungswochen mindestens 734 Abgeordnetenbüros händisch die Tagesordnungspunkte in ihren Kalendern aktualisieren müssen, war es Zeit für eine Alternative.</p>
        <p>Aus diesem Grund stelle ich (ein einfacher MdB-Mitarbeiter) mithilfe eines Cloudflare-Workers diese API bereit, die die aktuelle Tagesordnung von der Website des Deutschen Bundestags scraped und in einer Key-Value-Datenbank zwischenspeichert.</p>
        <p>Die Tagesordnungspunkte für die laufenden Sitzungswoche werden alle 15min aktualisiert. Außerdem können die <a href="#vorhandene-daten">Tagesordnungen vergangener Sitzungswochen oder gleich ganzer Jahre</a> abgefragt oder heruntergeladen werden.</p>
        <p>Falls etwas nicht funktioniert, wie es soll: Nicht wundern, das Projekt ist in der <strong>Beta-Phase</strong>. Ich freue mich über einen freundlichen Hinweis (<a href="#quellcode">*klick*</a>).</p>
    </section>

    <section id="feed-abonnieren">
        <h2>Kalenderfeed abonnieren</h2>
        <p>Um die &ndash; in Sitzungswochen alle 15min aktualisiserten &ndash; Tagesordnungen des laufenden Jahres als iCal-Feed zu abonnieren, kann folgende URL verwendet werden: <code>https://api.hutt.io/bt-to/ical</code>.</p>
        <p>Neben <strong>Startzeit, TOP und Thema</strong> enthalten die Kalendereinträge außerdem <strong>aktuelle Informationen zum Status des Tagesordnungspunktes</strong>, den etwas ausführlicheren <strong>Beschreibungstext</strong> und, falls vorhanden, einen <strong>Link zum zugehörigen Artikel</strong> im bundestag.de-Textearchiv.</p>
        <p>Aus Performance-Gründen enthält dieses Feed <em>nicht</em> die Tagesordnungen vergangener Kalenderjahre. Sie können mit dieser API allerdings auch abgefragt oder <a href="#vorhandene-daten">händisch heruntergeladen</a> werden.</p>
        <h3>Outlook (Windows)</h3>
        <ol>
            <li>Öffnen Sie Ihren Outlook-Kalender, und wählen Sie auf der Registerkarte Start die Option <strong>Kalender hinzufügen > Aus dem Internet</strong> aus.
            <li>Fügen Sie die URL <code>https://api.hutt.io/bt-to/ical</code> ein und klicken Sie auf <strong>OK</strong>.</li>
            <li>Outlook fragt, ob Sie diesen Kalender hinzufügen und Updates abonnieren möchten. Wählen Sie <strong>Ja</strong> aus.</li>
        </ol>
        <h3>Thunderbird</h3>
        <ol>
            <li>Öffnen Sie Thunderbird und wählen Sie <strong>Datei > Neu > Kalender…</strong></li>
            <li>Wählen Sie Im Netzwerk und klicken Sie auf <strong>Weiter</strong>.</li>
            <li>Wählen Sie in der „Format“-Liste den Auswahlknopf <strong>iCalendar (ICS)</strong>.</li>
            <li>Fügen Sie den Link <code>https://api.hutt.io/bt-to/ical</code> in das Feld neben „Adresse“ ein. Klicken Sie danach auf <strong>Weiter</strong>.</li>
            <li>Klicken Sie auf <strong>Fertigstellen</strong>.</li>
        </ol>
        <h3>iOS Kalender-App</h3>
        <ol>
            <li>Öffnen Sie die <strong>Einstellungen</strong>-App.</li>
            <li>Tippen Sie auf <strong>„Accounts & Passwörter“</strong>, wählen Sie <strong>„Account hinzufügen“</strong>, dann <strong>„Andere“</strong> aus.</li>
            <li>Fügen Sie ein <strong>neues „Kalenderabo“</strong> mit der URL <code>https://api.hutt.io/bt-to/ical</code> hinzu.</li>
        </ol>
        <h3>macOS Kalender-App</h3>
        <ol>
            <li>Öffnen Sie die <strong>Kalender</strong>-App.</li>
            <li>Gehen Sie in der Menüleiste zu <strong>„Datei“ > „Neues Kalenderabonnement“</strong>.</li>
            <li>Fügen Sie nun den Link <code>https://api.hutt.io/bt-to/ical</code> ein und klicken Sie auf <strong>„Abonnieren“</strong>.</li>
        </ol>
    </section>

    <section id="api-endpoints">
        <h2>API Endpoints</h2>
        <p>GET-Parameter, die für Abfragen genutzt werden können:</p>
        <ul>
            <li><code>year</code>: Das Jahr, für das die Tagesordnungen geholt werden sollen (optional)</li>
            <li><code>week</code>: Die Kalenderwoche, für die die Tagesordnungen geholt werden sollen (optional; mit <code>year</code> kombinierbar)</li>
        </ul>

        <h3>iCal Format</h3>
        <p>Beispiel-Request:</p>
        <pre><code>GET https://api.hutt.io/bt-to/ical</code></pre>
        <p>Beispiel-Antwort:</p>
        <pre><code class="hljs" data-lang="text">BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//hutt.io//api.hutt.io/bt-to//
CALSCALE:GREGORIAN
COLOR:#808080
X-WR-CALNAME:Tagesordnung Bundestag
DESCRIPTION:Dieses iCal-Feed stellt die aktuelle Tagesordnung des Plen
    ums des Deutschen Bundestages zur Verfügung. Es aktualisiert sich alle
    15min selbst. Zwar ist der Sitzungsverlauf auch online unter bundesta
    g.de/tagesordnung einsehbar, doch leider werden diese Daten nicht in e
    inem maschinenlesbaren Format zur Verfügung gestellt. Deshalb war es Z
    eit, das selbst in die Hand zu nehmen. Mehr Informationen über das Pro
    jekt: https://api.hutt.io/bt-to/.
SOURCE;VALUE=URI:https://api.hutt.io/bt-to/ical
BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:STANDARD
TZNAME:CET
DTSTART:19701025T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
BEGIN:DAYLIGHT
TZNAME:CEST
DTSTART:19700329T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
END:VTIMEZONE
[…]
BEGIN:VEVENT
UID:1705512600000-zweites-haushaltsfinanzierungsgesetz-2024-top-5,-zp-
    2@api.hutt.io
DTSTAMP:20240520T132124Z
DTSTART:20240117T173000Z
DTEND:20240117T182000Z
SUMMARY:TOP 5, ZP 2: Zweites Haushaltsfinanzierungsgesetz 2024
                                                            
DESCRIPTION:Status: Rede zu Protokoll: Lötzsch, Dr. Gesine (Gruppe Die
    os)\nÜberweisung 20/9999, 20/10054 beschlossen\n\nErste Beratung des v
    on den Fraktionen SPD, BÜNDNIS 90/DIE GRÜNEN und FDP \neingebrachten E
    ntwurfs eines Zweiten Haushaltsfinanzierungsgesetzes 2024\nDrucksache 
    20/9999\n\nZP 2) Beratung des Antrags der Fraktion der AfD\nLuftverkeh
    rsteuer aussetzen und evaluieren\nDrucksache 20/10054
URL:https://bundestag.de/dokumente/textarchiv/2024/kw03-de-zweites-hau
    shaltsfinanzierungsgesetz-986276
END:VEVENT
[…]
END:VCALENDAR</code></pre>

        <h3>JSON Format</h3>
        <p>Beispiel-Request:</p>
        <pre><code>GET https://api.hutt.io/bt-to/json</code></pre>
        <p>Beispiel-Antwort:</p>
        <pre><code class="hljs" data-lang="json">[
    […]
    {
        "start":"2024-01-17T17:30:00.000Z",
        "end":"2024-01-17T18:20:00.000Z",
        "top":"TOP 5, ZP 2",
        "thema":"Zweites Haushaltsfinanzierungsgesetz 2024",
        "beschreibung":"Status: Rede zu Protokoll: Lötzsch, Dr. Gesine (fraktionslos)\nÜberweisung 20/9999, 20/10054 beschlossen\n\nErste Beratung des von den Fraktionen SPD, BÜNDNIS 90/DIE GRÜNEN und FDP \neingebrachten Entwurfs eines Zweiten Haushaltsfinanzierungsgesetzes 2024\nDrucksache 20/9999\n\nZP 2) Beratung des Antrags der Fraktion der AfD\nLuftverkehrsteuer aussetzen und evaluieren\nDrucksache 20/10054",
        "url":"https://bundestag.de/dokumente/textarchiv/2024/kw03-de-zweites-haushaltsfinanzierungsgesetz-986276",
        "status":"Rede zu Protokoll: Lötzsch, Dr. Gesine (fraktionslos)\nÜberweisung 20/9999, 20/10054 beschlossen",
        "uid":"1705512600000-zweites-haushaltsfinanzierungsgesetz-2024-top-5,-zp-2@api.hutt.io",
        "dtstamp":"2024-05-20T13:21:24.071Z",
    },
    […]
]</code></pre>

        <h3>XML Format</h3>
        <p>Beispiel-Request:</p>
        <pre><code>GET https://api.hutt.io/bt-to/xml</code></pre>
        <p>Beispiel-Antwort:</p>
        <pre><code class="hljs" data-lang="xml">&lt;agenda&gt;
    […]
    &lt;event&gt;
        &lt;start&gt;2024-01-17T17:30:00.000Z&lt;/start&gt;
        &lt;end&gt;2024-01-17T18:20:00.000Z&lt;/end&gt;
        &lt;top&gt;TOP 5, ZP 2&lt;/top&gt;
        &lt;thema&gt;Zweites Haushaltsfinanzierungsgesetz 2024&lt;/thema&gt;
        &lt;status&gt;
            Rede zu Protokoll: Lötzsch, Dr. Gesine (fraktionslos) Überweisung 20/9999, 20/10054 beschlossen
        &lt;/status&gt;
        &lt;beschreibung&gt;
            Status: Rede zu Protokoll: Lötzsch, Dr. Gesine (fraktionslos) Überweisung 20/9999, 20/10054 beschlossen Erste Beratung des von den Fraktionen SPD, BÜNDNIS 90/DIE GRÜNEN und FDP eingebrachten Entwurfs eines Zweiten Haushaltsfinanzierungsgesetzes 2024 Drucksache 20/9999 ZP 2) Beratung des Antrags der Fraktion der AfD Luftverkehrsteuer aussetzen und evaluieren Drucksache 20/10054
        &lt;/beschreibung&gt;
        &lt;url&gt;
            https://bundestag.de/dokumente/textarchiv/2024/kw03-de-zweites-haushaltsfinanzierungsgesetz-986276
        &lt;/url&gt;
    &lt;/event&gt;
    […]
&lt;/agenda&gt;</code></pre>

        <h3>CSV Format</h3>
        <p>Beispiel-Request:</p>
        <pre><code>GET https://api.hutt.io/bt-to/csv</code></pre>
        <p>Beispiel-Antwort:</p>
        <pre><code class="hljs" data-lang="csv">Start;Ende;TOP;Thema;Beschreibung;URL;Status
[…]
2024-01-17T17:30:00.000Z;2024-01-17T18:20:00.000Z;TOP 5, ZP 2;Zweites Haushaltsfinanzierungsgesetz 2024;"Status: Rede zu Protokoll: Lötzsch, Dr. Gesine (fraktionslos)
Überweisung 20/9999, 20/10054 beschlossen

Erste Beratung des von den Fraktionen SPD, BÜNDNIS 90/DIE GRÜNEN und FDP 
eingebrachten Entwurfs eines Zweiten Haushaltsfinanzierungsgesetzes 2024
Drucksache 20/9999

ZP 2) Beratung des Antrags der Fraktion der AfD
Luftverkehrsteuer aussetzen und evaluieren
Drucksache 20/10054";https://bundestag.de/dokumente/textarchiv/2024/kw03-de-zweites-haushaltsfinanzierungsgesetz-986276;"Rede zu Protokoll: Lötzsch, Dr. Gesine (fraktionslos)
Überweisung 20/9999, 20/10054 beschlossen"
[…]</code></pre>
    </section>

    <section id="vorhandene-daten">
        <h2>Vorhandene Daten</h2>
        <p>Hier sind die mit dieser API abrufbaren Daten inkl. Links zum direkten Download aufgelistet. Aktuell sind Abfragen auf Datensätze ab 2020 begrenzt.</p>
        <ul id="data-list" class="data">
            <li><svg width="12" height="12" stroke="#000" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><style>.spinner_V8m1{transform-origin:center;animation:spinner_zKoa 2s linear infinite}.spinner_V8m1 circle{stroke-linecap:round;animation:spinner_YpZS 1.5s ease-in-out infinite}@keyframes spinner_zKoa{100%{transform:rotate(360deg)}}@keyframes spinner_YpZS{0%{stroke-dasharray:0 150;stroke-dashoffset:0}47.5%{stroke-dasharray:42 150;stroke-dashoffset:-16}95%,100%{stroke-dasharray:42 150;stroke-dashoffset:-59}}</style><g class="spinner_V8m1"><circle cx="12" cy="12" r="9.5" fill="none" stroke-width="3"></circle></g></svg> Daten werden geladen...</li>
        </ul>
    </section>

    <section id="quellcode">
        <h2>Quellcode und Weiterentwicklung</h2>
        <p>Das Projekt ist <a href="https://github.com/hutt/bt-to/blob/main/LICENSE.md">unter MIT lizensiert</a> und damit <strong>Open Source</strong>. Wer sich den Quellcode ansehen oder dazu beitragen möchte, findet die <strong>Repository dieses Projekts <a href="https://github.com/hutt/bt-to">auf GitHub</a></strong>.</p>
        <p>Die Entwicklung weiterer Funktionen, unter anderem von Themen- bzw. Ausschusszugehörigkeits-Filtern ist geplant. Da dieses Projekt nur ein Hobby ist, kann aber nicht gesagt werden, wie schnell das geht.</p>
        <p>Sie haben Fehler zu berichten oder Ideen für die Weiterentwicklung? <a href="https://hutt.io/#kontakt">Hier können Sie mich kontaktieren</a>.</p>
    </section>

    <section id="unterstuetzen">
        <h2>Unterstützen</h2>
        <p>In solche Projekte fließt eine Menge Zeit und meistens auch ein bisschen Geld fürs Hosting. Wenn Sie die (Weiter-)Entwicklung und den Betrieb unterstützen wollen (worüber ich mich sehr freue), können Sie mir über den Link unten einen (digitalen) Kaffee kaufen.</p>
        <p>Vielen Dank!</p>
        <p><a class="buy-me-a-coffee" href="https://www.buymeacoffee.com/jannishutt" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a></p>
    </section>
</main>

<footer>
    &copy; 2024 <a href="https://hutt.io">Jannis Hutt</a>.
</footer>

<script>
    document.addEventListener("DOMContentLoaded", async () => {
        const response = await fetch("/bt-to/data-list");
        const kvData = await response.json();
        const dataListElement = document.getElementById("data-list");

        const years = Object.keys(kvData).sort((a, b) => b - a); // Jahre absteigend sortieren
        let dataListHtml = '';

        years.forEach(year => {
            const weeks = kvData[year].filter(week => week).sort((a, b) => a - b); // Wochen pro Jahr aufsteigend sortieren und leere Objekte herausfiltern
            let weeksHtml = '';
            if (weeks.length === 0) {
                weeksHtml = '<li>keine Daten</li>';
            } else {
                weeks.forEach(week => {
                    weeksHtml += \`
                        <li>Kalenderwoche \${week} 
                            (<a href="/bt-to/ical?year=\${year}&week=\${week}">iCal</a> | 
                            <a href="/bt-to/json?year=\${year}&week=\${week}">JSON</a> | 
                            <a href="/bt-to/xml?year=\${year}&week=\${week}">XML</a> | 
                            <a href="/bt-to/csv?year=\${year}&week=\${week}">CSV</a>)
                        </li>\`;
                });
            }

            const yearLinks = weeks.length >= 1 ? \` 
                (<a href="/bt-to/ical?year=\${year}">iCal</a> | 
                <a href="/bt-to/json?year=\${year}">JSON</a> | 
                <a href="/bt-to/xml?year=\${year}">XML</a> | 
                <a href="/bt-to/csv?year=\${year}">CSV</a>)\` : '';

            dataListHtml += \`<li><strong>\${year}</strong>\${yearLinks}<ul class="data">\${weeksHtml}</ul></li>\`;
        });

        dataListElement.innerHTML = dataListHtml;
    });
</script>

</body>
</html>
`;

    return new Response(html, {
        headers: { "content-type": "text/html; charset=UTF-8" }
    });
}

// Liste mit gecachten Daten bereitstellen
async function serveDataList(request) {
    // Cache-Zeit für Daten aus KV Storage
    const cacheDuration = 15 * 60; // 15 min in Sekunden

    const cache = caches.default;
    const cacheKey = new Request(new URL(request.url).toString());

    // Versuchen, Antwort aus dem Cache zu laden.
    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
        return cachedResponse;
    }

    // Wenn nicht im Cache, aus dem KV Storage laden.
    let kvData = {};
    const currentYear = new Date().getFullYear();

    const fetchYearData = async (year) => {
        let yearData = [];
        let weekPromises = [];

        for (let week = 1; week <= 52; week++) {
            weekPromises.push(data.get(`agenda-${year}-${week}`, { type: "json" }).then(dataItem => {
                if (dataItem && Object.keys(dataItem).length > 0) {
                    yearData.push(week);
                }
            }));
        }

        await Promise.all(weekPromises);
        return { year, weeks: yearData };
    };

    let yearPromises = [];
    for (let year = currentYear; year >= 2020; year--) { // Daten vor 2020 nicht laden
        yearPromises.push(fetchYearData(year));
    }

    const yearDataArray = await Promise.all(yearPromises);

    yearDataArray.forEach(yearData => {
        kvData[yearData.year] = yearData.weeks;
    });

    // Geholte Daten cachen
    const response = new Response(JSON.stringify(kvData), {
        headers: { 'Content-Type': 'application/json' }
    });
    response.headers.append('Cache-Control', `max-age=${cacheDuration}`);
    await cache.put(cacheKey, response.clone());

    return response;
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

// Tagesordnung per Cronjob (alle 15min) aktualisieren.
async function updateAgenda() {
    const year = new Date().getFullYear();
    const week = getWeekNumber(new Date());
    const html = await fetchAgenda(year, week);
    const newAgendaItems = await parseAgenda(html);

    // Bereits existierende Tagesordnungspunkte aus KV Storage holen
    const currentItemsRaw = await data.get(`agenda-${year}-${week}`, { type: "json" });

    // Überprüfen, ob die Daten vorhanden und gültig sind
    let currentItemsArray = [];
    if (currentItemsRaw) {
        try {
            if (currentItemsRaw.trim().length > 0) {
                currentItemsArray = JSON.parse(currentItemsRaw);
            }
        } catch (e) {
            console.error("Failed to parse currentItemsRaw:", e);
            currentItemsArray = [];
        }
    }

    // Neue und aktualisierte Items in KV Storage speichern
    const updatedItems = newAgendaItems.map(newItem => {
        const currentItem = currentItemsArray.find(item => item.uid === newItem.uid);
        if (currentItem) {
            // Überprüfen, ob es Änderungen gibt
            if (JSON.stringify(currentItem) !== JSON.stringify(newItem)) {
                return newItem;
            } else {
                return currentItem;
            }
        } else {
            return newItem;
        }
    });

    // Nur neue oder geänderte Items speichern
    if (updatedItems.length > 0) {
        await data.put(`agenda-${year}-${week}`, JSON.stringify(updatedItems));
    }
}

// Funktionen zum Abrufen oder Abrufen und Speichern der Tagesordnung
async function getOrFetchAgendaByWeek(year, week) {
    let agendaItems = await data.get(`agenda-${year}-${week}`, { type: "json" });
    if (!agendaItems) {
        await fetchAndStoreAgenda(year, week);
        agendaItems = await data.get(`agenda-${year}-${week}`, { type: "json" });
    } else {
        //console.log(`Loaded Items for week ${week} in year ${year} from KV database: ${agendaItems}`);
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
    //console.log(`New Items fetched for week ${week} in year ${year}: ${JSON.stringify(newAgendaItems)}.`);
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
      ["Start", "Ende", "TOP", "Thema", "Beschreibung", "URL", "Status"].map(escapeCsvValue).join(",")
    ];
    agendaItems.forEach((item) => {
      const row = [
        item.start,
        item.end,
        item.top,
        item.thema,
        item.beschreibung,
        item.url,
        item.status
      ].map(escapeCsvValue).join(",");
      csvRows.push(row);
    });
    return csvRows.join("\n");
  }

// Escapen der Daten für CSV-Export
function escapeCsvValue(value) {
    if (typeof value === "string") {
      value = value.replace(/"/g, '""');
      if (/[",\n]/.test(value)) {
        value = `"${value}"`;
      }
    }
    return value;
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

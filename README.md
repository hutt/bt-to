# BT-TO API 🏛️📅
Bundestags-Tagesordnung als iCal-Feed (und mehr)

![Link Preview Image](bt-to-api.svg)

## Overview

**bt-to** is a Cloudflare Worker that fetches the session agenda (Tagesordnung) from the German Bundestag's website, stores it in a KV database, and serves it as an API. This project provides access to the Bundestag's session agenda in various formats, making it easier to integrate and consume this data programmatically.

## Hintergrund (DE)

Der Deutsche Bundestag stellt seine Tagesordnung online zur Verfügung – nur leider in keinem maschinenlesbaren Format. Da in Sitzungswochen mindestens 734 Abgeordnetenbüros händisch die Tagesordnungspunkte in ihren Kalendern aktualisieren müssen, war es Zeit für eine Alternative. Jetzt genügt es, den mit diesem Cloudflare Worker generierten Kalender-Feed zu abonnieren, um immer auf dem Laufenden zu sein.

## Background (EN)

The German Bundestag makes its agenda available online - but unfortunately not in a machine-readable format. Since at least 734 MPs' offices have to manually update the agenda items in their calendars during session weeks, it was time for an alternative. Now all you have to do is subscribe to the calendar feed generated with this Cloudflare Worker to always be up to date.

## Features

- Fetches the current agenda from the official Bundestag website.
- Stores the agenda in a Cloudflare KV database for efficient retrieval.
- Serves the agenda in multiple formats:
  - JSON
  - XML
  - CSV
  - iCal (ICS)
- Automatically updates the stored agenda at regular intervals.
- Provides a simple API for accessing the stored data.

## How It Works

1. **Event Listeners**:
   - `fetch` event: Handles incoming HTTP requests.
   - `scheduled` event: Handles scheduled tasks for updating the agenda.

2. **API Endpoints**:
   - `/bt-to/` or `/bt-to`: Serves the API documentation.
   - `/bt-to/ical` or `/bt-to/ics`: Serves the agenda in iCal format.
   - `/bt-to/json`: Serves the agenda in JSON format.
   - `/bt-to/xml`: Serves the agenda in XML format.
   - `/bt-to/csv`: Serves the agenda in CSV format.

3. **Agenda Fetching**:
   - Fetches the agenda from the Bundestag website for the specified year and week.
   - Parses the HTML response using `cheerio` to extract relevant data.
   - Stores the parsed agenda items in a KV database.

4. **Data Storage and Retrieval**:
   - The agenda data is stored in a Cloudflare KV database with keys based on the year and week.
   - Retrieves stored data efficiently to serve API requests.

5. **Updating Agenda**:
   - A scheduled task runs periodically to fetch the latest agenda and update the KV database if there are changes.

## Installation and Setup

1. **Clone the Repository**:
   ```sh
   git clone https://github.com/hutt/bt-to.git
   cd bt-to
   ```

2. **Install Dependencies**:
   ```sh
   npm install
   ```

3. **Deploy to Cloudflare Workers**:
   - Ensure you have a Cloudflare account and Workers KV namespace setup.
   - Configure your Cloudflare Worker settings in `wrangler.toml`.
   - Deploy using `wrangler`:
     ```sh
     npx wrangler publish
     ```

## API Documentation

### Fetch Agenda in iCal Format

- **Endpoint**: `/bt-to/ical` or `/bt-to/ics`
- **Description**: Returns the current agenda in iCal format.
- **Parameters**:
  - `year`: Optional, the year of the agenda.
  - `week`: Optional, the week of the agenda.
  - `na`: Optional, boolean; if true, includes additional calendar entries for nominal votes.
  - `naAlarm`: Optional, boolean; if true, sets an alarm 15 minutes before nominal votes.
  - `showSW`: Optional, boolean; if true, includes all-day events for session weeks.

### Fetch Agenda in JSON Format

- **Endpoint**: `/bt-to/json`
- **Description**: Returns the current agenda in JSON format.
- **Parameters**:
  - `year`: Optional, the year of the agenda.
  - `week`: Optional, the week of the agenda.

### Fetch Agenda in XML Format

- **Endpoint**: `/bt-to/xml`
- **Description**: Returns the current agenda in XML format.
- **Parameters**:
  - `year`: Optional, the year of the agenda.
  - `week`: Optional, the week of the agenda.

### Fetch Agenda in CSV Format

- **Endpoint**: `/bt-to/csv`
- **Description**: Returns the current agenda in CSV format.
- **Parameters**:
  - `year`: Optional, the year of the agenda.
  - `week`: Optional, the week of the agenda.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE.md) file for details.

## Acknowledgements

- This project uses the [cheerio](https://github.com/cheeriojs/cheerio) library for HTML parsing.

## Buy Me A Coffee!

[!["Buy Me A Coffee"](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/jannishutt)

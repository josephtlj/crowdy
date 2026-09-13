# Crowdy

Real-time crowd levels for MRT/LRT stations and shopping malls/attractions in Singapore — check how busy a place is before heading there, and see quieter alternatives nearby if there is one.

SC2006 Software Engineering group project (SCSJ Group 3).

## What it does

- **Transit crowd levels** — real-time MRT/LRT crowd density from LTA DataMall (Low/Moderate/High), with accurate per-station opening/closing hours so a closed station shows as closed rather than a stale reading.
- **Mall/venue crowd levels** — Google's own Popular Times data, scraped for 100+ validated Singapore malls, refreshed daily plus on-demand whenever a venue's page is opened.
- **Weekly crowd histogram** — a full week's hourly pattern per venue, not just "right now."
- **Opening hours** — per-venue, including correct handling for round-the-clock venues.
- **Alternatives nearby** — lower-crowd venues of the same type within 3km.
- **Search** — filters the full known venue list by name, not just what's on screen.
- **Live map** — crowd-coloured pins, transit/venue layer toggles, recentre-to-me.
- **Saved venues** — works without an account (on-device only), or synced across devices once signed in. Signing up/in offers to carry over anything saved as a guest rather than discarding it.
- **User accounts** — username/password signup and login, favourites stored server-side once signed in.

## Structure

- `/app` — Expo/React Native frontend, one codebase targeting iOS and Android (web is not a supported target — see Known limitations)
- `/server` — Node/Express backend, aggregates and normalises crowd data from multiple sources, and owns the account/favourites database
- `/docs` — SDLC deliverables (requirements, use cases, UML diagrams) — not created yet; documentation is being done in one pass once the app itself is feature-complete, rather than incrementally

## Architecture

Two halves: the Expo app talks only to the Crowdy backend, never directly to any external data source. The backend pulls together several independent sources into one venue list, and separately owns a MySQL database for accounts/favourites.

- **App (Expo)** talks only to **Backend (Express)**, over `/venues`, `/lines`, `/auth`, `/favourites`.
- **Backend** talks to three independent external data sources (below) to build its venue list, and to **MySQL** for accounts/favourites — the app never touches either directly.

**Data sources:**

- **LTA DataMall** — official real-time MRT/LRT platform crowd density (`server/src/services/lta.ts`)
- **Google Popular Times** — no official API exists for this; the backend drives a real headless browser through the same flow a person browsing Google Maps would (`server/src/services/popularTimes.ts`). Runs once daily for the full venue list, plus a fresh check whenever a venue's Detail screen opens.
- **sgtrainstatus.com / sgtrains.com** — real first/last train timings per MRT/LRT station, compiled once via a one-off script (`server/scripts/build-station-hours.ts`) into a static `server/src/data/stationHours.ts`, not fetched at runtime.
- **OneMap** — free government geocoding, used once at build time to resolve mall coordinates (`server/scripts/build-mall-list.ts`)

**Database:** MySQL, currently hosted on Aiven's free tier (`accounts` and `favourites` tables — everything else, including all crowd data, lives in the backend's own cache files, not the database). Local development can use a local MySQL install instead; see `server/.env` for how to switch between the two.

## Testing platform

Expo Go, currently SDK 57. iOS and Android — not the web target (see below). No App Store/Play Store submission needed for this course; Expo Go is the plan through the final demo.

## Known limitations

- **Android has no map.** Expo Go's own team made a deliberate decision to drop Google Maps support entirely from Expo Go (confirmed via [react-native-maps#5888](https://github.com/react-native-maps/react-native-maps/issues/5888), closed by the maintainer as "not our bug, an Expo Go decision") — not a bug in this project, and not fixable without leaving Expo Go for a custom development build. iOS is unaffected since it uses Apple Maps by default, not Google Maps.
- **Web has no map either** — `react-native-maps` has no web renderer at all; the web build shows a placeholder instead. Web was never a real target platform for this project.

## Branches

- `main` — stable/demo-ready
- `dev` — integration branch (all work currently happens here)
- `feature/*` — one per feature, branched from `dev`

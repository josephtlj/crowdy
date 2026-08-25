# Crowdy

Real-time crowd levels for malls, attractions, hawker centres, and public transport in Singapore.

SC2006 Software Engineering group project.

## Structure (planned)

- `/app` — React Native (Expo) frontend — targets Web, Android, iOS from one codebase
- `/server` — Node.js/Express backend — aggregates and normalizes crowd data from multiple sources
- `/docs` — SDLC deliverables (requirements, use cases, UML diagrams)

## Data sources (planned)

- LTA DataMall — official real-time/forecast MRT & LRT platform crowd density
- Google Popular Times — crowd levels for malls, attractions, hawker centres

## Branching

- `main` — stable/demo-ready
- `dev` — integration branch
- `feature/*` — one per feature, branched from `dev`, squash-merged back

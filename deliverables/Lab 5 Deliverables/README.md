# Lab 5 Deliverables: Crowdy

SCSJ Group 3, SC2006 Software Engineering.

Crowdy is an iOS app for checking how crowded Singapore's MRT/LRT stations and shopping malls are before heading there. It combines live station crowds from LTA DataMall, each mall's usual crowd from Google Popular Times and routing from OneMap, suggests quieter malls nearby, and helps a group of friends pick a mall that is fair for everyone to reach and not too crowded.

Demo video: *(link to be added)*

## Documents

| Deliverable | File | What it contains |
|---|---|---|
| Software Requirements Specification | [SCSJ_Group3_Lab5_SRS.pdf](SCSJ_Group3_Lab5_SRS.pdf) ([.docx](SCSJ_Group3_Lab5_SRS.docx)) | Functional and non-functional requirements, data dictionary, use case diagram, UI mockups (screenshots of the final app), system architecture, class diagrams and dialog map (Appendix B), changes since Lab 1 (Appendix D) and team contributions (Appendix E) |
| Use Case Model | [SCSJ_Group3_Lab5_UseCases.pdf](SCSJ_Group3_Lab5_UseCases.pdf) ([.docx](SCSJ_Group3_Lab5_UseCases.docx)) | Use case diagram and the 31 use case descriptions, in the course's use case template |
| Test Cases | [SCSJ_Group3_Lab5_TestCases.pdf](SCSJ_Group3_Lab5_TestCases.pdf) ([.docx](SCSJ_Group3_Lab5_TestCases.docx)) | Black-box test cases for AlternativesFinder, basis path test cases for isOpenAt and tokenHits with their control flow graphs, and the results of running them on the final code |
| Demo Slides | [SCSJ_Group3_Lab5_Slides.pdf](SCSJ_Group3_Lab5_Slides.pdf) ([.pptx](SCSJ_Group3_Lab5_Slides.pptx)) | The 15 slides from our Lab 5 demo: the problem and our users, features and data sources, the demo route, architecture, software engineering principles, SOLID, design patterns, design choices, testing, traceability for two use cases and future work. The .pptx includes the speaker notes |

## Diagrams

Full-resolution copies of every diagram in the documents are in [SCSJ_Group3_Lab5_Diagrams/](SCSJ_Group3_Lab5_Diagrams/), as PNG and SVG.

| Diagram | File | Where it appears |
|---|---|---|
| Use case diagram | [usecase-diagram.png](SCSJ_Group3_Lab5_Diagrams/usecase-diagram.png) | SRS, Figure 2.2 |
| System architecture | [architecture.png](SCSJ_Group3_Lab5_Diagrams/architecture.png) | SRS, Figure 2.1 |
| Entity classes: accounts and crowd data | [class-entities-1.png](SCSJ_Group3_Lab5_Diagrams/class-entities-1.png) | SRS, Figure B.1 |
| Entity classes: routes and meetups | [class-entities-2.png](SCSJ_Group3_Lab5_Diagrams/class-entities-2.png) | SRS, Figure B.2 |
| App design classes | [class-app.png](SCSJ_Group3_Lab5_Diagrams/class-app.png) | SRS, Figure B.3 |
| Server design classes: interface layer | [class-server-1.png](SCSJ_Group3_Lab5_Diagrams/class-server-1.png) | SRS, Figure B.4 |
| Server design classes: logic and integration | [class-server-2.png](SCSJ_Group3_Lab5_Diagrams/class-server-2.png) | SRS, Figure B.5 |
| Dialog map: screens and navigation | [dialog-map.png](SCSJ_Group3_Lab5_Diagrams/dialog-map.png) | SRS, Figure B.6 |
| Dialog map: Home, Directions, Meet up, Settings | [states-home.png](SCSJ_Group3_Lab5_Diagrams/states-home.png), [states-directions.png](SCSJ_Group3_Lab5_Diagrams/states-directions.png), [states-meetup.png](SCSJ_Group3_Lab5_Diagrams/states-meetup.png), [states-settings.png](SCSJ_Group3_Lab5_Diagrams/states-settings.png) | Figures B.7 to B.10 |
| Control flow graph: isOpenAt | [cfg-isOpenAt.png](SCSJ_Group3_Lab5_Diagrams/cfg-isOpenAt.png) | Test Cases, Figure 1 |
| Control flow graph: tokenHits | [cfg-tokenHits.png](SCSJ_Group3_Lab5_Diagrams/cfg-tokenHits.png) | Test Cases, Figure 2 |

## Source code and tests

| Item | Location |
|---|---|
| Mobile app (Expo / React Native) | [app/](../../app/) |
| Backend server (Node.js / Express) | [server/](../../server/) |
| Setup, architecture, API and security notes | [README.md](../../README.md) at the repository root |
| Server tests (50, including the Lab 4 black-box and basis path tests) | [server/tests/](../../server/tests/) |
| App tests (24, including the Lab 4 basis path tests) | [app/tests/](../../app/tests/) |
| Test case design and results | [SCSJ_Group3_Lab5_TestCases.pdf](SCSJ_Group3_Lab5_TestCases.pdf) (first submitted in [Lab 4](../Lab%204%20Deliverables/)) |

Run the tests with `npm test` in `server/` and in `app/`.

## Earlier labs

[Lab 1](../Lab%201%20Deliverables/), [Lab 2](../Lab%202%20Deliverables/), [Lab 3](../Lab%203%20Deliverables/) and [Lab 4](../Lab%204%20Deliverables/) deliverables, as submitted. The Lab 5 documents above replace their requirements, design models and test cases with the final versions.

# Data sources

All sources are public. Indian statutes and judgments are public records (Copyright Act 1957, s. 52(1)(q)).

| Use | Source | Licence | Size used |
|---|---|---|---|
| Statute corpus | `mratanusarkar/Indian-Laws` (HF) — section-wise bare acts scraped from India Code | CC-BY-4.0 | 34,183 sections / 1,019 central acts (IPC & Constitution replaced, see below) |
| Statute corpus | `GSMS-B/indian-legal-sections-bns-bnss-bsa-2023` (HF) | CC-BY-4.0 | 1,059 sections (BNS 358, BNSS 531, BSA 170) |
| Statute corpus | `kmeanskaran/ipc-sections` + `Hanno-Labs/indian-ipc-statute-identification` statute text | CC-BY-4.0 | 444 IPC sections (operative text + offence/punishment metadata) |
| Statute corpus | `123Divyansh/Constitution.-of-India-TXT_File` (India Code PDF text) parsed by `lawline/data/constitution.py` | public domain | 496 articles |
| Case corpus | `Shreyasrao/Indian-law-supreme-court-judgements-2016` (HF) — SCR 2016 headnotes + entity annotations | CC-BY-4.0 | 589 judgments |
| Case corpus | `Hanno-Labs/indian-ipc-statute-identification` (HF) — High-Court fact excerpts (train split only) | CC-BY-4.0 | 6,000 cases |
| Case corpus | 7 landmark judgments processed during Capstone Phase-II (Maneka Gandhi, Puttaswamy, Olga Tellis, …) | public record | 7 |
| Gold: BNS-QA | `GSMS-B/Indian-Legal-QA-BNS-BNSS-BSA` — question → section | CC-BY-4.0 | 600 test / 5,724 train |
| Gold: IPC facts | `Hanno-Labs/indian-ipc-statute-identification` — masked facts → IPC section(s), **case-level split, test cases not in corpus** | CC-BY-4.0 | 500 test cases / 12,000 train pairs |
| Gold: Constitution-QA | `nisaar/Constitution_of_India` QA; article labels mined from reference answers | Apache-2.0 | 124 test / 292 train |
| Gold: SC case | SCR 2016 one-paragraph summaries → judgment | CC-BY-4.0 | 586 |
| Answer eval | `jmukesh99/AIBE_mcq` (All India Bar Exam MCQs) | — | 500 available, 150 used |

Leakage control: BNS-QA is split by *section* (no test section appears in training pairs); IPC facts is split by *case*
(test cases are neither in the corpus nor in training); Constitution-QA rows are split at random; SC summaries are never
used for training.

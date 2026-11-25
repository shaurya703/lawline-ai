# Data sources

All sources are public. Indian statutes and judgments are public records (Copyright Act 1957, s. 52(1)(q)).

| Use | Source | Licence | Size used |
|---|---|---|---|
| Statute corpus | `mratanusarkar/Indian-Laws` (HF) — section-wise bare acts scraped from India Code | CC-BY-4.0 | 34,183 sections / 1,019 central acts (IPC & Constitution replaced, see below) |
| Statute corpus | `GSMS-B/indian-legal-sections-bns-bnss-bsa-2023` (HF) | CC-BY-4.0 | 1,059 sections (BNS 358, BNSS 531, BSA 170) |
| Statute corpus | `kmeanskaran/ipc-sections` + `Hanno-Labs/indian-ipc-statute-identification` statute text | CC-BY-4.0 | 534 IPC sections: 442 with operative text and offence/punishment metadata, 12 general-part sections from the bare-acts dump, 80 from an IPC commentary PDF |
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

## Corpus expansion (v2)

The first corpus was broad on statutes and thin on cases: 5,975 of its 6,596 cases were Patna High Court criminal
excerpts, the Supreme Court was covered for 2016 only, and several central Acts were missing sections (the Indian
Evidence Act had 50 sections and now has 181, the Code of Civil Procedure 77 and now 169, the Indian Contract Act 75
and now 186). `python -m lawline.data.expand` appends three groups and leaves every v1 document in place.

| Use | Source | Licence | Size used |
|---|---|---|---|
| Statute corpus | `GSMS-B/indian-legal-knowledge-base-json` (HF): section-wise central Acts from India Code and the Gazette | CC-BY-4.0 | 3,111 sections: 68 Acts completed and 7 added (Partnership Act 1932, LLP Act 2008, Digital Personal Data Protection Act 2023, Telecommunications Act 2023, Income-tax Act 2025, Industrial Relations Code 2020, OSH Code 2020) |
| Case corpus | Supreme Court Reports 1950–2025: AWS Open Data *Indian Supreme Court Judgments* (`vanga/indian-supreme-court-judgments`), metadata and 1998–2025 PDFs through the HF mirror `labofsahil/Indian-Supreme-Court-Judgments` | CC-BY-4.0 | 5,367 judgments, 137 of them named landmark decisions |
| Case corpus | the same reports, 1950–1997 text already extracted: `therajasekhar/india-public-supreme-court-judgments` (HF), a redistribution of `overthelex/indian-court-decisions` | card states NDSAP (Government of India open data); upstream CC-BY-4.0 | text of the 1950–1997 judgments above |
| Case corpus | High Court judgments: `overthelex/indian-court-decisions` (HF, derived from AWS Open Data *Indian High Court Judgments*), `high_courts/test.parquet` | CC-BY-4.0 | 2,400 judgments, 100 from each of 24 High Courts |

Totals after expansion: 53,746 documents (39,383 provisions of 1,031 Acts, 14,363 judgments) in 204,426 chunks.
v1 had 42,868 documents in 69,260 chunks. With Patna from v1, all 25 High Courts are represented.

How the additions were chosen (`lawline/data/expand.py`, seed 13):

- **Statute sections.** A knowledge-base section is added only if the corpus has neither that section number nor that
  wording under the same Act. The wording check matters because v1 stores some Acts under other numbers (the Indian
  Succession Act is held as 48 chapters labelled Section 1 to 48); without it 409 sections would have been added a
  second time. Repealed sections and heading-only records are skipped (452), and a record that runs on into the
  following sections is cut at the next section.
- **Supreme Court.** A hand-written list of 138 landmark decisions is matched against the official SCR metadata, by
  citation where a party has several judgments in the year; 137 were found (T.M.A. Pai Foundation, 2002, has no
  English report in the source). Each reporting year then gets 60 judgments (1950–1999) or 100 (2000–2025): half are
  the longest reported judgments of the year, half a seeded random sample. Judgments under three pages are skipped.
  The source holds only five English reports for 2009, so that year has 4 judgments.
- **High Courts.** 100 judgments per court, taken in a seeded random order from judgments of 8,000 to 150,000
  characters until 100 pass the checks. The length floor drops the one-page orders that make up most of the dump.
  Unreadable text (broken PDF font maps, Hindi typed in legacy fonts, letter-spaced OCR) is rejected, and a judgment
  that appears under two case numbers is kept once. The Madras High Court's two registries share one quota. Patna is
  left out because v1 already holds 5,975 Patna matters. The Hyderabad registry is labelled with the court's name
  on the date of the judgment.
- **Length.** A judgment longer than 20,000 characters keeps its first 16,000 (headnote, issues, facts) and its last
  4,000 (holding and order), marked `[…]`: 4,275 of the Supreme Court judgments and 789 of the High Court judgments.
  The budget is what a 16 GB laptop can index and serve.

What the expansion does not change, so the frozen gold sets keep their targets:

- No v1 document is replaced. The IPC, the Constitution and the three 2023 codes are not touched.
- Supreme Court judgments decided or reported in 2016 are excluded, and so is every judgment already in v1's SCR-2016
  set whatever volume it is reported in: that set is the `sc_case` evaluation set, and a second copy of a gold
  judgment would count as a miss.
- The seven Phase-II landmark judgments are skipped by name. The IPC fact-pattern test cases are Patna High Court
  matters, and Patna is excluded from the new High Court sample.
- Some added sections of the Indian Evidence Act and the Code of Criminal Procedure are the repealed counterparts of
  BSA and BNSS sections that BNS-QA asks about. They are legitimate content, and they compete with the gold section.

Known weaknesses: the 1950s–1970s reports are OCR of scans and carry spelling noise; 425 Supreme Court files also
contain the opening of the next reported judgment (flagged `runs_on`); the per-year sample favours long judgments;
2009 is almost absent; 85 High Court judgments are dated 2026; the bi-encoder was fine-tuned on v1 training pairs and
was not retrained.

Download the raw files into `data/raw/` before running the expansion (about 13 GB; `pdftotext` from poppler is needed):

```python
from huggingface_hub import hf_hub_download, snapshot_download
raw = "data/raw/"
snapshot_download("GSMS-B/indian-legal-knowledge-base-json", repo_type="dataset", allow_patterns=["raw_acts/*"], local_dir=raw + "GSMS-B__indian-legal-knowledge-base-json")
hf_hub_download("therajasekhar/india-public-supreme-court-judgments", "data/supreme_court_judgments.parquet", repo_type="dataset", local_dir=raw + "therajasekhar__india-public-supreme-court-judgments")
hf_hub_download("overthelex/indian-court-decisions", "high_courts/test.parquet", repo_type="dataset", local_dir=raw + "overthelex__indian-court-decisions")
sc = raw + "labofsahil__Indian-Supreme-Court-Judgments"
snapshot_download("labofsahil/Indian-Supreme-Court-Judgments", repo_type="dataset", allow_patterns=["metadata/parquet/*/metadata.parquet"], local_dir=sc)
for year in range(1998, 2026):
    if year != 2016:
        hf_hub_download("labofsahil/Indian-Supreme-Court-Judgments", f"data/zip/year={year}/english.zip", repo_type="dataset", local_dir=sc)
```

The built corpus, chunks and indices are published in the assets repo (`python -m lawline.bootstrap --corpus`), so
none of this is needed to run the application.

Sources considered and not used: instruction-tuning question-and-answer sets written by language models (their
legal statements are unverified, so they are unsafe as retrieval sources); corpora derived from Indian Kanoon, whose
terms do not allow bulk reuse; the full High Court dump (millions of mostly one-page orders, tens of gigabytes); and
two gated benchmarks, `Exploration-Lab/IL-TUR` (CC-BY-NC-SA) and `adalat-ai/indian-legal-exam-benchmark`, which need
the account holder to accept their terms.

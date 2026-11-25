"""Corpus expansion: the selection and de-duplication rules that keep the v1 gold targets intact."""
import json
import pandas as pd
from lawline.data import expand as e


def test_titles():
    assert e.smart_title("ARNESH KUMAR versus STATE OF BIHAR & ANR.") == "Arnesh Kumar v. State of Bihar & Anr"
    assert e.smart_title("D.K. BASU versus STATE OF WEST BENGAL") == "D.K. Basu v. State of West Bengal"
    assert e.smart_title("PEOPLE'S UNION FOR CIVIL LIBERTIES versus UNION OF INDIA") == "People's Union for Civil Liberties v. Union of India"
    assert e.smart_title("K. V. RAO versus STATE OF KERALA") == "K. V. Rao v. State of Kerala"          # an initial "V." is not the separator
    assert e.smart_title("In Re the Kerala Education Bill, 1957 versus") == "In Re the Kerala Education Bill, 1957"   # no dangling "v."
    assert e.smart_title("SPECIAL REFERENCE NO. 1 OF 1964 v. -") == "Special Reference No. 1 of 1964"
    assert e.hc_title("CR. APP (DB)/296/2021 of RAMJEET YADAV Vs THE STATE OF BIHAR") == "Ramjeet Yadav v. The State of Bihar"
    assert e.hc_title("Board of Revenue Vs Union of India") == "Board of Revenue v. Union of India"      # " of " without a case number
    assert e.hc_title("WP/12/2020 of Vs", "ASHA DEVI", "STATE OF KERALA") == "Asha Devi v. State of Kerala"   # falls back to the party columns


def test_cap_text_keeps_opening_and_final_order():
    out, truncated = e.cap_text("Headnote sentence. " * 2000 + "Appeal allowed.")
    assert truncated and len(out) <= e.HEAD_CHARS + e.TAIL_CHARS + 10
    assert out.startswith("Headnote sentence.") and out.endswith("Appeal allowed.") and "[…]" in out
    assert e.cap_text("short judgment") == ("short judgment", False)
    head, _, _ = e.cap_text("First line.\n" + "x" * 40_000)[0].partition("\n[…]\n")
    assert len(head) > e.HEAD_CHARS - 10                                   # no sentence end near the limit: the opening is not thrown away


def test_looks_english_rejects_what_the_court_dumps_contain():
    prose = "The appellant was convicted under Section 302 of the Indian Penal Code and it is contended that the trial was not fair. "
    assert e.looks_english(prose * 40)
    assert not e.looks_english("ಮೇಗಂ ಸುರಿಯಾ ರಶೀದ್ ಮತ್ತು ಇತರರು ವಿರುದ್ಧ ಮಧ್ಯಪ್ರದೇಶ ರಾಜ್ಯ " * 60)                      # another script
    assert not e.looks_english("vkosnd dh vksj ls Jh jktho dqekj vf/koDrk mifLFkr gSaA izfri{kh dh vksj ls dksbZ ugha " * 60)   # Hindi in a legacy ASCII font
    assert not e.looks_english("T h e a p p e l l a n t w a s c o n v i c t e d u n d e r S e c t i o n " * 60)   # letter-spaced OCR
    assert not e.looks_english(("\x01\x02\x03 the of and " + prose[:30]) * 80)                            # broken font map
    parties = "1. Narendra Kumar Kanwar S/o Kawal Singh Kanwar Aged About 48 Years R/o Headmaster, Govt. Primary School Utarda, Block Pali, District Korba. "
    assert e.looks_english(parties * 40 + prose * 80)                                                  # pages of party names, then the judgment


def test_dates_keys_and_courts():
    assert e.iso_date("17-07-2019") == "2019-07-17" and e.iso_date("1999-04-29") == "1999-04-29" and e.iso_date("") is None
    assert e.case_key("Justice K S Puttaswamy Retd And Anr v. Union Of India And Ors") == e.case_key("JUSTICE K.S. PUTTASWAMY (RETD.) versus UNION OF INDIA")
    assert e.hc_date("APHC010000552023_1_2024-07-11", "2023-01-01") == "2024-07-11" and e.hc_date("X", "29-04-1999") == "1999-04-29"
    assert e.hc_court("HBHC", "2010-03-01") == "High Court of Andhra Pradesh"
    assert e.hc_court("HBHC", "2016-03-01") == "High Court of Judicature at Hyderabad"
    assert e.hc_court("HBHC", "2021-03-01") == "High Court for the State of Telangana"
    assert e.hc_court("HCMD", "2021-03-01") == e.hc_court("HCMA", "2021-03-01") == "Madras High Court"     # one court, two registries
    assert len(set(e.HC_COURTS.values())) == 24
    a = "The petition is dismissed. " * 80
    assert e.text_key(a) == e.text_key(a.upper().replace(". ", ".  ")) != e.text_key(a + "No costs.")


def _md(rows):
    df = pd.DataFrame(rows, columns=["title", "path", "vol_year", "dec_year", "pages"])
    df["citation"] = [f"[{r[2]}] 1 S.C.R. {i}" for i, r in enumerate(rows)]; df["decision_date"] = [f"01-01-{r[3]}" for r in rows]
    return df


def test_landmark_matching():
    md = _md([("SMT. SELVI & ORS. versus STATE OF KARNATAKA", "2010_5_381_500", 2010, 2010, 120),
              ("ORIENTAL INSURANCE CO. LTD. versus PORSELVI & ANR", "2009_1_1_3", 2009, 2009, 3),
              ("SAJJAN SINGH versus THE STATE OF PUNJAB", "1963_1_1_18", 1963, 1963, 18),
              ("SAJJAN SINGH versus STATE OF RAJASTHAN", "1965_1_933_969", 1965, 1964, 37),
              ("U.O.I. versus JAI PRAKASH SINGH AND ANR.", "2007_1_1_5", 2007, 2007, 5),
              ("K. M. NANAVATI versus STATE OF MAHARASHTRA", "1962_1_567_681", 1962, 1961, 115),
              ("M/S INNOVENTIVE INDUSTRLES LTD. versus ICICI BANK", "2017_8_33_120", 2017, 2017, 88),
              ("M.C. MEHTA versus UNION OF INDIA", "1986_1_312_347", 1986, 1986, 36),
              ("M.C. MEHTA AND ANR. versus UNION OF INDIA", "1987_1_819_845", 1987, 1986, 27),
              ("A versus B", "2011_2_1_40", 2011, 2010, 40)])
    hit = lambda *entry: e.find_landmark(md, entry).path.tolist()
    assert hit("SELVI", 2010) == ["2010_5_381_500"]                           # whole word: not PORSELVI
    assert hit("SAJJAN SINGH", 1964) == ["1965_1_933_969"]                    # the decision year wins over a neighbour
    assert hit("^PRAKASH SINGH", 2006) == []                                  # anchored: not JAI PRAKASH SINGH
    assert hit("K.M. NANAVATI", 1961) == ["1962_1_567_681"]                   # spacing of initials
    assert hit("INNOVENTIVE INDUSTRIES|INNOVENTIVE INDUSTRLES", 2017) == ["2017_8_33_120"]   # a misspelling in the source
    assert hit("M.C. MEHTA", 1986)[0] == "1986_1_312_347"                     # without a citation: the longest of the year
    md.loc[md.path == "1987_1_819_845", "citation"] = "[1987] 1 S.C.R. 819"
    assert hit("M.C. MEHTA", 1986, "[1987] 1 S.C.R. 819") == ["1987_1_819_845"]              # the citation picks the one meant
    assert hit("A", 2011) == ["2011_2_1_40"]                                  # falls back to the volume year
    assert e.landmark_label(("^MUKESH & ANR", 2017)) == "MUKESH & ANR (2017)"


def test_select_sc_rules(monkeypatch):
    monkeypatch.setattr(e, "LANDMARKS", [("VISHAKA", 1997)])
    monkeypatch.setattr(e, "SC_PER_YEAR_OLD", 3); monkeypatch.setattr(e, "SC_PER_YEAR_NEW", 3)
    md = _md([("VISHAKA AND ORS. versus STATE OF RAJASTHAN", "1997_3_404_418", 1997, 1997, 15),
              ("MANEKA GANDHI versus UNION OF INDIA", "1978_2_621_776", 1978, 1978, 156),
              ("A versus B", "2016_1_1_17", 2016, 2016, 17), ("C versus D", "2017_1_1_9", 2017, 2016, 9),
              ("GOLD versus CASE", "2017_5_160_276", 2017, 2017, 117),
              ("E versus F", "1997_1_1_40", 1997, 1997, 40), ("G versus H", "1997_1_41_50", 1997, 1997, 10),
              ("I versus J", "1997_1_51_52", 1997, 1997, 2), ("K versus L", "1997_1_60_90", 1997, 1997, 31),
              ("M versus N", "1997_1_91_99", 1997, 1997, 9), ("O versus P", "1997_1_100_108", 1997, 1997, 9)])
    available = set(md.path) - {"1997_1_60_90"}
    args = (md, available, {(e.case_key("Maneka Gandhi v. Union Of India"), 1978)}, frozenset({"2017_5_160_276"}))
    sel, missing = e.select_sc(*args)
    got = dict(zip(sel.path, sel.why))
    assert got["1997_3_404_418"] == "landmark" and not missing and sel.set_index("path").landmark["1997_3_404_418"] == "VISHAKA (1997)"
    assert "1978_2_621_776" not in got                                   # already in v1 by name
    assert "2017_5_160_276" not in got                                   # already in v1's SCR-2016 set, although its volume is 2017
    assert not any(p.startswith("2016") for p in got) and "2017_1_1_9" not in got   # decided or reported in 2016
    assert "1997_1_60_90" not in got and "1997_1_51_52" not in got       # no text held; under three pages
    assert len(got) == 3 and got["1997_1_1_40"] == "long"                # the quota of 3 counts the landmark; half of the rest is the longest
    assert list(sel.path) == list(e.select_sc(*args)[0].path)            # seeded: the same sample every run


def test_key_acts_rules(tmp_path, monkeypatch):
    sec = lambda n, title, body: {"chapter": "2", "section": n, "section_title": title, "section_desc": body}
    long = "Oral admissions as to the contents of electronic records are not relevant, unless the genuineness of the electronic record produced is in question."
    (tmp_path / "indian_evidence_act_1872.json").write_text(json.dumps([
        sec("22", "When oral admissions as to contents of documents are relevant", "Oral admissions as to the contents of a document are not relevant, unless and until the party proposing to prove them shows that he is entitled to give secondary evidence."),
        sec("22A", "When oral admission as to contents of electronic records are relevant", long),
        sec("23", "Admissions in civil cases when relevant", "Repealed by the Repealing Act, 1938."),
        sec("24", "Confession caused by inducement", "24. Confession caused by inducement."),
        sec("90", "Presumption as to documents thirty years old", "Where any document, purporting or proved to be thirty years old, is produced from any custody which the Court in the particular case considers proper, the Court may presume that the signature is genuine.")]))
    (tmp_path / "right_to_information_act_2005.json").write_text(json.dumps({"act_name": "Right to Information Act", "sections": [
        {"act_code": "RTI", "chapter_number": "II", "chapter_title": "RIGHT TO INFORMATION", "section_number": "3", "section_title": "Right to information",
         "text": "3. Right to information.—Subject to the provisions of this Act, all citizens shall have the right to information held by or under the control of a public authority."}]}))
    (tmp_path / "ipc_to_bns.json").write_text(json.dumps([{"id": 1, "lookup_key": "302", "mapping_statement": "IPC 302 is BNS 103", "source": "IPC", "status": "mapped", "target": "BNS 103"}]))
    monkeypatch.setattr(e, "ACTS_DIR", tmp_path)
    v1_text = " " + " ".join(e._words("Chapter V. 90. Presumption as to documents thirty years old.- Where any document, purporting or proved to be thirty years old, is produced from any custody which the Court in the particular case considers proper, the Court may presume that the signature is genuine.")) + " "
    docs, info = e.load_key_acts({"Indian Evidence Act, 1872": {"22"}}, {"Indian Evidence Act, 1872": v1_text})
    assert sorted(d.doc_id for d in docs) == ["statute::indian-evidence-act-1872::22A", "statute::right-to-information-act-2005::3"]   # "_to_" in an Act's name is not a mapping table
    ev = next(d for d in docs if d.section == "22A")
    assert ev.text.startswith("22A. When oral admission") and ev.act == "Indian Evidence Act, 1872"
    assert info["skipped"] == {"number_present": 1, "stub_or_repealed": 1, "text_present": 1}     # s.22; heading-only s.24; s.90 held under another number
    assert "23" not in {d.section for d in docs}                                                    # a repealed section is dropped when the file is read
    assert info["acts_completed"] == 1 and info["new_acts"] == {"Right To Information Act, 2005": 1}


def test_run_on_records_are_cut_at_the_next_section():
    body = "5. Short title.—This Act may be called the Example Act.\n6. Definitions.—In this Act, unless the context otherwise requires.\n7. Application.—This Act applies to the whole of India."
    assert e.trim_run_on("5", body) == "5. Short title.—This Act may be called the Example Act."
    assert e.trim_run_on("5", body.split("\n7.")[0]) == body.split("\n7.")[0]     # one later number alone can be a cross-reference
    assert e.trim_run_on("5A", body) == body


def test_match_act_handles_v1_naming_and_refuses_a_different_statute():
    acts = ["Code of Criminal Procedure Act, 1973", "Insolvency and Bankruptcy Code Act, 2016", "Custom Act, 1962", "Companies Act, 1956", "Companies Act, 2013",
            "Integrated Goods and Services Tax Act, 2017", "Code of Criminal Procedure (Amendment) Act, 1973"]
    assert e.match_act("code_of_criminal_procedure_1973", acts) == "Code of Criminal Procedure Act, 1973"
    assert e.match_act("insolvency_bankruptcy_code_2016", acts) == "Insolvency and Bankruptcy Code Act, 2016"
    assert e.match_act("customs_act_1962", acts) == "Custom Act, 1962"
    assert e.match_act("the_companies_act_2013", acts) == "Companies Act, 2013"
    assert e.match_act("indian_partnership_act_1932", acts) is None
    assert e.match_act("central_goods_and_services_tax_act_2017", acts) is None                       # not the Integrated GST Act
    assert e.match_act("code_of_criminal_procedure_1973", acts[-1:]) is None                          # not its Amendment Act


def test_expand_corpus_appends_once_and_counts_what_it_wrote(tmp_path, monkeypatch):
    D = lambda **k: e.Document(**{"doc_type": "statute", "source": "indiacode/bare-acts", "title": "t", "text": "some text of the section", **k})
    v1 = [D(doc_id="statute::x-act-2000::1", act="X Act, 2000", section="1"), D(doc_id="statute::indian-penal-code-1860::302", act="Indian Penal Code, 1860", section="302"),
          D(doc_id="case::sc2016::2017-5-160-276-en", doc_type="case", source="SCR-2016", court="Supreme Court of India", year=2016),
          D(doc_id="case::landmark::maneka", doc_type="case", source="capstone-phase2", title="Maneka Gandhi v. Union Of India", year=1978)]
    corpus = tmp_path / "corpus.jsonl"; corpus.write_text("\n".join(d.to_json() for d in v1) + "\n")
    monkeypatch.setattr(e, "DATA_PROCESSED", tmp_path)
    seen = {}
    monkeypatch.setattr(e, "load_key_acts", lambda have, act_text=None: ([D(doc_id="statute::x-act-2000::2", act="X Act, 2000", section="2", source=e.SRC_ACTS)], {"sections": 1}))
    def sc(skip_keys, skip_paths=frozenset()):
        seen.update(keys=skip_keys, paths=skip_paths)
        return [D(doc_id="case::sc::1997_3_404_418", doc_type="case", source=e.SRC_SC, year=1997)], {"kept": 1}
    monkeypatch.setattr(e, "load_sc_reports", sc)
    monkeypatch.setattr(e, "load_hc_judgments", lambda: ([D(doc_id="case::hcj::x", doc_type="case", source=e.SRC_HC, year=2020)], {"kept": 1}))
    first = e.expand_corpus(corpus); again = e.expand_corpus(corpus)
    assert first["total"] == again["total"] == 7 == sum(1 for _ in open(corpus))                      # running twice does not stack
    assert seen["paths"] == frozenset({"2017_5_160_276"}) and (e.case_key("Maneka Gandhi"), 1978) in seen["keys"]
    stats = json.load(open(tmp_path / "corpus_stats.json"))
    rows = ["bare_acts", "bns_family", "ipc", "constitution", "sc2016", "hc_excerpts", "landmark", "key_acts", "sc_reports", "hc_judgments"]
    assert sum(stats[k] for k in rows) == stats["total"] == stats["statutes"] + stats["cases"] and stats["ipc"] == 1 and stats["bare_acts"] == 1

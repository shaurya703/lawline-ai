"""Domain-adapt the bi-encoder on (legal query -> governing provision) pairs.

Loss   : MultipleNegativesRankingLoss with in-batch negatives + 1 BM25-mined hard negative per query
Data   : data/processed/train_pairs.jsonl (BNS-QA, Hanno facts->IPC, Constitution QA) — gold queries/sections excluded
Output : outputs/models/lawline-bge-small-legal
"""
from __future__ import annotations
import argparse, json, random, time
from collections import Counter, defaultdict
from pathlib import Path
import torch
from datasets import Dataset
from sentence_transformers import SentenceTransformer, SentenceTransformerTrainer, SentenceTransformerTrainingArguments, losses
from ..config import DATA_PROCESSED, INDEX_DIR, MODEL_DIR, BASE_EMBEDDING_MODEL
from ..data.schema import read_jsonl
from ..data.chunking import load_chunks
from ..index.bm25_index import BM25Index

SEED = 13


def build_training_set(max_per_task: dict, hard_neg: bool = True, max_chars: int = 1500) -> Dataset:
    chunks = load_chunks()
    first_chunk = {}
    for c in chunks:
        if c.position == 0:
            first_chunk[c.doc_id] = c.text[:max_chars]
    pairs = [p for p in read_jsonl(DATA_PROCESSED / "train_pairs.jsonl") if p["pos_doc"] in first_chunk]
    rnd = random.Random(SEED); rnd.shuffle(pairs)
    by_task = defaultdict(list)
    for p in pairs:
        if len(by_task[p["task"]]) < max_per_task.get(p["task"], 10**9):
            by_task[p["task"]].append(p)
    pairs = [p for ps in by_task.values() for p in ps]; rnd.shuffle(pairs)
    rows = {"anchor": [], "positive": [], "negative": []}
    bm25 = BM25Index.load(INDEX_DIR / "bm25") if hard_neg else None
    t = time.perf_counter()
    for i, p in enumerate(pairs):
        neg = None
        if bm25:
            for cid, _ in bm25.search(p["query"][:600], 5):
                d = cid.split("#c")[0]
                if d != p["pos_doc"] and d in first_chunk:
                    neg = first_chunk[d]; break
        if neg is None:
            neg = first_chunk[rnd.choice(list(first_chunk))]
        rows["anchor"].append(p["query"][:max_chars]); rows["positive"].append(first_chunk[p["pos_doc"]]); rows["negative"].append(neg)
        if i % 2000 == 0:
            print(f"  mined {i}/{len(pairs)} ({time.perf_counter() - t:.0f}s)")
    print("task mix:", Counter(p["task"] for p in pairs))
    return Dataset.from_dict(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=BASE_EMBEDDING_MODEL)
    ap.add_argument("--out", default=str(MODEL_DIR / "lawline-bge-small-legal"))
    ap.add_argument("--epochs", type=float, default=2)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.add_argument("--max-bns", type=int, default=5724); ap.add_argument("--max-ipc", type=int, default=7000); ap.add_argument("--max-const", type=int, default=292)
    ap.add_argument("--no-hard-neg", action="store_true"); ap.add_argument("--seq-len", type=int, default=256)
    a = ap.parse_args()
    torch.manual_seed(SEED)
    ds = build_training_set({"bns_qa": a.max_bns, "ipc_facts": a.max_ipc, "const_qa": a.max_const}, hard_neg=not a.no_hard_neg)
    print("train examples:", len(ds))
    model = SentenceTransformer(a.base); model.max_seq_length = a.seq_len
    loss = losses.MultipleNegativesRankingLoss(model)
    args = SentenceTransformerTrainingArguments(
        output_dir=str(Path(a.out) / "checkpoints"), num_train_epochs=a.epochs, per_device_train_batch_size=a.batch,
        learning_rate=a.lr, warmup_ratio=0.1, lr_scheduler_type="linear", weight_decay=0.01, seed=SEED,
        logging_steps=50, save_strategy="no", report_to=[], dataloader_drop_last=True,
        fp16=False, bf16=False, use_mps_device=False,
    )
    t = time.perf_counter()
    trainer = SentenceTransformerTrainer(model=model, args=args, train_dataset=ds, loss=loss)
    trainer.train()
    model.save(a.out)
    hist = [h for h in trainer.state.log_history if "loss" in h]
    json.dump({"base": a.base, "examples": len(ds), "epochs": a.epochs, "batch": a.batch, "lr": a.lr, "seq_len": a.seq_len,
               "hard_negatives": not a.no_hard_neg, "train_seconds": time.perf_counter() - t, "device": str(model.device),
               "loss_history": hist}, open(Path(a.out) / "train_meta.json", "w"), indent=2)
    print("saved", a.out, f"{time.perf_counter() - t:.0f}s")


if __name__ == "__main__":
    main()

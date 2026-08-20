"""Domain-adapt the bi-encoder on (legal query -> governing provision) pairs.

Loss   : MultipleNegativesRankingLoss with in-batch negatives + 1 dense-mined hard negative per query
         (top non-positive hit of the *base* model's FAISS index, i.e. the base model's own confusions)
Data   : data/processed/train_pairs.jsonl (BNS-QA, Hanno facts->IPC, Constitution QA) — gold queries/sections excluded
Output : outputs/models/lawline-bge-small-legal
"""
from __future__ import annotations
import argparse, json, random, time
from collections import Counter, defaultdict
from pathlib import Path
import torch
from datasets import Dataset
from sentence_transformers import SentenceTransformer, losses
from sentence_transformers.util import batch_to_device
from ..config import DATA_PROCESSED, INDEX_DIR, MODEL_DIR, BASE_EMBEDDING_MODEL
from ..data.schema import read_jsonl
from ..data.chunking import load_chunks
from ..index.faiss_index import FaissIndex
from ..index.embedder import Embedder

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
    t = time.perf_counter()
    hits = None
    if hard_neg:
        emb = Embedder(BASE_EMBEDDING_MODEL); fi = FaissIndex.load(INDEX_DIR / "faiss_base")
        qv = emb.encode_passages([p["query"][:max_chars] for p in pairs]) if not emb.use_prefix else emb.encode_queries([p["query"][:max_chars] for p in pairs])
        hits = fi.search(qv, 8)
        print(f"  mined hard negatives for {len(pairs)} queries in {time.perf_counter() - t:.0f}s", flush=True)
    keys = list(first_chunk)
    for i, p in enumerate(pairs):
        neg = None
        if hits is not None:
            for cid, _ in hits[i]:
                d = cid.split("#c")[0]
                if d != p["pos_doc"] and d in first_chunk:
                    neg = first_chunk[d]; break
        if neg is None:
            neg = first_chunk[rnd.choice(keys)]
        rows["anchor"].append(p["query"][:max_chars]); rows["positive"].append(first_chunk[p["pos_doc"]]); rows["negative"].append(neg)
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
    ap.add_argument("--device", default=None, help="cpu | mps | cuda (default: auto). On 8 GB Macs use cpu: MPS SDPA with padding masks needs >2 GB even at batch 8")
    ap.add_argument("--freeze-layers", type=int, default=0, help="freeze embeddings + the first N transformer layers (parameter-efficient; less memory)")
    ap.add_argument("--prepare-only", action="store_true", help="mine triplets to data/processed/train_triplets.parquet and exit")
    ap.add_argument("--from-prepared", action="store_true", help="train from the prepared parquet (keeps the trainer process small)")
    a = ap.parse_args()
    torch.manual_seed(SEED)
    prepared = DATA_PROCESSED / "train_triplets.parquet"
    if a.from_prepared and prepared.exists():
        ds = Dataset.from_parquet(str(prepared))
    else:
        ds = build_training_set({"bns_qa": a.max_bns, "ipc_facts": a.max_ipc, "const_qa": a.max_const}, hard_neg=not a.no_hard_neg)
        ds.to_parquet(str(prepared))
        if a.prepare_only:
            print("prepared", len(ds), "triplets ->", prepared); return
    print("train examples:", len(ds))
    model = SentenceTransformer(a.base, device=a.device); model.max_seq_length = a.seq_len
    device = model.device
    if a.freeze_layers:
        hf = model[0].auto_model
        for p_ in hf.embeddings.parameters():
            p_.requires_grad = False
        for layer in hf.encoder.layer[: a.freeze_layers]:
            for p_ in layer.parameters():
                p_.requires_grad = False
    trainable = [p_ for p_ in model.parameters() if p_.requires_grad]
    print(f"trainable params: {sum(p_.numel() for p_ in trainable) / 1e6:.1f}M / {sum(p_.numel() for p_ in model.parameters()) / 1e6:.1f}M", flush=True)
    loss_fn = losses.MultipleNegativesRankingLoss(model)
    opt = torch.optim.AdamW(trainable, lr=a.lr, weight_decay=0.01)
    n = len(ds); steps_per_epoch = n // a.batch; total = int(steps_per_epoch * a.epochs); warm = max(1, int(0.1 * total))
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda st: min((st + 1) / warm, max(0.0, (total - st) / max(1, total - warm))))
    anchors, positives, negatives = ds["anchor"], ds["positive"], ds["negative"]
    tok = model.tokenizer
    hist, t = [], time.perf_counter()
    model.train(); step = 0; rnd = random.Random(SEED)
    # lean manual loop: the HF Trainer path thrashed memory on an 8 GB laptop; this uses < 1 GB on MPS
    while step < total:
        order = list(range(n)); rnd.shuffle(order)
        for b in range(steps_per_epoch):
            if step >= total:
                break
            idx = order[b * a.batch:(b + 1) * a.batch]
            # fixed-shape batches: the MPS caching allocator keeps one buffer per distinct shape, so variable padding
            # makes wired memory grow without bound on unified-memory Macs
            feats = [batch_to_device(dict(tok([col[i] for i in idx], padding="max_length", truncation=True,
                                              max_length=a.seq_len, return_tensors="pt")), device)
                     for col in (anchors, positives, negatives)]
            loss = loss_fn(feats, None)
            loss.backward(); torch.nn.utils.clip_grad_norm_(trainable, 1.0)
            opt.step(); sched.step(); opt.zero_grad(set_to_none=True)
            if device.type == "mps":
                torch.mps.synchronize()          # bound the queued-kernel memory on unified-memory GPUs
                if step % 25 == 0:
                    torch.mps.empty_cache()
            step += 1
            if step % 50 == 0 or step == 1:
                hist.append({"step": step, "loss": float(loss.item()), "lr": sched.get_last_lr()[0]})
                print(f"  step {step}/{total} loss {loss.item():.4f} ({time.perf_counter() - t:.0f}s)", flush=True)
    model.eval(); model.save(a.out)
    print("saved", a.out, f"{time.perf_counter() - t:.0f}s")


if __name__ == "__main__":
    main()

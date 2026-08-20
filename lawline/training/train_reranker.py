"""Fine-tune the cross-encoder reranker on legal (query, provision) pairs.

Data  : the same triplets as the bi-encoder (data/processed/train_triplets.parquet) -> (anchor, positive, 1), (anchor, negative, 0)
Model : cross-encoder/ms-marco-MiniLM-L-6-v2 (22M), single logit, BCE-with-logits
Output: outputs/models/lawline-reranker-legal  (loadable with sentence_transformers.CrossEncoder)
"""
from __future__ import annotations
import argparse, json, random, time
from pathlib import Path
import pandas as pd
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from ..config import DATA_PROCESSED, MODEL_DIR, RERANKER_MODEL

SEED = 13


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=RERANKER_MODEL)
    ap.add_argument("--out", default=str(MODEL_DIR / "lawline-reranker-legal"))
    ap.add_argument("--epochs", type=float, default=1); ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=2e-5); ap.add_argument("--max-len", type=int, default=256)
    ap.add_argument("--max-pairs", type=int, default=20000); ap.add_argument("--device", default="cpu")
    ap.add_argument("--freeze-layers", type=int, default=0)
    a = ap.parse_args()
    torch.manual_seed(SEED); rnd = random.Random(SEED)
    df = pd.read_parquet(DATA_PROCESSED / "train_triplets.parquet")
    pairs = [(q, p, 1.0) for q, p in zip(df.anchor, df.positive)] + [(q, n, 0.0) for q, n in zip(df.anchor, df.negative)]
    rnd.shuffle(pairs); pairs = pairs[: a.max_pairs]
    tok = AutoTokenizer.from_pretrained(a.base)
    model = AutoModelForSequenceClassification.from_pretrained(a.base, num_labels=1).to(a.device)
    if a.freeze_layers:
        for p_ in model.base_model.embeddings.parameters():
            p_.requires_grad = False
        for layer in model.base_model.encoder.layer[: a.freeze_layers]:
            for p_ in layer.parameters():
                p_.requires_grad = False
    trainable = [p_ for p_ in model.parameters() if p_.requires_grad]
    print(f"pairs: {len(pairs)}  trainable: {sum(p.numel() for p in trainable)/1e6:.1f}M", flush=True)
    opt = torch.optim.AdamW(trainable, lr=a.lr, weight_decay=0.01)
    steps_per_epoch = len(pairs) // a.batch; total = int(steps_per_epoch * a.epochs); warm = max(1, int(0.1 * total))
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda st: min((st + 1) / warm, max(0.0, (total - st) / max(1, total - warm))))
    bce = torch.nn.BCEWithLogitsLoss()
    model.train(); hist, t, step = [], time.perf_counter(), 0
    while step < total:
        rnd.shuffle(pairs)
        for b in range(steps_per_epoch):
            if step >= total:
                break
            batch = pairs[b * a.batch:(b + 1) * a.batch]
            enc = tok([q for q, _, _ in batch], [p for _, p, _ in batch], padding="max_length", truncation="longest_first",
                      max_length=a.max_len, return_tensors="pt").to(a.device)
            y = torch.tensor([l for _, _, l in batch], dtype=torch.float32, device=a.device)
            loss = bce(model(**enc).logits.squeeze(-1), y)
            loss.backward(); torch.nn.utils.clip_grad_norm_(trainable, 1.0); opt.step(); sched.step(); opt.zero_grad(set_to_none=True)
            step += 1
            if step % 50 == 0 or step == 1:
                hist.append({"step": step, "loss": float(loss.item())}); print(f"  step {step}/{total} loss {loss.item():.4f} ({time.perf_counter()-t:.0f}s)", flush=True)
    model.eval(); Path(a.out).mkdir(parents=True, exist_ok=True)
    model.save_pretrained(a.out); tok.save_pretrained(a.out)
    json.dump({"base": a.base, "pairs": len(pairs), "epochs": a.epochs, "batch": a.batch, "lr": a.lr, "max_len": a.max_len,
               "freeze_layers": a.freeze_layers, "steps": total, "train_seconds": time.perf_counter() - t, "device": a.device,
               "loss_history": hist}, open(Path(a.out) / "train_meta.json", "w"), indent=2)
    print("saved", a.out, flush=True)


if __name__ == "__main__":
    main()

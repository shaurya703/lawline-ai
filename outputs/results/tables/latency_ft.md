**Per-stage retrieval latency on Apple M-series laptop (ft)**

| Stage           |   mean (ms) |   p50 (ms) |   p95 (ms) |
|:----------------|------------:|-----------:|-----------:|
| faiss           |       3.757 |      4.212 |      4.582 |
| bm25            |       5.409 |      4.380 |     13.739 |
| kg              |       1.106 |      0.981 |      2.882 |
| embed_single    |       5.761 |      4.919 |      8.126 |
| rerank_per_pair |       4.789 |      4.872 |      5.774 |

**Per-stage retrieval latency on Apple M-series laptop (base)**

| Stage           |   mean (ms) |   p50 (ms) |   p95 (ms) |
|:----------------|------------:|-----------:|-----------:|
| faiss           |       3.657 |      4.103 |      4.402 |
| bm25            |       4.354 |      3.621 |     12.330 |
| kg              |      34.093 |     34.048 |     45.058 |
| embed_single    |       5.913 |      5.037 |      8.305 |
| rerank_per_pair |       4.774 |      4.838 |      5.772 |

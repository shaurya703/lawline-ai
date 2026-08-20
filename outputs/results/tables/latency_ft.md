**Per-stage retrieval latency on Apple M-series laptop (ft)**

| Stage           |   mean (ms) |   p50 (ms) |   p95 (ms) |
|:----------------|------------:|-----------:|-----------:|
| faiss           |       2.675 |      2.063 |      3.188 |
| bm25            |    1122.772 |    731.185 |   2825.737 |
| kg              |      87.692 |     67.783 |    165.904 |
| embed_single    |      17.781 |     13.298 |     21.264 |
| rerank_per_pair |      10.227 |     10.084 |     15.536 |

**Per-stage retrieval latency on Apple M-series laptop (base)**

| Stage           |   mean (ms) |   p50 (ms) |   p95 (ms) |
|:----------------|------------:|-----------:|-----------:|
| faiss           |       4.169 |      2.090 |      5.192 |
| bm25            |    1122.772 |    731.185 |   2825.737 |
| kg              |      87.692 |     67.783 |    165.904 |
| embed_single    |     117.877 |     14.775 |     24.450 |
| rerank_per_pair |      10.224 |      9.992 |     15.639 |

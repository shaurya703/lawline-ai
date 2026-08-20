**Fusion-weight / RRF-k sensitivity of the full hybrid without reranking (base embeddings)**

| Fusion setting                    |   R@1 |   R@5 |   MRR@10 |   nDCG@10 |
|:----------------------------------|------:|------:|---------:|----------:|
| faiss+bm25+kg[w_kg=0.5,boost=1.0] | 0.460 | 0.602 |    0.528 |     0.549 |
| faiss+bm25+kg[w_kg=1.0,boost=1.0] | 0.470 | 0.610 |    0.539 |     0.560 |
| faiss+bm25+kg[w_kg=1.0,boost=2.0] | 0.369 | 0.599 |    0.479 |     0.514 |
| faiss+bm25+kg[w_kg=1.0,boost=3.0] | 0.314 | 0.436 |    0.376 |     0.395 |
| faiss+bm25+kg[w_kg=2.0,boost=1.0] | 0.345 | 0.596 |    0.462 |     0.501 |
| faiss+bm25+kg[rrf_k=20]           | 0.477 | 0.614 |    0.544 |     0.563 |
| faiss+bm25+kg[rrf_k=100]          | 0.469 | 0.610 |    0.539 |     0.559 |

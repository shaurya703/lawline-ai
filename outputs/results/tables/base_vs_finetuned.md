**Effect of legal-domain fine-tuning of the bi-encoder (bge-small-en-v1.5)**

| Configuration        | Task      |   nDCG@10 base |   nDCG@10 fine-tuned |      Δ |   R@5 base |   R@5 fine-tuned |
|:---------------------|:----------|---------------:|---------------------:|-------:|-----------:|-----------------:|
| faiss                | BNS-QA    |          0.347 |                0.597 |  0.251 |      0.410 |            0.680 |
| faiss                | IPC-Facts |          0.000 |                0.336 |  0.336 |      0.000 |            0.325 |
| faiss                | Const-QA  |          0.736 |                0.827 |  0.091 |      0.790 |            0.899 |
| faiss                | SC-Case   |          0.931 |                0.894 | -0.036 |      0.964 |            0.930 |
| faiss                | Macro     |          0.503 |                0.664 |  0.160 |      0.541 |            0.709 |
| faiss+bm25           | BNS-QA    |          0.417 |                0.615 |  0.198 |      0.482 |            0.697 |
| faiss+bm25           | IPC-Facts |          0.002 |                0.253 |  0.251 |      0.002 |            0.245 |
| faiss+bm25           | Const-QA  |          0.797 |                0.858 |  0.061 |      0.864 |            0.905 |
| faiss+bm25           | SC-Case   |          0.972 |                0.952 | -0.021 |      0.986 |            0.978 |
| faiss+bm25           | Macro     |          0.547 |                0.669 |  0.122 |      0.584 |            0.706 |
| faiss+bm25+kg        | BNS-QA    |          0.486 |                0.630 |  0.144 |      0.563 |            0.697 |
| faiss+bm25+kg        | IPC-Facts |          0.004 |                0.197 |  0.194 |      0.003 |            0.204 |
| faiss+bm25+kg        | Const-QA  |          0.824 |                0.884 |  0.060 |      0.888 |            0.921 |
| faiss+bm25+kg        | SC-Case   |          0.924 |                0.911 | -0.013 |      0.985 |            0.980 |
| faiss+bm25+kg        | Macro     |          0.560 |                0.656 |  0.096 |      0.610 |            0.700 |
| faiss+bm25+kg+rerank | BNS-QA    |          0.540 |                0.600 |  0.060 |      0.625 |            0.695 |
| faiss+bm25+kg+rerank | IPC-Facts |          0.004 |                0.043 |  0.039 |      0.002 |            0.023 |
| faiss+bm25+kg+rerank | Const-QA  |          0.857 |                0.858 |  0.002 |      0.897 |            0.901 |
| faiss+bm25+kg+rerank | SC-Case   |          0.943 |                0.949 |  0.006 |      0.976 |            0.980 |
| faiss+bm25+kg+rerank | Macro     |          0.586 |                0.612 |  0.027 |      0.625 |            0.650 |
| LawLine (routed)     | BNS-QA    |          0.540 |                0.600 |  0.060 |      0.625 |            0.695 |
| LawLine (routed)     | IPC-Facts |          0.000 |                0.333 |  0.333 |      0.000 |            0.325 |
| LawLine (routed)     | Const-QA  |          0.857 |                0.858 |  0.002 |      0.897 |            0.901 |
| LawLine (routed)     | SC-Case   |          0.943 |                0.949 |  0.006 |      0.976 |            0.980 |
| LawLine (routed)     | Macro     |          0.585 |                0.685 |  0.100 |      0.624 |            0.725 |

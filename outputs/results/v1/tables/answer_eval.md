**End-to-end answer quality (generator gemini-3.5-flash-lite, judge gemini-3.1-flash-lite)**

| Metric                                  |   Closed-book LLM |   LawLine RAG |
|:----------------------------------------|------------------:|--------------:|
| AIBE MCQ accuracy (n=150)               |             0.647 |         0.680 |
| Judged correctness (0–2)                |             1.458 |         1.542 |
| Judged faithfulness (0–2)               |             1.542 |         2.000 |
| Fully-correct rate                      |             0.542 |         0.667 |
| Fabricated-citation rate                |             0.000 |         0.000 |
| Retrieval hit (gold provision in top-5) |           nan     |         0.792 |
| Gold provision explicitly cited         |           nan     |         0.750 |

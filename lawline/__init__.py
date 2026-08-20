"""LawLine AI — hybrid retrieval-augmented generation for Indian legal QA."""
__version__ = "1.0.0"

import os as _os
# torch and faiss-cpu each bundle an OpenMP runtime; on macOS loading both can abort ("OMP: Error #15").
_os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

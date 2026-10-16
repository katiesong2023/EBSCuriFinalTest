#!/usr/bin/env python3
# coding: utf-8
"""기존 PDF의 초등 기준·해설을 페이지 순서대로 추출한다. 원본은 수정하지 않는다."""
import argparse
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
documents = []
for name, first in [('[별책7] 사회과 교육과정.pdf', 25), ('[별책9] 과학과 교육과정.pdf', 19)]:
    source = ROOT / name
    reader = PdfReader(source)
    visual = pdfium.PdfDocument(source)
    documents.append({
        'sourceLocalPath': name,
        'documentSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'pages': [{'page': page, 'text': reader.pages[page - 1].extract_text(extraction_mode='layout'),
                   'visualText': visual[page - 1].get_textpage().get_text_range()}
                  for page in range(first, 46)]
    })
Path(args.output).write_text(json.dumps(documents, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

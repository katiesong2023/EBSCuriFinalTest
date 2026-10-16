#!/usr/bin/env python3
"""R09-01 공식 PDF 발췌를 재현하고 저장된 JSON과 대조한다.

준비: python3 -m pip install pypdf==6.20.0 pypdfium2==5.14.0
실행: python3 server/curriculum-expansion-source.py --check
재생성: 위 명령의 --check 대신 --write (curi-store.json은 변경하지 않는다).
"""

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

from pypdf import PdfReader
import pypdfium2 as pdfium


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "server/data/curriculum-expansion.json"
CHECKED_ON = "2026-10-10"
VERSION = "R09-01-20261010-v1"
PLACEMENT_VERSION = "ebs-neuron-2022-20261010-v1"
SOURCES = [
    {
        "sourceId": "MOE_2022_SOCIAL",
        "subject": "사회",
        "sourceLocalPath": "[별책7] 사회과 교육과정.pdf",
        "sourceDocument": "교육부 고시 제2022-33호 [별책 7] 사회과 교육과정",
        "documentSha256": "a852e8da3e6aea7d1c95690dcae140be02e014b779ac2e5cc0801200cfb16923",
        "pageSelections": [[25, 33], [46, 52], [61, 66]],
        "expectedStandards": {"elementary34": 22, "middle1": 37},
    },
    {
        "sourceId": "MOE_2022_SCIENCE",
        "subject": "과학",
        "sourceLocalPath": "[별책9] 과학과 교육과정.pdf",
        "sourceDocument": "교육부 고시 제2022-33호 [별책 9] 과학과 교육과정",
        "documentSha256": "0cf53427691d54366d6805767c428a15b0e817580807b4354947de7e3b58b738",
        "pageSelections": [[19, 31], [46, 52]],
        "expectedStandards": {"elementary34": 51, "middle1": 26},
    },
]

REFERENCES = {
    "사회": {
        "textbookId": "TB1000012109",
        "textbookTitle": "EBS 중학 뉴런 사회 ①",
        "textbookIsbn": "9788954789226",
        "textbookUrl": "https://ebook.ebs.co.kr/sub/middle/view?ebkId=EB100001989&prodClsCd=24&txbkId=TB1000012109",
        "textbookTargetGrades": [1],
        "lectureCourseId": "100006171",
        "lectureCourseTitle": "EBS 중학 뉴런 사회①- 개념책(2022개정)",
        "lectureUrl": "https://mid.ebs.co.kr/course/view?courseId=100006171",
        "lectureTargetGrades": [1, 2],
        "lectureTotal": 70,
        "units": [
            ("지리", 1, "세계화 시대, 지리의 힘", 1, 5),
            ("지리", 2, "아시아", 6, 13),
            ("지리", 3, "유럽", 14, 19),
            ("지리", 4, "아프리카", 20, 25),
            ("지리", 5, "아메리카", 26, 31),
            ("지리", 6, "오세아니아와 극지방", 32, 36),
            ("일반사회", 1, "인간과 사회생활", 37, 41),
            ("일반사회", 2, "다양한 문화의 이해", 42, 46),
            ("일반사회", 3, "민주주의와 시민", 47, 53),
            ("일반사회", 4, "정치과정과 시민 참여", 54, 60),
            ("일반사회", 5, "일상생활과 법", 61, 65),
            ("일반사회", 6, "인권과 기본권", 66, 70),
        ],
    },
    "과학": {
        "textbookId": "TB1000012107",
        "textbookTitle": "EBS 중학 뉴런 과학 1",
        "textbookIsbn": "9788954789233",
        "textbookUrl": "https://book.ebs.co.kr/sub/middle/view?ebkId=EB100001990&prodClsCd=24&txbkId=TB1000012107",
        "textbookTargetGrades": [1],
        "lectureCourseId": "100006176",
        "lectureCourseTitle": "EBS 중학 뉴런 과학1 - 개념책(2022개정)",
        "lectureUrl": "https://mid.ebs.co.kr/course/view?courseId=100006176",
        "lectureTargetGrades": [1],
        "lectureTotal": 72,
        "units": [
            ("과학", 1, "과학과 인류의 지속가능한 삶", 1, 5),
            ("과학", 2, "생물의 구성과 다양성", 6, 16),
            ("과학", 3, "열", 17, 26),
            ("과학", 4, "물질의 상태 변화", 27, 36),
            ("과학", 5, "힘의 작용", 37, 48),
            ("과학", 6, "기체의 성질", 49, 59),
            ("과학", 7, "태양계", 60, 72),
        ],
    },
}

CODE = r"[49](?:사(?:\((?:지리|일사)\))?|과)\d{2}[-–]\d{2}"
UNIT = re.compile(r"\((\d+)\) ([^\r\n]+)\r?\n(\[" + CODE + r"\][\s\S]*?)(?=\(가\)|$)")
STANDARD = re.compile(r"\[(" + CODE + r")\]\s*([\s\S]*?)(?=\[" + CODE + r"\]|<탐구 활동>|$)")


def sha256(value):
    return hashlib.sha256(value.encode("utf-8") if isinstance(value, str) else value).hexdigest()


def without_spaces(value):
    return re.sub(r"\s", "", value)


def normalize_text(pdfium_text, pypdf_text):
    """PDFium의 자간 처리와 pypdf의 줄 끝 단어 경계 공백을 결합한다."""
    assert without_spaces(pdfium_text) == without_spaces(pypdf_text), "추출 엔진 간 글자 불일치"
    spaced_boundaries = set()
    position = 0
    for char in pypdf_text:
        if char in " \t":
            spaced_boundaries.add(position)
        elif not char.isspace():
            position += 1
    output = []
    position = 0
    for char in pdfium_text:
        if char in "\r\n":
            if position in spaced_boundaries:
                output.append(" ")
        else:
            output.append(char)
            if not char.isspace():
                position += 1
    return re.sub(r"\s+", " ", "".join(output)).strip()


def placements():
    result = []
    for subject, reference in REFERENCES.items():
        for index, (area, number, title, first, last) in enumerate(reference["units"], 1):
            result.append({
                "placementId": f"EBS-NEURON-2022-{reference['textbookId']}-{index:02d}",
                "status": "REFERENCE_MAPPED",
                "version": PLACEMENT_VERSION,
                "courseId": "middle1",
                "subject": subject,
                "subjectArea": area,
                "officialUnitNo": str(number),
                "officialUnitTitle": title,
                "textbookUnitNo": index,
                "textbookUnitTitle": title,
                **{key: value for key, value in reference.items() if key != "units"},
                "curriculumRevision": "2022",
                "lectureRange": {"start": first, "end": last},
                "lectureRangeIncludesExercises": True,
                "schoolPlacementConfirmed": False,
                "checkedAt": CHECKED_ON,
                "mappingLevel": "UNIT_CONTENT_CORRESPONDENCE",
                "note": "공식 성취기준과 EBS 단원·개념 강의 내용의 대응을 확인한 참고 편성이다. 개별 학교의 중1 편성이나 모든 수행 요구의 강의 충족을 확정하지 않는다.",
            })
    return result


def extract_units(text):
    result = []
    for unit in UNIT.finditer(text):
        for standard in STANDARD.finditer(unit.group(3)):
            result.append({
                "unitNo": unit.group(1),
                "unitTitle": unit.group(2).strip(),
                "originalId": standard.group(1),
                "code": standard.group(1).replace("–", "-"),
                "text": standard.group(2).strip(),
                "start": unit.start(3) + standard.start(),
                "end": unit.start(3) + standard.end(),
            })
    return result


def render_source_boxes(document, page_number, textpage, text, records, destination, subject):
    """성취기준 상자를 렌더한다. PDF의 좌하단 좌표를 이미지 좌상단으로 바꾼다."""
    if not records:
        return
    page = document[page_number - 1]
    scale = 2
    bitmap = page.render(scale=scale).to_pil()
    for unit_number in dict.fromkeys(row["unitNo"] for row in records):
        rows = [row for row in records if row["unitNo"] == unit_number]
        first, last = rows[0]["start"], rows[-1]["end"]
        # get_text_range의 문자 인덱스가 PDFium의 문자 인덱스와 다른 문서는 중단한다.
        assert textpage.get_text_range(first, last - first) == text[first:last]
        boxes = [textpage.get_charbox(i) for i in range(first, last) if not text[i].isspace()]
        left = min(box[0] for box in boxes) - 9
        bottom = min(box[1] for box in boxes) - 9
        right = max(box[2] for box in boxes) + 9
        top = max(box[3] for box in boxes) + 9
        crop = bitmap.crop((int(left * scale), int((page.get_height() - top) * scale),
                            int(right * scale), int((page.get_height() - bottom) * scale)))
        crop.save(destination / f"{subject}-p{page_number}-unit{unit_number}.png")


def build_manifest(render_directory=None):
    placement_records = placements()
    standards = []
    if render_directory:
        render_directory.mkdir(parents=True, exist_ok=True)
    for source in SOURCES:
        path = ROOT / source["sourceLocalPath"]
        assert sha256(path.read_bytes()) == source["documentSha256"], f"PDF 판본 변경: {path.name}"
        plain_reader = PdfReader(path)
        visual_reader = pdfium.PdfDocument(path)
        for first, last in source["pageSelections"]:
            for page_number in range(first, last + 1):
                plain_text = plain_reader.pages[page_number - 1].extract_text()
                page = visual_reader[page_number - 1]
                textpage = page.get_textpage()
                visual_text = textpage.get_text_range()
                plain_records = {row["code"]: row for row in extract_units(plain_text)}
                visual_records = extract_units(visual_text)
                assert set(plain_records) == {row["code"] for row in visual_records}, "코드 집합 불일치"
                printed_page = re.search(r"\n(\d+)\r?\n", visual_text).group(1)
                assert int(printed_page) == page_number - 6, "인쇄 쪽 위치 변경"
                for raw in visual_records:
                    code = raw["code"]
                    plain = plain_records[code]
                    text = normalize_text(raw["text"], plain["text"])
                    assert text.endswith("다."), f"완결되지 않은 기준: {code}"
                    middle = code.startswith("9")
                    area = "지리" if "(지리)" in code else "일반사회" if "(일사)" in code else source["subject"]
                    record = {
                        "curiId": f"CURI-CURR-2022-{code}",
                        "sourceIdentity": {
                            "stableKey": f"MOE_2022_CURRICULUM:2022 개정:{code}",
                            "sourceSystem": "MOE_2022_CURRICULUM",
                            "sourceStandardId": code,
                        },
                        "curriculumVersion": "2022 개정",
                        "source": {
                            "sourceDocument": source["sourceDocument"],
                            "sourceLocalPath": source["sourceLocalPath"],
                            "sourcePdfPage": str(page_number),
                            "sourcePrintedPage": printed_page,
                            "documentSha256": source["documentSha256"],
                            "contentFingerprint": sha256(f"{code}\n{text}"),
                            "fingerprintMethod": "sha256-code-newline-text-v1",
                            "originalStandardId": raw["originalId"],
                            "rawExtractedText": raw["text"],
                            "extractionMethod": "pdfium-text-with-pypdf-line-boundaries-v1",
                            "sourceFirstSeenAt": CHECKED_ON,
                            "sourceLastSeenAt": CHECKED_ON,
                        },
                        "metadata": {
                            "schoolLevel": "중학교" if middle else "초등학교",
                            "gradeBand": "1~3학년군" if middle else "3~4학년군",
                            "officialGradeLabel": "중학교 1~3학년" if middle else "초등학교 3~4학년",
                            "courseId": "middle1" if middle else "elementary34",
                            "subject": source["subject"],
                            "subjectArea": area,
                            "unitNo": raw["unitNo"],
                            "unitTitle": raw["unitTitle"],
                            "achievementStandardId": code,
                            "achievementStandard": text,
                        },
                        "provenance": {
                            "classification": "SOURCE",
                            "evidenceClassification": "SOURCE",
                            "agentCheckedOn": CHECKED_ON,
                            "qaNotes": "공식 PDF 성취기준 본문을 두 추출 엔진 및 렌더 이미지로 대조했다. 사람 승인·방송 관계·학년 적합성 평가는 수행하지 않았다.",
                        },
                        "review": {
                            "status": "SOURCE_CHECKED",
                            "humanConfirmed": False,
                            "agentPdfTextCheck": "PASS",
                            "agentPdfVisualCheck": "PASS",
                            "agentStructureCheck": "PASS",
                        },
                        "lifecycle": {
                            "isActive": True,
                            "assetClassification": "OFFICIAL_EVIDENCE",
                            "isCuriBaseVerified": False,
                            "isSearchEligible": False,
                        },
                    }
                    if middle:
                        matches = [p for p in placement_records if p["subject"] == source["subject"]
                                   and p["subjectArea"] == area and p["officialUnitNo"] == raw["unitNo"]]
                        assert len(matches) == 1, f"중1 참고 편성 누락: {code}"
                        record["placement"] = matches[0].copy()
                        assert raw["unitTitle"] == record["placement"]["officialUnitTitle"], f"단원명 불일치: {code}"
                    standards.append(record)
                if render_directory:
                    render_source_boxes(visual_reader, page_number, textpage, visual_text,
                                        visual_records, render_directory, source["subject"])
        counts = Counter(row["metadata"]["courseId"] for row in standards if row["metadata"]["subject"] == source["subject"])
        assert dict(counts) == source["expectedStandards"], f"기준 수 불일치: {counts}"
    assert len({row["curiId"] for row in standards}) == len(standards) == 136
    return {
        "version": VERSION,
        "checkedAt": CHECKED_ON,
        "extractionTools": {"pypdf": "6.20.0", "pypdfium2": "5.14.0"},
        "sources": SOURCES,
        "placements": placement_records,
        "standards": standards,
        "unresolvedStandards": [],
        "scopeNote": "중학교 1~3학년 공식 범위 중 EBS 뉴런 사회① 지리1~6·일반사회1~6, 과학1 단원1~7의 내용 대응만 중1 참고 편성으로 수록했다. 학교별 편성은 미확인이다.",
        "normalizationNotes": [
            "공식 성취기준 본문만 발췌하고 성취기준 해설·탐구 활동·적용 시 고려 사항은 본문에 합치지 않았다.",
            "PDFium과 pypdf 추출 결과의 공백 제외 글자열 일치를 전수 검사했다.",
            "PDFium 내부 띄어쓰기를 유지하고 pypdf의 줄 끝 공백으로 줄바꿈 단어 경계를 보완했다.",
            "4사01–01·4사01–02의 en dash만 식별자의 ASCII hyphen으로 바꾸고 originalStandardId에 원 표기를 보존했다.",
            "gradeBand는 앱의 공식 학년군 표기이며 officialGradeLabel에 PDF의 실제 구간 제목을 별도 보존했다.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    parser.add_argument("--render-dir", type=Path)
    args = parser.parse_args()
    result = build_manifest(args.render_dir)
    if args.write:
        OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        assert json.loads(OUTPUT.read_text(encoding="utf-8")) == result, "저장 JSON과 재추출 결과 불일치"
    counts = Counter(f"{s['metadata']['courseId']}/{s['metadata']['subject']}" for s in result["standards"])
    print(json.dumps({"result": "PASS", "standards": len(result["standards"]),
                      "placements": len(result["placements"]), "counts": counts,
                      "sourceDocumentDigestsVerified": len(SOURCES),
                      "unresolvedStandards": len(result["unresolvedStandards"])}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

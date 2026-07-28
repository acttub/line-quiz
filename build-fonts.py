#!/usr/bin/env python3
"""화면에 실제로 쓰인 글자만 담은 Pretendard woff2를 만든다.

문구가 고정이라 전체 한글(굵기당 1.5MB)을 실을 이유가 없다.
쓰인 글자만 서브셋하면 굵기당 수 KB로 끝난다.

⚠️ index.html만 훑으면 안 된다. 이 프로젝트의 문장은 대부분 copy.js·data.js에 있고,
   대사·상황·질문이 전부 거기 있다. 세 파일을 모두 모아야 한다 —
   빼면 화면 절반이 시스템 폰트로 렌더된다. (link-hub의 같은 스크립트는 index.html만 본다)

⚠️ 문구를 고치면 이 스크립트를 다시 돌린다.

원본 otf는 이 저장소에 두지 않는다(라이선스 원본을 재배포하지 않기 위해서다).
경로는 환경변수로 준다:

    PRETENDARD_DIR=<원본 otf 폴더> uv run --with "fonttools[woff]" python build-fonts.py

환경변수가 없으면 상위 폴더의 `brand/fonts`를 찾아본다.
"""
import html
import os
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
SRC_DIR = pathlib.Path(os.environ.get("PRETENDARD_DIR") or (HERE / ".." / ".." / "brand" / "fonts")).expanduser()
OUT_DIR = HERE / "fonts"

# 사람이 읽는 문장이 들어 있는 파일 전부
TEXT_FILES = ["index.html", "copy.js", "data.js"]

# CSS font-weight -> 원본 파일
WEIGHTS = {
    500: "Pretendard-Medium.otf",    # 이 브랜드의 가장 얇은 굵기 (Regular 파일이 없다)
    600: "Pretendard-SemiBold.otf",
    700: "Pretendard-Bold.otf",
}

# 문구를 조금 고쳐도 깨지지 않도록 넣어두는 최소 안전망
ALWAYS = (
    "0123456789"
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    " .,!?·—–-~:;'\"“”()[]/@&%+*#…"
)


def html_text(src: str) -> str:
    """style/script 블록과 태그를 걷어내고, 사용자에게 보이는 속성값을 더한다."""
    src = re.sub(r"<(style|script)\b.*?</\1>", " ", src, flags=re.S | re.I)
    attrs = " ".join(re.findall(r'(?:content|alt|title)="([^"]*)"', src))
    body = re.sub(r"<[^>]+>", " ", src)
    return html.unescape(body + " " + attrs)


JS_STRING = re.compile(r'"([^"\\]*)"|\'([^\'\\]*)\'|`([^`\\]*)`')


def js_text(src: str) -> str:
    """따옴표 안의 문자열을 통째로 모은다.

    클래스명·식별자까지 섞여 들어오지만 해가 없다 — 서브셋에 글자가 몇 개 더 들어갈 뿐이고,
    빠지는 것보다 남는 쪽이 안전하다. 그래서 정교하게 파싱하지 않는다."""
    return " ".join(s for groups in JS_STRING.findall(src) for s in groups)


def collect() -> str:
    out = []
    for name in TEXT_FILES:
        path = HERE / name
        if not path.is_file():
            print(f"  건너뜀 (파일 없음): {name}", file=sys.stderr)
            continue
        src = path.read_text(encoding="utf-8")
        out.append(html_text(src) if name.endswith(".html") else js_text(src))
    return " ".join(out)


def main() -> int:
    if not SRC_DIR.is_dir():
        print(f"원본 폰트 폴더가 없다: {SRC_DIR}\nPRETENDARD_DIR로 경로를 지정한다.", file=sys.stderr)
        return 1

    # 원본이 하나라도 없으면 시작하지 않는다. 굵기를 빼먹고 성공으로 끝내면
    # 옛 파일이 fonts/에 남아 서로 다른 시점의 폰트가 함께 배포된다.
    missing = [f for f in WEIGHTS.values() if not (SRC_DIR / f).is_file()]
    if missing:
        print(f"원본이 없다: {', '.join(missing)} (in {SRC_DIR})", file=sys.stderr)
        return 1

    chars = sorted(set(collect()) | set(ALWAYS))
    text = "".join(c for c in chars if c.isprintable() and not c.isspace())
    print(f"서브셋 대상 글자 {len(text)}자")

    OUT_DIR.mkdir(exist_ok=True)
    total = 0
    for weight, filename in WEIGHTS.items():
        src = SRC_DIR / filename
        out = OUT_DIR / f"pretendard-{weight}.woff2"
        subprocess.run(
            [
                "pyftsubset", str(src),
                f"--text={text}",
                "--flavor=woff2",
                "--layout-features=kern,liga",
                "--desubroutinize",
                f"--output-file={out}",
            ],
            check=True,
        )
        size = out.stat().st_size
        total += size
        print(f"  {out.name:24} {size/1024:6.1f}KB")

    print(f"합계 {total/1024:.1f}KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

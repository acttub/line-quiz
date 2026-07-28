#!/usr/bin/env python3
"""공유 카드(og.jpg)를 만든다. 배경은 AI 생성물, 한글은 여기서 얹는다.

왜 나눠서 하나: 이미지 생성 모델은 이미지 안의 한글 자모를 자주 깨뜨린다.
그래서 배경만 생성하고 글자는 Pretendard로 직접 그린다.

배경을 새로 뽑고 싶을 때만 생성기를 다시 돌린다. 문구만 바꿀 거면 이 스크립트만 다시 돌리면 된다.

    uv run --with pillow python design/render-og.py

⚠️ 문구를 바꾸면 index.html의 og:description·description도 같이 본다.
   공유 카드와 미리보기 설명이 다른 말을 하면 그게 더 어색하다.
"""
import pathlib

from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent / "og.jpg"
BG = HERE / "og-bg-2026-07-28.png"

# 카카오톡·페이스북·X가 공통으로 받아주는 크기다. 1.91:1.
W, H = 1200, 630
MARGIN = 88

# Pretendard 원본은 이 저장소에 두지 않는다(라이선스 원본을 재배포하지 않기 위해서다).
# 브랜드 폰트 폴더 경로를 환경변수로 주거나, 상위 볼트의 위치를 기본값으로 쓴다.
import os

FONT_DIR = pathlib.Path(
    os.environ.get("PRETENDARD_DIR") or (HERE / ".." / ".." / ".." / "brand" / "fonts")
).expanduser()


def font(name, size):
    path = FONT_DIR / name
    if not path.is_file():
        raise SystemExit(f"폰트가 없다: {path}\nPRETENDARD_DIR로 원본 폴더를 지정한다.")
    return ImageFont.truetype(str(path), size)


# ── 문구 ──────────────────────────────────────────────────────────────
# 앱의 copy.js와 같은 목소리로 둔다. 연기를 평가하는 말을 쓰지 않는다 —
# 맞히는 건 작품 이름이지 사람이 아니다.
BRAND = "acttub"
TITLE = "이 대사, 어느 무대?"
SUB = "대사 한 줄만 보고 작품 맞히기"
BODY = ["셰익스피어부터 체호프까지, 열 문제.", "3분이면 끝나요."]


def main():
    bg = Image.open(BG).convert("RGB")

    # cover-crop — 배경이 요청과 다른 크기로 와도 여기서 크기를 책임진다.
    scale = max(W / bg.width, H / bg.height)
    bg = bg.resize((round(bg.width * scale), round(bg.height * scale)), Image.LANCZOS)
    left = (bg.width - W) // 2
    top = (bg.height - H) // 2
    card = bg.crop((left, top, left + W, top + H))

    # 글자가 앉는 왼쪽만 아주 옅게 눌러 대비를 올린다.
    # 브랜드 색을 바꾸지 않을 만큼만 — 진하게 깔면 그라데이션이 죽는다.
    scrim = Image.new("L", (W, 1))
    for x in range(W):
        scrim.putpixel((x, 0), int(46 * max(0.0, 1 - x / (W * 0.72))))
    scrim = scrim.resize((W, H))
    card = Image.composite(Image.new("RGB", (W, H), (2, 30, 80)), card, scrim)

    d = ImageDraw.Draw(card)
    white = (255, 255, 255)

    d.text((MARGIN, 148), BRAND, font=font("Pretendard-Bold.otf", 32), fill=(255, 255, 255))

    d.text((MARGIN, 218), TITLE, font=font("Pretendard-Bold.otf", 76), fill=white)

    d.text((MARGIN, 336), SUB, font=font("Pretendard-SemiBold.otf", 36), fill=(233, 244, 255))

    body_font = font("Pretendard-Medium.otf", 29)
    y = 424
    for line in BODY:
        d.text((MARGIN, y), line, font=body_font, fill=(214, 234, 255))
        y += 46

    card.save(OUT, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"{OUT}  {card.size}  {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()

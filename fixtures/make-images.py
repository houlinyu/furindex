#!/usr/bin/env python3
"""
Generates the image fixtures: things a phone camera or a flatbed scanner
actually produces. Clean renders would flatter the OCR layer dishonestly, so
every one of these is degraded — skew, sensor noise, uneven lighting, JPEG
compression — the way a real photo of a paper card is.

    python3 fixtures/make-images.py

Deterministic: the noise is seeded, so a fixture is the same file every run and
a regression in the parser is visible as a real change.
"""
import math
import os
import random
import subprocess
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
FONTS = os.path.join(HERE, "fonts")
os.makedirs(OUT, exist_ok=True)

DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DEJAVU_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
CAVEAT = os.path.join(FONTS, "Caveat.ttf")


def font(path, size):
    return ImageFont.truetype(path, size)


# --------------------------------------------------------------- degradation


def scan_degrade(img, seed, skew=1.2, noise=9, blur=0.7, jpeg=62, vignette=0.35):
    """Make a clean render look like it went through a phone camera.

    Every step here corresponds to a real-world artefact: skew from holding the
    paper crooked, blur from the lens, noise from a small sensor in poor light,
    vignette from uneven lighting, JPEG from the phone's encoder.
    """
    rnd = random.Random(seed)
    img = img.convert("L")

    if skew:
        img = img.rotate(skew, resample=Image.BICUBIC, expand=True, fillcolor=245)

    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))

    if vignette:
        w, h = img.size
        mask = Image.new("L", (w, h), 255)
        md = ImageDraw.Draw(mask)
        cx, cy = w * 0.45, h * 0.4
        maxd = math.hypot(max(cx, w - cx), max(cy, h - cy))
        for i in range(28):
            f = i / 28.0
            md.ellipse(
                [cx - maxd * (1 - f * 0.9), cy - maxd * (1 - f * 0.9),
                 cx + maxd * (1 - f * 0.9), cy + maxd * (1 - f * 0.9)],
                fill=int(255 - 255 * vignette * f),
            )
        mask = mask.filter(ImageFilter.GaussianBlur(40))
        img = Image.composite(img, Image.new("L", img.size, 255), mask.point(lambda v: 255 - v))
        img = Image.blend(img, Image.new("L", img.size, 235), 0.0)

    if noise:
        px = img.load()
        w, h = img.size
        for y in range(h):
            for x in range(w):
                v = px[x, y] + int(rnd.gauss(0, noise))
                px[x, y] = 0 if v < 0 else (255 if v > 255 else v)

    img = ImageEnhance.Contrast(img).enhance(0.92)
    img = ImageEnhance.Brightness(img).enhance(1.03)

    if jpeg:
        tmp = os.path.join(OUT, ".tmp-degrade.jpg")
        img.save(tmp, quality=jpeg)
        img = Image.open(tmp).convert("L")
        img.load()
        os.remove(tmp)
    return img


# ------------------------------------------------- F2: vaccination record card

def vaccination_card():
    W, H = 1240, 900
    img = Image.new("L", (W, H), 252)
    d = ImageDraw.Draw(img)

    d.rectangle([18, 18, W - 18, H - 18], outline=120, width=3)

    d.text((50, 44), "BROOKLINE ANIMAL HOSPITAL", font=font(DEJAVU_B, 34), fill=15)
    d.text((50, 88), "310 Harvard Street, Brookline MA 02446  ·  (617) 555-0177",
           font=font(DEJAVU, 18), fill=70)
    d.line([50, 122, W - 50, 122], fill=110, width=2)

    d.text((50, 142), "CERTIFICATE OF VACCINATION", font=font(DEJAVU_B, 26), fill=15)

    rows = [
        ("Patient", "Pepper"),
        ("Species", "Feline"),
        ("Breed", "Domestic Shorthair"),
        ("Sex", "Female (spayed)"),
        ("Date of Birth", "06/09/2022"),
        ("Microchip", "981020012345678"),
        ("Weight", "9.3 lb"),
        ("Date of Visit", "January 22, 2026"),
        ("Veterinarian", "Dr. A. Nakamura, DVM"),
    ]
    y = 192
    for k, v in rows:
        d.text((50, y), k, font=font(DEJAVU_B, 20), fill=25)
        d.text((300, y), v, font=font(DEJAVU, 20), fill=25)
        y += 34

    y += 18
    d.line([50, y, W - 50, y], fill=110, width=2)
    y += 16
    cols = [50, 420, 640, 860]
    for label, x in zip(["VACCINE", "DATE GIVEN", "NEXT DUE", "LOT NUMBER"], cols):
        d.text((x, y), label, font=font(DEJAVU_B, 19), fill=15)
    y += 34
    d.line([50, y, W - 50, y], fill=160, width=1)
    y += 12

    vax = [
        ("FVRCP", "01/22/2026", "01/22/2027", "FV-91188"),
        ("Rabies (1 year)", "01/22/2026", "01/22/2027", "RB-2210044"),
        ("FeLV", "01/22/2026", "01/22/2027", "FL-77120"),
    ]
    for row in vax:
        for cell, x in zip(row, cols):
            d.text((x, y), cell, font=font(DEJAVU, 20), fill=25)
        y += 38

    y += 26
    d.text((50, y), "Heartworm/FeLV/FIV combo test:  Negative", font=font(DEJAVU, 20), fill=25)
    y += 34
    d.text((50, y), "Dispensed: Revolution Plus 5.1-11 lb  —  apply 1 tube topically monthly.",
           font=font(DEJAVU, 20), fill=25)
    y += 34
    d.text((50, y), "Total charged: $196.00", font=font(DEJAVU, 20), fill=25)

    d.text((50, H - 76), "Signature: ______________________  Date: 01/22/2026",
           font=font(DEJAVU, 19), fill=60)
    return img


# ----------------------------------------------------- F3: handwritten chart note

def handwritten_note():
    W, H = 1100, 820
    img = Image.new("L", (W, H), 250)
    d = ImageDraw.Draw(img)
    for y in range(150, H - 60, 62):  # ruled paper
        d.line([60, y, W - 60, y], fill=205, width=2)
    d.line([120, 60, 120, H - 40], fill=225, width=2)

    d.text((150, 62), "Riverside Vet Clinic", font=font(DEJAVU_B, 26), fill=60)

    lines = [
        "Sunny  -  Golden Retriever, MN",
        "8/2/26   wt 62 lb",
        "Rabies given today, lot 7741",
        "DHPP booster due 8/2/27",
        "Carprofen 75mg  BID x 7d",
        "Recheck in 2 wks",
    ]
    y = 158
    rnd = random.Random(7)
    for ln in lines:
        d.text((140 + rnd.randint(-6, 6), y - 44 + rnd.randint(-3, 3)), ln,
               font=font(CAVEAT, 52), fill=35)
        y += 62
    return img


# ------------------------------------------------------------------- generate

def main():
    # F2 — a scan of a printed vaccination card. Legible, but through a camera.
    card = vaccination_card()
    scan_degrade(card, seed=2, skew=1.4, noise=9, blur=0.8, jpeg=60).save(
        os.path.join(OUT, "f2-vaccination-card.png"))

    # F3 — handwriting. Tesseract is trained on print; this is the honest floor.
    scan_degrade(handwritten_note(), seed=3, skew=-0.9, noise=7, blur=0.6, jpeg=70).save(
        os.path.join(OUT, "f3-handwritten-note.png"))

    # F7 — the same card, but a genuinely bad photo. Must come back unreadable.
    scan_degrade(card, seed=7, skew=3.4, noise=26, blur=3.4, jpeg=22, vignette=0.7).save(
        os.path.join(OUT, "f7-blurry-card.png"))

    # F6 — the F1 invoice printed, scanned and saved as an image-only PDF. Same
    # ground truth as F1, so Layer 1 and Layer 2 are measured on identical content.
    src = os.path.join(OUT, "f1-invoice-textlayer.pdf")
    if not os.path.exists(src):
        sys.exit("run `node fixtures/make-pdfs.mjs` first")
    stem = os.path.join(OUT, ".f1raster")
    subprocess.run(["pdftoppm", "-png", "-r", "150", "-f", "1", "-l", "1", src, stem], check=True)
    raster = Image.open(stem + "-1.png")
    scanned = scan_degrade(raster, seed=6, skew=0.8, noise=8, blur=0.9, jpeg=58)
    scanned.convert("RGB").save(os.path.join(OUT, "f6-scanned-invoice.pdf"),
                                "PDF", resolution=150.0)
    scanned.save(os.path.join(OUT, "f6-scanned-invoice.png"))
    os.remove(stem + "-1.png")

    for f in sorted(os.listdir(OUT)):
        print(f"{os.path.getsize(os.path.join(OUT, f)):>9}  {f}")


if __name__ == "__main__":
    main()

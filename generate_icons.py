#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import os

sizes = [72, 96, 128, 144, 152, 192, 384, 512]

# Colors
BG_COLOR = (13, 148, 136)      # teal #0d9488
LIGHT_COLOR = (240, 253, 250)  # very light teal for text/design

output_dir = "/home/user/app/public/icons"
os.makedirs(output_dir, exist_ok=True)

def create_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background circle
    margin = int(size * 0.05)
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=BG_COLOR
    )

    # Draw a simple open book shape
    cx = size // 2
    cy = size // 2
    book_w = int(size * 0.55)
    book_h = int(size * 0.38)

    # book base (rectangle)
    bx1 = cx - book_w // 2
    by1 = cy - book_h // 2
    bx2 = cx + book_w // 2
    by2 = cy + book_h // 2

    line_w = max(1, size // 50)

    # left page
    draw.rectangle([bx1, by1, cx - line_w, by2], fill=LIGHT_COLOR)
    # right page
    draw.rectangle([cx + line_w, by1, bx2, by2], fill=LIGHT_COLOR)
    # spine line
    draw.rectangle([cx - line_w, by1 - int(size*0.04), cx + line_w, by2 + int(size*0.04)], fill=LIGHT_COLOR)

    # draw lines on left page (text lines)
    line_gap = max(2, int(book_h * 0.2))
    for i in range(1, 4):
        y = by1 + i * line_gap
        if y < by2 - line_gap // 2:
            margin_inner = max(2, size // 32)
            draw.rectangle(
                [bx1 + margin_inner, y, cx - line_w - margin_inner, y + max(1, line_w // 2)],
                fill=BG_COLOR
            )

    # draw lines on right page
    for i in range(1, 4):
        y = by1 + i * line_gap
        if y < by2 - line_gap // 2:
            margin_inner = max(2, size // 32)
            draw.rectangle(
                [cx + line_w + margin_inner, y, bx2 - margin_inner, y + max(1, line_w // 2)],
                fill=BG_COLOR
            )

    # book arc top (open book curve)
    arc_h = int(size * 0.06)
    draw.arc(
        [bx1, by1 - arc_h, bx2, by1 + arc_h],
        start=0, end=180, fill=LIGHT_COLOR, width=line_w
    )

    return img

for size in sizes:
    icon = create_icon(size)
    path = os.path.join(output_dir, f"icon-{size}.png")
    icon.save(path, "PNG", optimize=True)
    file_size = os.path.getsize(path)
    print(f"Created icon-{size}.png ({file_size} bytes)")

print("All icons created successfully!")

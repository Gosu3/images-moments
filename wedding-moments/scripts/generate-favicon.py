"""Render the local Vietnamese logo font into browser icons without font fallback."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
size = 512
image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.ellipse((4, 4, 508, 508), fill="#fff5e9")
draw.ellipse((15, 7, 497, 501), outline="#8c334a", width=15)
draw.ellipse((29, 19, 507, 489), outline="#b76070", width=5)
font_path = root / "public/fonts/couple-script.ttf"
font = ImageFont.truetype(str(font_path), 180)
amp = ImageFont.truetype(str(font_path), 340)
draw.text((256, 268), "&", font=amp, anchor="mm", fill="#ead4cd")
draw.text((256, 174), "Thọ", font=font, anchor="mm", fill="#752d40")
draw.text((256, 345), "Thắm", font=font, anchor="mm", fill="#752d40")
image.resize((192, 192), Image.Resampling.LANCZOS).save(root / "public/favicon.png")
image.save(root / "public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
image.resize((180, 180), Image.Resampling.LANCZOS).save(root / "public/apple-touch-icon.png")

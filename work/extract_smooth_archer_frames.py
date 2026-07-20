from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src/assets/english-longbowman-upward-shot-inbetweens-v2.png"
OUTPUT = ROOT / "src/assets/english-longbowman-upward-shot-frames"
CELL_WIDTH = 384
CELL_HEIGHT = 512
SOURCE_PIXEL_SCALE = 1.63
PADDING = 18
NAMES = [
    "smooth-01-lift-and-nock.png",
    "smooth-02-early-draw.png",
    "smooth-03-stronger-draw.png",
    "smooth-04-final-pull.png",
    "smooth-05-string-snap.png",
    "smooth-06-follow-through.png",
    "smooth-07-settle.png",
]


def main():
    sheet = Image.open(SOURCE).convert("RGBA")
    OUTPUT.mkdir(parents=True, exist_ok=True)

    for index, name in enumerate(NAMES):
        column = index % 4
        row = index // 4
        cell = sheet.crop(
            (
                column * CELL_WIDTH,
                row * CELL_HEIGHT,
                (column + 1) * CELL_WIDTH,
                (row + 1) * CELL_HEIGHT,
            )
        )
        bounds = cell.getchannel("A").getbbox()
        if bounds is None:
            raise RuntimeError(f"Sprite cell {index + 1} is empty")

        sprite = cell.crop(bounds)
        sprite = sprite.resize(
            (
                round(sprite.width * SOURCE_PIXEL_SCALE),
                round(sprite.height * SOURCE_PIXEL_SCALE),
            ),
            Image.Resampling.LANCZOS,
        )
        framed = Image.new(
            "RGBA",
            (sprite.width + PADDING * 2, sprite.height + PADDING * 2),
            (0, 0, 0, 0),
        )
        framed.alpha_composite(sprite, (PADDING, PADDING))
        framed.save(OUTPUT / name, optimize=True)


if __name__ == "__main__":
    main()

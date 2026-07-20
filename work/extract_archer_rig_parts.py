from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "src/assets/english-longbowman-rig"
PADDING = 8


def trim_and_pad(image: Image.Image) -> Image.Image:
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("Rig part has no visible pixels")
    part = image.crop(bounds)
    output = Image.new(
        "RGBA",
        (part.width + PADDING * 2, part.height + PADDING * 2),
        (0, 0, 0, 0),
    )
    output.alpha_composite(part, (PADDING, PADDING))
    return output


def main():
    body = Image.open(ASSET_DIR / "body-base.png").convert("RGBA")
    trim_and_pad(body).save(ASSET_DIR / "body.png", optimize=True)

    sheet = Image.open(ASSET_DIR / "limbs-sheet.png").convert("RGBA")
    cell_width = sheet.width // 2
    cell_height = sheet.height // 2
    cells = [
        (0, 0, "bow-arm.png"),
        (1, 0, "draw-upper-arm.png"),
        (0, 1, "draw-forearm.png"),
    ]
    for column, row, filename in cells:
        cell = sheet.crop(
            (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            )
        )
        trim_and_pad(cell).save(ASSET_DIR / filename, optimize=True)


if __name__ == "__main__":
    main()

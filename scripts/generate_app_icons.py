from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'xq' / 'assets' / 'app-icon-stardew-pixel.jpg'
RES = ROOT / 'app' / 'android' / 'app' / 'src' / 'main' / 'res'
OUT = ROOT / 'app' / 'resources'


def main() -> None:
    img = Image.open(SRC).convert('RGBA')
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))

    OUT.mkdir(parents=True, exist_ok=True)
    master = img.resize((1024, 1024), Image.Resampling.NEAREST)
    master.save(OUT / 'icon.png')
    master.save(OUT / 'icon-foreground.png')

    sizes = {
        'mipmap-mdpi': 48,
        'mipmap-hdpi': 72,
        'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144,
        'mipmap-xxxhdpi': 192,
    }
    fg_sizes = {
        'mipmap-mdpi': 108,
        'mipmap-hdpi': 162,
        'mipmap-xhdpi': 216,
        'mipmap-xxhdpi': 324,
        'mipmap-xxxhdpi': 432,
    }

    for folder, size in sizes.items():
        d = RES / folder
        d.mkdir(parents=True, exist_ok=True)
        icon = img.resize((size, size), Image.Resampling.NEAREST)
        icon.save(d / 'ic_launcher.png')
        icon.save(d / 'ic_launcher_round.png')

    for folder, size in fg_sizes.items():
        d = RES / folder
        content = max(int(size * 0.72), 1)
        inner = img.resize((content, content), Image.Resampling.NEAREST)
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        offset = (size - content) // 2
        canvas.paste(inner, (offset, offset), inner)
        canvas.save(d / 'ic_launcher_foreground.png')

    print('icons written to', RES)
    print('master icons written to', OUT)


if __name__ == '__main__':
    main()

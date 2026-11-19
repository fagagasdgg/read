from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'xq' / 'assets' / 'app-icon-stardew-pixel.jpg'
RES = ROOT / 'app' / 'android' / 'app' / 'src' / 'main' / 'res'
OUT = ROOT / 'app' / 'resources'

# legacy launcher icon sizes (mipmap)
LAUNCHER_SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

# adaptive foreground (drawable) — 108dp * density
FOREGROUND_SIZES = {
    'drawable-mdpi': 108,
    'drawable-hdpi': 162,
    'drawable-xhdpi': 216,
    'drawable-xxhdpi': 324,
    'drawable-xxxhdpi': 432,
}


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # 去掉多余元数据，降低 aapt2 兼容风险
    out = img.convert('RGBA')
    out.save(path, format='PNG', optimize=True)


def main() -> None:
    img = Image.open(SRC).convert('RGBA')
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))

    OUT.mkdir(parents=True, exist_ok=True)
    master = img.resize((1024, 1024), Image.Resampling.NEAREST)
    save_png(master, OUT / 'icon.png')
    save_png(master, OUT / 'icon-foreground.png')

    for folder, size in LAUNCHER_SIZES.items():
        icon = img.resize((size, size), Image.Resampling.NEAREST)
        d = RES / folder
        save_png(icon, d / 'ic_launcher.png')
        save_png(icon, d / 'ic_launcher_round.png')
        # 兼容旧引用：mipmap 前景也保留一份
        content = max(int(size * 2.25), size)
        fg = img.resize((content, content), Image.Resampling.NEAREST)
        canvas = Image.new('RGBA', (content, content), (0, 0, 0, 0))
        # 实际上直接用内容图即可
        save_png(fg, d / 'ic_launcher_foreground.png')

    for folder, size in FOREGROUND_SIZES.items():
        content = max(int(size * 0.72), 1)
        inner = img.resize((content, content), Image.Resampling.NEAREST)
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        offset = (size - content) // 2
        canvas.paste(inner, (offset, offset), inner)
        save_png(canvas, RES / folder / 'ic_launcher_foreground.png')

    # 删除会覆盖 PNG 的旧 vector 前景
    legacy_vector = RES / 'drawable-v24' / 'ic_launcher_foreground.xml'
    if legacy_vector.exists():
        legacy_vector.unlink()
        print('removed', legacy_vector)

    print('icons written')


if __name__ == '__main__':
    main()

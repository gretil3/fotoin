import io

from PIL import Image

from fotoin.load import load_image


def _jpeg_with_orientation(img: Image.Image, orientation: int) -> bytes:
    exif = Image.Exif()
    exif[0x0112] = orientation
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif, quality=95)
    return buf.getvalue()


def test_exif_rotation_applied():
    # 40x20, left half red. Orientation 6 = rotate 90deg clockwise for display,
    # so the result is 20x40 with the red half on top.
    img = Image.new("RGB", (40, 20), "blue")
    img.paste((255, 0, 0), (0, 0, 20, 20))
    out = load_image(_jpeg_with_orientation(img, 6))
    assert out.size == (20, 40)
    r, g, b = out.getpixel((10, 5))
    assert r > 200 and b < 60


def test_caps_longest_side_and_flattens_alpha():
    img = Image.new("RGBA", (3000, 1500), (0, 0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    out = load_image(buf.getvalue(), max_side=2048)
    assert out.mode == "RGB"
    assert out.size == (2048, 1024)
    assert out.getpixel((0, 0)) == (255, 255, 255)

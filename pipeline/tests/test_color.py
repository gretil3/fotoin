import numpy as np

from fotoin.color_correct import gray_world, white_point


def test_white_balance_does_not_tint_single_color_product():
    rgb = np.zeros((100, 100, 3), np.uint8)
    rgb[:] = (40, 120, 60)  # green bottle
    rgb[40:60, 20:80] = (240, 235, 230)  # white label
    out = gray_world(rgb, np.ones((100, 100), bool))
    r, g, b = out[50, 50].astype(int)
    assert abs(r - g) < 15 and abs(g - b) < 15  # label stays white, not pink
    assert abs(int(out[5, 5, 1]) - 120) < 10  # bottle stays green


def test_white_balance_skips_product_without_neutral_pixels():
    rgb = np.full((50, 50, 3), (195, 57, 43), np.uint8)  # solid red packaging
    assert np.array_equal(gray_world(rgb, np.ones((50, 50), bool)), rgb)


def test_white_balance_removes_warm_cast_from_neutral_product():
    rgb = np.full((50, 50, 3), (200, 185, 160), np.uint8)  # gray product under warm light
    r, g, b = gray_world(rgb, np.ones((50, 50), bool))[0, 0].astype(int)
    assert r - b < 20  # was 40


def test_white_point_brightens_dim_product_keeping_hue():
    rgb = np.full((50, 50, 3), (150, 120, 100), np.uint8)  # dim warm product
    rgb[:5] = (200, 200, 200)  # its brightest part
    out = white_point(rgb, np.ones((50, 50), bool)).astype(int)
    assert out[0, 0, 0] > 240  # bright end now near white
    r, g, b = out[30, 30]
    assert abs(r / b - 1.5) < 0.05  # same gain on every channel: hue kept


def test_white_point_never_darkens():
    rgb = np.full((20, 20, 3), 255, np.uint8)
    assert np.array_equal(white_point(rgb, np.ones((20, 20), bool)), rgb)

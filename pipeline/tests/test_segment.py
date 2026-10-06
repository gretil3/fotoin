import cv2
import numpy as np

from fotoin.segment import clean_alpha, decontaminate


def test_clean_alpha_removes_stray_pixels():
    alpha = np.zeros((200, 200), np.uint8)
    alpha[50:150, 50:150] = 255  # product
    alpha[5:8, 5:8] = 255  # speck (9px, far below 2% of product)
    alpha[190, 10:40] = 40  # faint noise line
    out = clean_alpha(alpha)

    assert out[100, 100] == 255
    assert out[:20, :20].max() == 0
    assert out[185:, :].max() == 0
    # Exactly one connected blob remains.
    n, _ = cv2.connectedComponents((out > 0).astype(np.uint8))
    assert n == 2
    # Nothing nonzero far outside the product box.
    outside = np.ones_like(out, bool)
    outside[40:160, 40:160] = False
    assert out[outside].max() == 0


def test_clean_alpha_keeps_similar_sized_parts():
    # Two-piece product (e.g. bottle + cap side by side) must keep both.
    alpha = np.zeros((100, 200), np.uint8)
    alpha[20:80, 10:90] = 255
    alpha[30:70, 120:160] = 255
    out = clean_alpha(alpha)
    assert out[50, 50] == 255 and out[50, 140] == 255


def test_empty_mask_stays_empty():
    assert clean_alpha(np.zeros((10, 10), np.uint8)).max() == 0


def test_decontaminate_removes_background_fringe():
    rgb = np.full((100, 100, 3), (150, 90, 40), np.uint8)  # brown wood
    rgb[30:70, 30:70] = (20, 20, 20)  # black product
    alpha = np.zeros((100, 100), np.uint8)
    alpha[28:72, 28:72] = 255  # mask 2px too generous: rim pixels are wood-colored
    out = decontaminate(rgb, alpha, px=2)
    assert out[28, 50].max() < 40  # rim now black, not brown
    assert tuple(out[50, 50]) == (20, 20, 20)  # interior untouched
    assert tuple(out[5, 5]) == (150, 90, 40)  # outside the mask untouched

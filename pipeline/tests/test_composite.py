import numpy as np
from PIL import Image

from fotoin.composite import composite


def _cut() -> Image.Image:
    img = Image.new("RGBA", (200, 400), (0, 0, 0, 0))
    img.paste((200, 30, 30, 255), (0, 0, 200, 400))  # red box, fills its bbox
    return img


def _render(**kw) -> np.ndarray:
    return np.asarray(composite(_cut(), (1000, 1000), **kw)).astype(int)


def test_contact_shadow_sits_under_the_base_only():
    out = _render(shadow=True)
    # Product spans y 100..899 (80% of 1000), centered at x 500.
    below = out[905, 500].sum()
    assert below < 3 * 235  # visibly darker right under the base
    assert out[50, 500].sum() == 3 * 255  # nothing above the product
    assert out[905, 50].sum() == 3 * 255  # nothing far to the side
    assert out[990, 500].sum() > 3 * 245  # fades out before the canvas edge


def test_no_shadow_means_pure_white_floor():
    assert _render(shadow=False)[905, 500].sum() == 3 * 255


def test_reflection_tints_floor_and_fades():
    out = _render(shadow=False, reflection=True)
    r, g, b = out[905, 500]
    assert r > g + 20  # red product mirrored just below the base
    assert out[999, 500].sum() > out[905, 500].sum()  # fainter further down


def test_flatlay_shadow_surrounds_product_without_floor_line():
    out = _render(style="flatlay", reflection=True)
    # Product spans x 300..699, y 100..899. Shadow hugs every side, strongest below.
    assert out[500, 290].sum() < 3 * 250  # left
    assert out[500, 709].sum() < 3 * 250  # right
    assert out[912, 500].sum() < out[500, 290].sum()  # below is darker than the side
    assert out[990, 500].sum() > 3 * 250  # no reflection, no long floor pool
    # Standing style draws nothing beside the product at mid-height.
    assert _render(style="standing")[500, 290].sum() == 3 * 255

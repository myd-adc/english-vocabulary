import pytest

from app.vocab import apply_sm2


@pytest.mark.parametrize("q", [0, 1, 2])
def test_failure_resets_and_lowers_ease(q):
    interval, ease, reps = apply_sm2(10, 2.5, 5, q)
    assert (interval, reps) == (1, 0)
    assert ease == pytest.approx(2.3)


def test_failure_ease_floor():
    assert apply_sm2(10, 1.3, 5, 0)[1] == 1.3


def test_interval_progression_1_6_15_38():
    i, e, r = 1, 2.5, 0
    seen = []
    for q in (4, 4, 4, 5):
        i, e, r = apply_sm2(i, e, r, q)
        seen.append(i)
    assert seen[:3] == [1, 6, 15]
    assert seen[3] == round(15 * 2.5)


def test_ease_changes_by_quality():
    assert apply_sm2(1, 2.5, 0, 5)[1] == pytest.approx(2.6)
    assert apply_sm2(1, 2.5, 0, 4)[1] == pytest.approx(2.5)
    assert apply_sm2(1, 2.5, 0, 3)[1] == pytest.approx(2.36)
    assert apply_sm2(1, 1.3, 0, 3)[1] == 1.3

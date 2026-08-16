"""Curve behavior documentation tests."""

from custom_components.vesaci_ramp_controller.engine import curve_value


def test_curve_endpoints():
    for curve in ("linear", "ease_in", "ease_out", "s_curve"):
        assert curve_value(0, curve) == 0
        assert curve_value(1, curve) == 1


def test_custom_curve_interpolation():
    points = [[0, 0], [0.5, 0.25], [1, 1]]
    assert curve_value(0.25, "custom", points) == 0.125
    assert curve_value(0.75, "custom", points) == 0.625

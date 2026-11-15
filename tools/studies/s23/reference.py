"""Write the S23 Earth framing and opening light-cue vectors. Distances in km."""

import json
import math
from pathlib import Path


# NASA NSSDC Mars Fact Sheet and JPL SSD Astrodynamic Parameters.
EARTH_RADIUS = 6371.0
EARTH_ORBIT = 149_598_000.0
MARS_ORBIT = 227_956_000.0
SUN_GM = 132_712_440_041.279419
EARTH_GM = 398_600.435507

# Authored values, shared with the beat sheet.
PERIGEE = 10_000.0
SELECTED_RANGE = 250_000.0
VERTICAL_FOV_DEG = 62.0
CAMERA_PITCH_RAD = -0.105
EARTH_AZIMUTH_DEG = 4.7
EARTH_ELEVATION_DEG = 2.0
PULSE_STARTS_MS = (2900, 4100, 4770, 5650, 6320)
PULSE_LENGTH_MS = 240


def daylight_fraction(distance, angular_radius, phase):
    """Integrate the day side over the perspective-projected disc, with parallel sunlight."""
    tangent = math.tan(angular_radius)
    samples = 16_384
    terms = []
    for index in range(samples):
        rho = (index + 0.5) / samples
        theta = math.atan(rho * tangent)
        sin_theta, cos_theta = math.sin(theta), math.cos(theta)
        hit = distance * cos_theta - math.sqrt(
            EARTH_RADIUS**2 - (distance * sin_theta) ** 2
        )
        # The observer is on +z. The Sun is in the x-z plane. At this radius,
        # daylight satisfies n dot sun > 0 for a known fraction of the azimuths.
        normal_z = distance - hit * cos_theta
        normal_xy = hit * sin_theta
        limit = -normal_z * math.cos(phase) / (normal_xy * math.sin(phase))
        lit_azimuth_fraction = math.acos(max(-1.0, min(1.0, limit))) / math.pi
        terms.append(2.0 * rho * lit_azimuth_fraction)
    return math.fsum(terms) / samples


def projected_height_fraction(angular_radius):
    """Vertical tangent bounds of Earth's apparent disc in the opening camera."""
    azimuth = math.radians(EARTH_AZIMUTH_DEG)
    elevation = math.radians(EARTH_ELEVATION_DEG)
    forward = math.cos(elevation) * math.cos(azimuth)
    up = math.sin(elevation)
    pitch = CAMERA_PITCH_RAD
    camera_depth = forward * math.cos(pitch) + up * math.sin(pitch)
    camera_up = up * math.cos(pitch) - forward * math.sin(pitch)
    # The bounding rays satisfy (camera_up - slope * camera_depth)^2
    # == sin(angular_radius)^2 * (1 + slope^2).
    s = math.sin(angular_radius)
    slope_span = (
        2 * s * math.sqrt(camera_up**2 + camera_depth**2 - s**2)
        / (camera_depth**2 - s**2)
    )
    return slope_span / (2 * math.tan(math.radians(VERTICAL_FOV_DEG / 2)))


def earth_views():
    transfer_a = (EARTH_ORBIT + MARS_ORBIT) / 2
    excess_speed = math.sqrt(SUN_GM * (2 / EARTH_ORBIT - 1 / transfer_a)) - math.sqrt(
        SUN_GM / EARTH_ORBIT
    )
    eccentricity = 1 + PERIGEE * excess_speed**2 / EARTH_GM
    semilatus_rectum = PERIGEE * (1 + eccentricity)
    anomaly_at_infinity = math.acos(-1 / eccentricity)
    specific_angular_momentum = math.sqrt(EARTH_GM * semilatus_rectum)
    views = []
    for distance in (50_000.0, 100_000.0, SELECTED_RANGE, 500_000.0, 750_000.0):
        inbound_anomaly_magnitude = math.acos((semilatus_rectum / distance - 1) / eccentricity)
        turn_from_asymptote = anomaly_at_infinity - inbound_anomaly_magnitude
        phase = math.pi / 2 - turn_from_asymptote
        angular_radius = math.asin(EARTH_RADIUS / distance)
        radial_speed = math.sqrt(
            excess_speed**2 + 2 * EARTH_GM / distance - (specific_angular_momentum / distance) ** 2
        )
        height_fraction = projected_height_fraction(angular_radius)
        views.append(
            {
                "rangeFromCentreKm": distance,
                "angularDiameterDeg": round(math.degrees(2 * angular_radius), 6),
                "phaseDeg": round(math.degrees(phase), 6),
                "daylightFraction": round(daylight_fraction(distance, angular_radius, phase), 6),
                "inboundRadialSpeedKmPerS": round(radial_speed, 6),
                "projectedDiameterPxAt720h": round(720 * height_fraction, 3),
                "projectedDiameterPxAt1080h": round(1080 * height_fraction, 3),
            }
        )
    return {
        "selectedRangeFromCentreKm": SELECTED_RANGE,
        "earthRadiusKm": EARTH_RADIUS,
        "perigeeFromCentreKm": PERIGEE,
        "earthArrivalExcessSpeedKmPerS": round(excess_speed, 6),
        "arrivalHyperbolaEccentricity": round(eccentricity, 9),
        "openingCameraPitchRad": CAMERA_PITCH_RAD,
        "verticalFovDeg": VERTICAL_FOV_DEG,
        "earthAzimuthDeg": EARTH_AZIMUTH_DEG,
        "earthElevationDeg": EARTH_ELEVATION_DEG,
        "views": views,
    }


def light_cues():
    # Count every cue intersecting a sliding 1 s window, conservatively
    # including partial pulses and both endpoints. The maximum changes only
    # when a window's end reaches a pulse start or its start leaves a pulse end.
    bounds = [(start, start + PULSE_LENGTH_MS) for start in PULSE_STARTS_MS]
    maximum = max(
        sum(start <= window_end and end >= window_end - 1000 for start, end in bounds)
        for window_end in PULSE_STARTS_MS
    )
    assert maximum == 2
    return {"openingPulseWindowsMs": bounds, "maximumPulseWindowsIntersectingOneSecond": maximum}


def main():
    result = {"earth": earth_views(), "lights": light_cues()}
    Path(__file__).with_name("vectors.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


if __name__ == "__main__":
    main()

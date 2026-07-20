#!/usr/bin/env python3
from pathlib import Path
import math

W, H = 1024, 512


def delta(angle, center):
    return math.atan2(math.sin(angle - center), math.cos(angle - center))


PANELS = (
    (math.radians(-48), math.radians(8), .42, .28, 13, 6),
    (math.radians(53), math.radians(12), .34, .24, 8.5, 6),
    (math.radians(4), math.radians(66), .72, .13, 17, 8),
    (math.radians(145), math.radians(15), .25, .32, 6.5, 6),
    (math.radians(-150), math.radians(20), .25, .30, 5.5, 6),
)


def to_rgbe(red, green, blue):
    peak = max(red, green, blue)
    if peak < 1e-32:
        return 0, 0, 0, 0
    mantissa, exponent = math.frexp(peak)
    scale = mantissa * 256.0 / peak
    return (
        min(255, int(red * scale)),
        min(255, int(green * scale)),
        min(255, int(blue * scale)),
        exponent + 128,
    )


def encode_channel(values):
    encoded = bytearray()
    index = 0
    length = len(values)
    while index < length:
        run = 1
        while index + run < length and run < 127 and values[index + run] == values[index]:
            run += 1
        if run >= 4:
            encoded.extend((128 + run, values[index]))
            index += run
            continue

        start = index
        index += run
        while index < length and index - start < 128:
            run = 1
            while index + run < length and run < 127 and values[index + run] == values[index]:
                run += 1
            if run >= 4:
                break
            if index - start + run > 128:
                index = start + 128
                break
            index += run
        count = index - start
        encoded.append(count)
        encoded.extend(values[start:index])
    return encoded


longitudes = [-math.pi + (2 * math.pi * x / W) for x in range(W)]
panel_horizontal = [
    [(abs(delta(longitude, panel[0])) / panel[2]) ** panel[5] for longitude in longitudes]
    for panel in PANELS
]
rear_horizontal = [(abs(delta(longitude, math.pi)) / .72) ** 6 for longitude in longitudes]

out = Path(__file__).resolve().parents[1] / 'public/hdr/automotive-studio.hdr'
out.parent.mkdir(parents=True, exist_ok=True)
with out.open('wb') as target:
    target.write(f'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {H} +X {W}\n'.encode('ascii'))
    for y in range(H):
        latitude = math.pi / 2 - math.pi * y / H
        horizon = math.exp(-((latitude / .52) ** 2)) * .078
        panel_vertical = [(abs(latitude - panel[1]) / panel[3]) ** panel[5] for panel in PANELS]
        floor_attenuation = 1 - min(1, max(0, (-latitude - .12) / .7)) * .55
        channels = [bytearray(W) for _ in range(4)]

        for x in range(W):
            value = .018 + horizon
            for panel_index, panel in enumerate(PANELS):
                distance = panel_horizontal[panel_index][x] + panel_vertical[panel_index]
                value += math.exp(-distance * 2.2) * panel[4]
            rear = math.exp(-(rear_horizontal[x] + ((latitude + .02) / .10) ** 6) * 2)
            value = (value + rear * 3) * floor_attenuation
            pixel = to_rgbe(value, value, value)
            for channel in range(4):
                channels[channel][x] = pixel[channel]

        target.write(bytes((2, 2, W >> 8, W & 255)))
        for channel in channels:
            target.write(encode_channel(channel))

print(out)

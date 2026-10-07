"""產生 plan-bar 的四個提示音（單聲道 16-bit WAV）。改音色後重跑：python3 sounds/make.py"""
import math
import struct
import wave
from pathlib import Path

RATE = 44100
HERE = Path(__file__).parent


def note(freq: float, ms: int, gain: float = 0.35) -> list[int]:
    count = int(RATE * ms / 1000)
    fade = int(RATE * 0.012)
    samples = []
    for i in range(count):
        envelope = min(1.0, i / fade, (count - i) / (fade * 4))
        wave_value = math.sin(2 * math.pi * freq * i / RATE) + 0.25 * math.sin(4 * math.pi * freq * i / RATE)
        samples.append(int(32767 * gain * envelope * wave_value / 1.25))
    return samples


def write(name: str, notes: list[tuple[float, int]]) -> None:
    samples = [sample for freq, ms in notes for sample in note(freq, ms)]
    with wave.open(str(HERE / name), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(struct.pack(f"<{len(samples)}h", *samples))


write("stage.wav", [(659.25, 90), (880.0, 140)])
write("done.wav", [(523.25, 90), (659.25, 90), (783.99, 90), (1046.5, 220)])
write("waiting.wav", [(587.33, 120), (587.33, 160)])
write("failed.wav", [(329.63, 140), (246.94, 240)])

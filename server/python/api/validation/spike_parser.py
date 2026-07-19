import sys
import json
import os

# Security limits — exceeding these causes a hard crash (non-zero exit),
# which the worker treats as an ISOLATION_SANDBOX_ERROR → quarantine.
MAX_INPUT_BYTES = 5 * 1024 * 1024  # 5 MB hard limit
MAX_LINE_LENGTH = 65536            # 64 KB per line
MAX_POINTS = 200_000

# Adversarial content signatures (magic bytes) — reject by crashing.
ADVERSARIAL_MAGIC = [
    b"\x1f\x8b",   # gzip
    b"\x50\x4b\x03\x04",  # zip
    b"\x3c\x3f\x78\x6d\x6c",  # <?xml (XXE / billion-laughs)
]


def parse_ascii_data(input_path: str):
    # --- Security gate 1: file size ---
    try:
        file_size = os.path.getsize(input_path)
    except OSError as e:
        sys.stderr.write(f"READ_ERROR: cannot stat file: {e}\n")
        sys.exit(2)

    if file_size > MAX_INPUT_BYTES:
        sys.stderr.write(
            f"SANDBOX_VIOLATION: input size {file_size} exceeds limit {MAX_INPUT_BYTES}\n"
        )
        sys.exit(2)

    # --- Security gate 2: adversarial magic bytes (binary/archive/XML) ---
    try:
        with open(input_path, "rb") as fb:
            head = fb.read(8)
    except Exception as e:
        sys.stderr.write(f"READ_ERROR: cannot read file head: {e}\n")
        sys.exit(2)

    for magic in ADVERSARIAL_MAGIC:
        if head.startswith(magic):
            sys.stderr.write(
                "SANDBOX_VIOLATION: adversarial/binary content detected (magic bytes)\n"
            )
            sys.exit(2)

    # --- Security gate 3: null byte presence (binary) ---
    try:
        with open(input_path, "rb") as fb:
            chunk = fb.read(4096)
            if b"\x00" in chunk:
                sys.stderr.write(
                    "SANDBOX_VIOLATION: null byte detected (binary content)\n"
                )
                sys.exit(2)
    except Exception as e:
        sys.stderr.write(f"READ_ERROR: cannot scan file: {e}\n")
        sys.exit(2)

    points = []
    try:
        with open(input_path, "r", encoding="utf-8") as f:
            for line_idx, line in enumerate(f):
                if len(line) > MAX_LINE_LENGTH:
                    sys.stderr.write(
                        f"SANDBOX_VIOLATION: line {line_idx + 1} exceeds max length {MAX_LINE_LENGTH}\n"
                    )
                    sys.exit(2)

                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                # Split by space, tab, or comma
                parts = [p for p in line.replace(",", " ").split() if p]
                if len(parts) != 2:
                    return {
                        "status": "invalid",
                        "error_code": "MALFORMED_ASCII_LINE",
                        "detail": f"Line {line_idx + 1} does not contain exactly two numeric values: '{line}'"
                    }
                try:
                    x = float(parts[0])
                    y = float(parts[1])
                except ValueError:
                    return {
                        "status": "invalid",
                        "error_code": "NON_NUMERIC_VALUE",
                        "detail": f"Line {line_idx + 1} contains non-numeric values: '{line}'"
                    }
                points.append((x, y))

                if len(points) > MAX_POINTS:
                    sys.stderr.write(
                        f"SANDBOX_VIOLATION: point count exceeds limit {MAX_POINTS}\n"
                    )
                    sys.exit(2)
    except UnicodeDecodeError as ude:
        return {
            "status": "invalid",
            "error_code": "DECODE_ERROR",
            "detail": f"Failed to decode file as UTF-8: {ude}"
        }
    except MemoryError:
        sys.stderr.write("SANDBOX_VIOLATION: memory exhausted (OOM)\n")
        sys.exit(3)
    except Exception as e:
        return {
            "status": "invalid",
            "error_code": "READ_ERROR",
            "detail": f"Error reading file: {e}"
        }

    if not points:
        return {
            "status": "invalid",
            "error_code": "EMPTY_DATASET",
            "detail": "No valid data points found in file"
        }

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    
    return {
        "status": "valid",
        "point_count": len(points),
        "min_x": min(xs),
        "max_x": max(xs),
        "min_y": min(ys),
        "max_y": max(ys),
    }

def main():
    if len(sys.argv) < 4:
        print("Usage: spike_parser.py <profile> <input_path> <output_path>", file=sys.stderr)
        sys.exit(1)

    profile = sys.argv[1]
    input_path = sys.argv[2]
    output_path = sys.argv[3]

    result = parse_ascii_data(input_path)
    
    # Ensure parent dir exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    # Exit cleanly
    sys.exit(0)

if __name__ == "__main__":
    main()
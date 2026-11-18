"""Roboflow hosted workflow adapter. Credentials are read only from the environment."""
import base64
import io
import json
import os
import sys

WORKSPACE = "angad-jj7vu"
WORKFLOW = "general-segmentation-api"


class WorkflowOutputError(ValueError):
    pass


def _records(value):
    """Walk an SDK result without relying on a fixed workflow-output wrapper."""
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in {"predictions", "detections", "instances"} and isinstance(item, list):
                yield item
            yield from _records(item)
    elif isinstance(value, list):
        for item in value:
            yield from _records(item)


def _number(value):
    try:
        n = float(value)
        return n if n == n and abs(n) != float("inf") else None
    except (TypeError, ValueError):
        return None


def _class_name(item):
    for key in ("class", "class_name", "className", "label", "name"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _box(item):
    # Convert common center-size or corner formats to x1/y1/x2/y2. Polygon-only
    # segmentations use their vertex bounds while retaining class/confidence.
    for keys in (("x1", "y1", "x2", "y2"), ("left", "top", "right", "bottom")):
        values = [_number(item.get(k)) for k in keys]
        if all(v is not None for v in values):
            return values
    x, y = _number(item.get("x")), _number(item.get("y"))
    w = _number(item.get("width", item.get("w")))
    h = _number(item.get("height", item.get("h")))
    if None not in (x, y, w, h):
        return [x - w / 2, y - h / 2, x + w / 2, y + h / 2]
    points = item.get("points", item.get("polygon"))
    if isinstance(points, list):
        coords = []
        for point in points:
            if isinstance(point, dict):
                px, py = _number(point.get("x")), _number(point.get("y"))
            elif isinstance(point, (list, tuple)) and len(point) >= 2:
                px, py = _number(point[0]), _number(point[1])
            else:
                continue
            if px is not None and py is not None:
                coords.append((px, py))
        if coords:
            xs, ys = zip(*coords)
            return [min(xs), min(ys), max(xs), max(ys)]
    return None


def parse_workflow_result(result, image_width, image_height):
    candidates = list(_records(result))
    if not candidates:
        raise WorkflowOutputError("Workflow response has no predictions, detections, or instances output.")
    # Prefer the prediction array with the largest number of usable product
    # records. Empty arrays remain valid only when the workflow explicitly
    # returned a recognized prediction field.
    chosen = max(candidates, key=lambda rows: sum(bool(isinstance(row, dict) and _class_name(row) and _box(row)) for row in rows))
    detections = []
    for item in chosen:
        if not isinstance(item, dict):
            continue
        label, bounds = _class_name(item), _box(item)
        confidence = _number(item.get("confidence", item.get("score")))
        if not label or not bounds or confidence is None:
            continue
        x1, y1, x2, y2 = bounds
        # Accommodate normalized coordinates as well as pixel coordinates.
        if max(abs(x1), abs(y1), abs(x2), abs(y2)) <= 1.5:
            x1, x2 = x1 * image_width, x2 * image_width
            y1, y2 = y1 * image_height, y2 * image_height
        if x2 <= x1 or y2 <= y1:
            continue
        detections.append({"class": label, "confidence": max(0, min(1, confidence)), "x1": x1, "y1": y1, "x2": x2, "y2": y2})
    if not detections and len(chosen) > 0:
        raise WorkflowOutputError("Workflow returned prediction entries, but no entries contained a supported class, confidence, and bounding box.")
    counts = {}
    for detection in detections:
        key = detection["class"]
        counts[key] = counts.get(key, 0) + 1
    return {"count": len(detections), "width": image_width, "height": image_height, "detections": detections, "classes": [{"name": name, "count": count} for name, count in sorted(counts.items())]}


def main():
    api_key = os.getenv("ROBOFLOW_API_KEY")
    if not api_key:
        raise RuntimeError("ROBOFLOW_API_KEY is not configured on the server.")
    payload = json.load(sys.stdin)
    image_data = payload.get("image", "")
    if "," not in image_data:
        raise ValueError("Uploaded image data is invalid.")
    image_bytes = base64.b64decode(image_data.split(",", 1)[1], validate=True)
    from PIL import Image
    with Image.open(io.BytesIO(image_bytes)) as image:
        image.verify()
    with Image.open(io.BytesIO(image_bytes)) as image:
        width, height = image.size
        image_format = image.format
    suffix = ".png" if image_format == "PNG" else ".jpg"
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(image_bytes)
        image_path = f.name
    try:
        from inference_sdk import InferenceHTTPClient, InferenceConfiguration
        client = InferenceHTTPClient(api_url="https://serverless.roboflow.com", api_key=api_key).configure(
            InferenceConfiguration(api_key_transport="header")
        )
        raw = client.run_workflow(
            workspace_name=WORKSPACE,
            workflow_id=WORKFLOW,
            images={"image": image_path},
            parameters={"classes": "coke, pepsi, sprite, coca cola, mountain dew"},
            use_cache=True,
        )
        print(json.dumps(parse_workflow_result(raw, width, height)))
    finally:
        os.unlink(image_path)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc), "type": type(exc).__name__}), file=sys.stderr)
        sys.exit(1)

"""The local detection sidecar.

A small HTTP server on loopback that the trainer calls when a labeller asks for
help. It is a separate process rather than part of the trainer for one practical
reason: YOLO11 is Python and the trainer is TypeScript, and the alternatives —
shelling out per image, or a Node ONNX runtime — are worse than a socket.

It is optional. The trainer works completely without it; every assist button
degrades to a disabled control with a sentence explaining what to start. A
labelling tool that cannot label because an accelerator is down has its dependency
the wrong way round.

Loopback only, and not configurable to be otherwise. The images crossing this
socket are unredacted jobsite photographs on their way to being redacted — the one
moment in the whole system where such bytes are in flight. They travel between two
processes on one machine, and that is the entire intended blast radius.

Run it:

    cd services/prelabel && uv run prelabel-server
"""

from __future__ import annotations

import base64
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .detect import (
    DEFAULT_WEIGHTS,
    PERSON_CLASSES,
    DetectionResult,
    ModelUnavailable,
    detect,
    model_identity,
)
from .segment import DEFAULT_SEG_WEIGHTS, segment, segmentation_available

__all__ = ["main", "serve"]

HOST = "127.0.0.1"
PORT = 4181

#: 24 MB of base64, mirroring the trainer's own body ceiling. A request larger than
#: this is a mistake, and refusing it with a sentence beats failing on the socket.
MAX_BODY_BYTES = 24 * 1024 * 1024


class _Handler(BaseHTTPRequestHandler):
    # BaseHTTPRequestHandler logs every request to stderr by default. This process
    # sits behind a labelling session; the log is noise, and the interesting events
    # are already reported in the responses.
    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        pass

    def handle_one_request(self) -> None:
        """Swallow the client hanging up mid-response.

        A labeller who navigates away while a predict is running aborts the socket,
        and the stdlib's default is to print a full traceback for it. That is not an
        error anyone can act on, and a session's worth of them buries the messages
        that are.
        """
        try:
            super().handle_one_request()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            self.close_connection = True

    def _send(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - the stdlib's naming, not ours
        if self.path == "/healthz":
            try:
                identity = model_identity(self.server.weights)  # type: ignore[attr-defined]
            except ModelUnavailable as exc:
                # A degraded health check rather than a failed one: the process is
                # up and can say precisely why it cannot help yet, which is more
                # useful to whoever is reading it than a connection refused.
                self._send(503, {"status": "no-model", "error": str(exc)})
                return
            self._send(
                200,
                {
                    "status": "ok",
                    **identity,
                    # Reported separately: the detector can be ready while SAM is
                    # still downloading, and the trainer disables one control
                    # rather than both.
                    "segmentation": {
                        "available": segmentation_available(),
                        "weights": DEFAULT_SEG_WEIGHTS,
                    },
                },
            )
            return

        self._send(404, {"error": "Not found."})

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in ("/detect", "/segment"):
            self._send(404, {"error": "Not found."})
            return

        length = int(self.headers.get("content-length") or 0)
        if length > MAX_BODY_BYTES:
            self._send(413, {"error": "That image is too large."})
            return

        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send(400, {"error": "Body was not JSON."})
            return

        raw = payload.get("image", "")
        if not isinstance(raw, str) or not raw:
            self._send(400, {"error": "No image supplied."})
            return

        try:
            image_bytes = base64.b64decode(raw.split(",", 1)[-1], validate=False)
        except (ValueError, TypeError):
            self._send(400, {"error": "Image did not decode."})
            return

        if self.path == "/segment":
            # Stage two: YOLO11-seg outlines what stage one found. Geometry only —
            # the trainer attaches meaning afterwards.
            boxes = payload.get("boxes")
            points = payload.get("points")
            try:
                outcome = segment(
                    image_bytes,
                    boxes=boxes if isinstance(boxes, list) else None,
                    points=points if isinstance(points, list) else None,
                )
            except ModelUnavailable as exc:
                self._send(503, {"error": str(exc)})
                return
            except ValueError as exc:
                self._send(400, {"error": str(exc)})
                return

            self._send(200, outcome.as_dict())
            return

        # "people" is the question intake asks; anything else is the open question
        # the region assist asks, which a stock model will decline to answer.
        want = PERSON_CLASSES if payload.get("want") == "people" else None
        confidence = payload.get("confidence", 0.25)
        if not isinstance(confidence, (int, float)):
            confidence = 0.25

        try:
            result: DetectionResult = detect(
                image_bytes,
                weights=self.server.weights,  # type: ignore[attr-defined]
                want=want,
                confidence=float(confidence),
            )
        except ModelUnavailable as exc:
            self._send(503, {"error": str(exc)})
            return
        except ValueError as exc:
            self._send(400, {"error": str(exc)})
            return

        self._send(200, result.as_dict())


class _Server(ThreadingHTTPServer):
    """Carries the chosen weights so the handler does not reach for a global.

    Threaded rather than the stdlib default of one request at a time: a plain
    `HTTPServer` handles requests serially, so a single slow or stuck `/detect`
    call — a cold model load, a labeller who navigated away mid-predict — blocks
    every other request behind it, including `/healthz`, until it clears. That
    turned "the detector didn't respond" into "the detector looks completely
    down" more than once. `_INFERENCE_LOCK` in detect.py already serializes the
    one thing that actually needs it — concurrent calls into the same model —
    so threading the server just lets everything else (health checks, a second
    labeller's request) keep answering while one predict is in flight.
    """

    def __init__(self, address: tuple[str, int], weights: str) -> None:
        super().__init__(address, _Handler)
        self.weights = weights


def serve(weights: str = DEFAULT_WEIGHTS, port: int = PORT) -> None:
    server = _Server((HOST, port), weights)
    sys.stdout.write(
        f"SiteWireAi prelabel  http://{HOST}:{port}\n"
        f"  weights: {weights}\n"
        "  local only · proposes labels a human corrects · never ground truth\n"
    )
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


def main() -> None:
    weights = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_WEIGHTS
    serve(weights)


if __name__ == "__main__":
    main()

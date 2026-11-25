"""Summarize the lab's gzip JSON. Usage: python tools/summarize_portal_performance.py RESULTS_DIR."""
from collections import Counter
from gzip import open as gzip_open
from pathlib import Path
from statistics import median, quantiles
import json
import sys


def read(path):
    with gzip_open(path, "rt", encoding="utf-8") as stream:
        return json.load(stream)


def catalog_resources(sample):
    return [entry for entry in sample["resources"] if "/catalog/" in entry["name"]]


def frame_metrics(frames):
    percentiles = quantiles(frames, n=100, method="inclusive") if len(frames) >= 2 else None
    longest = streak = 0
    for duration in frames:
        streak = streak + 1 if duration > 33.4 else 0
        longest = max(longest, streak)
    return {
        "frameP95Ms": percentiles[94] if percentiles else None,
        "frameP99Ms": percentiles[98] if percentiles else None,
        "frameOver16Ms": sum(duration > 16.7 for duration in frames),
        "frameOver33ms": sum(duration > 33.4 for duration in frames),
        "frameConsecutiveOver33ms": longest,
    }


def navigation_metrics(sample):
    catalog = catalog_resources(sample)
    catalog_counts = Counter(entry["name"] for entry in catalog)
    frames = [frame["duration"] for frame in sample["frames"] if frame["time"] <= 1500]
    return {
        "readyMs": sample["ready"],
        "pageAnimationStartMs": next((m["startTime"] for m in sample.get("marks", [])
                                      if m["name"] == "lab:page-animation-start"), None),
        "transitionReadyMs": next((m["startTime"] for m in sample.get("marks", [])
                                   if m["name"] == "lab:transition-ready"), None),
        "peakDrawingLayers": sample.get("peakLayers") or None,
        "lcpMs": sample["lcp"][-1]["startTime"] if sample["lcp"] else None,
        # The isolated lab navigation has one short observation window.
        "layoutShiftSum": sum(entry["value"] for entry in sample["shifts"] if not entry["hadRecentInput"]),
        **frame_metrics(frames),
        "longTasks": len(sample["longTasks"]),
        "longTaskMs": sum(entry["duration"] for entry in sample["longTasks"]),
        "heapUsedBytes": sample["heap"]["usedSize"],
        "resourceRequests": len(sample["resources"]),
        "resourceWireBytes": sum(entry["transferSize"] for entry in sample["resources"]),
        "catalogRequests": len(catalog),
        "catalogDuplicateRequests": sum(count - 1 for count in catalog_counts.values()),
        "catalogCacheHits": sum(entry["transferSize"] == 0 and entry["decodedBodySize"] > 0 for entry in catalog),
        "catalogDecodedBytes": sum(entry["decodedBodySize"] for entry in catalog),
        "catalogWireBytes": sum(entry["transferSize"] for entry in catalog),
    }


def interaction_metrics(sample):
    search = [entry["duration"] for entry in sample["search"]]
    click = next(entry for entry in sample["interactions"] if entry.get("name") == "click" and entry["trusted"])
    click_events = [entry for entry in sample["events"] if entry["name"] == "click"]
    window = [frame["duration"] for frame in sample["frames"] if click["start"] <= frame["time"] <= click["start"] + 350]
    return {
        "searchMedianMs": median(search),
        "searchMaxMs": max(search),
        "clickSyncMs": click["duration"],
        "clickEventTimingMs": click_events[-1]["duration"] if click_events else None,
        "clickFrameMaxMs": max(window, default=None),
        **frame_metrics(window),
        "heapUsedBytes": sample["heap"]["usedSize"],
    }


def summarize_runs(payload):
    result = {"trials":payload["trials"], "chromium":payload["chromium"], "viewport":payload.get("viewport"),
              "theme":payload.get("theme"), "variants":{}}
    for variant in payload["variants"]:
        variant_result = result["variants"].setdefault(variant["name"], {})
        for motion in ("no-preference", "reduce"):
            by_label = {}
            for run in variant["runs"]:
                if run["motion"] != motion:
                    continue
                for sample in run["samples"]:
                    metrics = interaction_metrics if sample["label"] == "interactions" else navigation_metrics
                    by_label.setdefault(sample["label"], []).append(metrics(sample))
            variant_result[motion] = {}
            for label, rows in by_label.items():
                summary = {}
                for key in rows[0]:
                    values = [row[key] for row in rows if row[key] is not None]
                    summary[key] = {
                        "median": round(median(values), 3), "min": round(min(values), 3),
                        "max": round(max(values), 3), "n":len(values)
                    } if values else None
                variant_result[motion][label] = summary
    return result


TRACE_EVENTS = {
    "RunTask":"mainThreadTaskMs", "EvaluateScript":"scriptEvaluationMs",
    "EventDispatch":"eventDispatchMs", "UpdateLayoutTree":"styleMs", "Layout":"layoutMs",
    "Paint":"paintMs", "RasterTask":"rasterWorkerMs", "Commit":"compositorCommitMs",
    "ImageDecodeTask":"imageDecodeWorkerMs", "Decode Image":"imageDecodeMainMs",
}


def trace_window(events, marker, start, end):
    elapsed = Counter()
    for event in events:
        if event.get("pid") != marker["pid"] or event.get("ph") != "X":
            continue
        name = event["name"]
        if name.startswith("lab:json:"):
            field = "diagnosticJsonParseMs"
        else:
            field = TRACE_EVENTS.get(name)
        if field is None:
            continue
        if event.get("tid") != marker["tid"] and field not in ("rasterWorkerMs", "imageDecodeWorkerMs"):
            continue
        left = max(start, event["ts"])
        right = min(end, event["ts"] + event.get("dur", 0))
        if right > left:
            elapsed[field] += (right - left) / 1000
            if name == "Layout" and event.get("args", {}).get("beginData", {}).get("stackTrace"):
                elapsed["layoutWithJSStackMs"] += (right - left) / 1000
    fields = (*TRACE_EVENTS.values(), "diagnosticJsonParseMs", "layoutWithJSStackMs")
    # DroppedFrame is a compositor event. Its process can differ from the renderer's.
    dropped = sum(
        event["name"] == "DroppedFrame" and start <= event["ts"] <= end
        for event in events
    )
    return {**{key:round(elapsed[key], 3) for key in fields}, "traceDroppedFrameEvents": dropped}


def summarize_trace(payload):
    events = payload["traceEvents"]
    parse_starts = {}
    parse_slices = []
    for event in events:
        if not event["name"].startswith("lab:json:") or event["ph"] not in {"b", "e"}:
            continue
        key = (event["pid"], event["tid"], event["name"], event["id2"]["local"])
        if event["ph"] == "b":
            parse_starts[key] = event
        elif key in parse_starts:
            start = parse_starts.pop(key)
            parse_slices.append({**start, "ph":"X", "dur":event["ts"] - start["ts"]})
    events = events + parse_slices
    result = {}
    for mark in events:
        name = mark["name"]
        if name.startswith("lab:ready:"):
            start = max((entry["ts"] for entry in events if entry["name"] == "navigationStart"
                         and entry["pid"] == mark["pid"] and entry["tid"] == mark["tid"]
                         and entry["ts"] <= mark["ts"]), default=None)
            if start is not None:
                result[name.removeprefix("lab:ready:")] = trace_window(events, mark, start, mark["ts"] + 1_000_000)
        if name == "lab:click:start":
            end = next(entry["ts"] for entry in events if entry["name"] == "lab:click:end"
                       and entry["pid"] == mark["pid"] and entry["ts"] >= mark["ts"])
            result["clickHandler"] = trace_window(events, mark, mark["ts"], end)
            result["clickAndPresentation"] = trace_window(events, mark, mark["ts"], end + 350_000)
    return result


def main(directory):
    result = {"runs":{}, "traces":{}}
    for path in sorted(directory.glob("*-runs.json.gz")):
        result["runs"][path.name.split("-")[0]] = summarize_runs(read(path))
    for path in sorted(directory.glob("*.trace.json.gz")):
        result["traces"][path.name.removesuffix(".trace.json.gz")] = summarize_trace(read(path))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]))

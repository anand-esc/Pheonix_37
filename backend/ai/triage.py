import io
import torch
from functools import lru_cache
from PIL import Image
from ultralytics import YOLO

from backend.core.evidence_model import DetectionResult


# COCO Class IDs for common triage targets
# 0: person, 1: bicycle, 2: car, 3: motorcycle, 5: bus, 7: truck
TRIAGE_CLASS_IDS = [0, 1, 2, 3, 5, 7]


def _get_optimal_accelerator() -> str:
    """Dynamically determines the best hardware accelerator available."""
    if torch.cuda.is_available():
        return "cuda"
    elif torch.backends.mps.is_available():
        return "mps"
    return "cpu"

# Cache the hardware choice so we don't query the driver repeatedly
ACCELERATOR = _get_optimal_accelerator()


@lru_cache(maxsize=1)
def get_triage_model(model_name: str = "yolov8n.pt") -> YOLO:
    """
    Loads the YOLOv8-nano model as a Singleton.
    
    The @lru_cache ensures the heavy weights (tens of megabytes) are loaded 
    into VRAM/RAM exactly once across the entire application lifecycle, 
    preventing massive memory leaks on repeated frame analysis.
    """
    return YOLO(model_name)


def analyze_frame(
    image_bytes: bytes,
    confidence_threshold: float = 0.4,
    fragment_id: str | None = None
) -> list[DetectionResult]:
    """
    Analyzes a single video frame for objects, restricted to broad triage categories.
    STRICTLY PROHIBITED from performing facial recognition or identity claims.
    """
    # Instantly fetches the cached model in memory (O(1) time, zero reloading)
    model = get_triage_model()
    
    image = Image.open(io.BytesIO(image_bytes))
    
    # Run inference restricted to triage classes and forced onto the fastest hardware
    results = model.predict(
        source=image,
        conf=confidence_threshold,
        classes=TRIAGE_CLASS_IDS,
        device=ACCELERATOR,
        imgsz=640, # Standardized compute resolution for maximum speed
        verbose=False
    )
    
    detections = []
    for result in results:
        boxes = result.boxes
        for box in boxes:
            cls_id = int(box.cls[0].item())
            confidence = round(float(box.conf[0].item()), 3)
            coords = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
            
            detections.append(
                DetectionResult(
                    bounding_box=[round(c, 2) for c in coords],
                    object_class=result.names[cls_id],
                    confidence_score=confidence,
                    fragment_id=fragment_id
                )
            )
            
    return detections

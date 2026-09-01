import io
from typing import Any
from PIL import Image
from ultralytics import YOLO


# COCO Class IDs for common triage targets
# 0: person, 1: bicycle, 2: car, 3: motorcycle, 5: bus, 7: truck
TRIAGE_CLASS_IDS = [0, 1, 2, 3, 5, 7]


def load_triage_model(model_name: str = "yolov8n.pt") -> YOLO:
    """
    Loads the YOLOv8-nano model for AI triage.
    Downloads the weights automatically if not present.
    
    Args:
        model_name: The Ultralytics model identifier.
        
    Returns:
        The instantiated YOLO model.
    """
    return YOLO(model_name)


def analyze_frame(
    model: YOLO,
    image_bytes: bytes,
    confidence_threshold: float = 0.4
) -> list[dict[str, Any]]:
    """
    Analyzes a single video frame for objects, restricted to broad triage categories.
    STRICTLY PROHIBITED from performing facial recognition or identity claims.
    
    Args:
        model: The loaded YOLO model.
        image_bytes: The raw JPEG/PNG byte stream of the extracted frame.
        confidence_threshold: Minimum confidence to retain a detection.
        
    Returns:
        A list of detection dictionaries containing bounding boxes, labels, and confidences.
    """
    image = Image.open(io.BytesIO(image_bytes))
    
    # Run inference restricted to triage classes to save compute and enforce policy
    results = model.predict(
        source=image,
        conf=confidence_threshold,
        classes=TRIAGE_CLASS_IDS,
        verbose=False
    )
    
    detections = []
    for result in results:
        boxes = result.boxes
        for box in boxes:
            cls_id = int(box.cls[0].item())
            confidence = round(float(box.conf[0].item()), 3)
            coords = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
            
            detections.append({
                "label": result.names[cls_id],
                "confidence": confidence,
                "bounding_box": [round(c, 2) for c in coords]
            })
            
    return detections

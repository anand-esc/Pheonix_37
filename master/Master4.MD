# Master4: Roadmap, AI Integration, & Limitations

This document serves as the high-level summary of the system's current limitations and the intended roadmap for future development.

## 1. AI Triage Module (`ai/triage.py`)
- **Current State**: Implements a YOLOv8-nano model for fast bounding-box detection of persons, vehicles, and generalized objects.
- **Strict Guardrails**: The system intentionally does *not* include facial recognition or biometric matching. Claims of identity must remain the purview of human investigators; the AI is solely for *triage* (e.g., "Find all fragments containing a white car between 14:00 and 15:00").
- **Roadmap**: Upgrade triage capabilities to allow natural language querying ("show me clips with a person carrying a bag") using lightweight vision-language models, while maintaining strict no-identification policies.

## 2. Vendor Adapter Expansion
- **Validated**: Dahua (`DHFS/DHAV`) parser is fully operational.
- **Stubs / Prototyping**: Hikvision (`WFS`) currently exists as a stub. All Hikvision files fall back to the Generic NAL Carver.
- **Roadmap**: 
  - Complete the native Hikvision WFS filesystem parser.
  - Reverse-engineer and implement native adapters for CP Plus, Honeywell, and Matrix.

## 3. Hardware / Acquisition Rig
- **Current State**: The system relies on software-level binary extraction.
- **Roadmap**: Integrate with a physical write-blocker hardware rig to automate the initial disk cloning phase directly into the `evidence.img` pipeline step.

## 4. Scalability & Deployment
- **Current Architecture**: Monolithic FastAPI backend with a local `case_store/` filesystem.
- **Roadmap**: Shift to a distributed microservice architecture where carving tasks (which are highly parallelizable) can be dispatched to worker queues (e.g., Celery/Redis). This will drastically reduce processing time for multi-terabyte NVR drives.

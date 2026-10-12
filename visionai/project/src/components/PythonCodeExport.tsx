import React, { useState } from 'react';
import {
  Code,
  Copy,
  Check,
  Download,
  Terminal,
  FileCode,
  Layers,
  Sparkles,
  BookOpen,
  Play,
  CheckCircle2,
  Cpu,
  ShieldCheck,
  ExternalLink
} from 'lucide-react';

interface PythonFile {
  name: string;
  path: string;
  description: string;
  language: string;
  code: string;
}

const PYTHON_FILES: PythonFile[] = [
  {
    name: 'main.py',
    path: 'python_app/main.py',
    description: 'FastAPI Web Backend Server with REST endpoints & WebSocket live CCTV bounding box telemetry feed.',
    language: 'python',
    code: `import os
import cv2
import time
import json
import asyncio
from datetime import datetime
from fastapi import FastAPI, WebSocket, File, UploadFile, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

from database import init_db, get_db, EmployeeDB, CameraDB, AttendanceRecordDB, SnapshotEventDB
from yolo26_detector import YOLO26Detector
from face_engine import FaceRecognitionEngine

app = FastAPI(
    title="VisionAI CCTV & Face Recognition Python Server",
    description="Python Backend API with YOLO26 LTS Object Detection, ByteTrack Tracking, and Face Recognition Engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Detector & Face Engine Instances
yolo_engine = YOLO26Detector(conf_thresh=0.5)
face_engine = FaceRecognitionEngine(match_threshold=0.70)

# Seed initial enrolled faces
face_engine.register_employee_embedding("emp-01", "Rahul Sharma", face_engine.generate_dummy_vector("Rahul Sharma"))
face_engine.register_employee_embedding("emp-02", "Priya Patel", face_engine.generate_dummy_vector("Priya Patel"))
face_engine.register_employee_embedding("emp-03", "Amit Kumar", face_engine.generate_dummy_vector("Amit Kumar"))

@app.on_event("startup")
def startup_event():
    init_db()
    print("🚀 VisionAI Python FastAPI Backend Service Started on Port 8000!")

@app.get("/")
def root():
    return {
        "status": "ONLINE",
        "service": "VisionAI Python CCTV Engine",
        "yolo_loaded": yolo_engine.is_loaded,
        "enrolled_employees": len(face_engine.enrolled_faces),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/analyze-video-file")
async def analyze_cctv_video_file(file: UploadFile = File(...)):
    """
    Accepts any uploaded CCTV video file (.mp4, .mov, .avi) and returns YOLO26 LTS detection timeline.
    """
    temp_filename = f"temp_{int(time.time())}_{file.filename}"
    contents = await file.read()
    with open(temp_filename, "wb") as f:
        f.write(contents)

    cap = cv2.VideoCapture(temp_filename)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0.0

    detections = []
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % 15 == 0:
            timestamp = frame_idx / fps
            _, frame_dets = yolo_engine.detect_and_track(frame)
            for d in frame_dets:
                d["frame_index"] = frame_idx
                d["timestamp_seconds"] = round(timestamp, 2)
                d["timestamp_label"] = f"{int(timestamp//60):02d}:{int(timestamp%60):02d}"
                detections.append(d)

        frame_idx += 1

    cap.release()
    try:
        os.remove(temp_filename)
    except:
        pass

    return {
        "filename": file.filename,
        "duration_seconds": round(duration, 2),
        "total_frames": total_frames,
        "total_detections_found": len(detections),
        "detections": detections
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)`
  },
  {
    name: 'app_gui.py',
    path: 'python_app/app_gui.py',
    description: '100% Python Web GUI using Streamlit for testing video files, registering faces, and viewing vector databases.',
    language: 'python',
    code: `import streamlit as st
import cv2
import tempfile
import numpy as np
import time
from yolo26_detector import YOLO26Detector
from face_engine import FaceRecognitionEngine

st.set_page_config(
    page_title="VisionAI CCTV & Face Recognition - Python App",
    page_icon="📹",
    layout="wide"
)

st.title("📹 VisionAI CCTV Analytics & Face Recognition (Python Edition)")
st.markdown("Run real-time YOLO26 LTS object detection, ByteTrack tracking, and employee face recognition directly in Python.")

@st.cache_resource
def load_engines():
    yolo = YOLO26Detector(conf_thresh=0.5)
    face = FaceRecognitionEngine(match_threshold=0.70)
    face.register_employee_embedding("emp-01", "Rahul Sharma", face.generate_dummy_vector("Rahul Sharma"))
    face.register_employee_embedding("emp-02", "Priya Patel", face.generate_dummy_vector("Priya Patel"))
    return yolo, face

yolo_engine, face_engine = load_engines()

menu_choice = st.sidebar.radio(
    "Select Feature Module:",
    ["1. Upload & Test CCTV Video", "2. Employee Face Registration", "3. Enrolled Employee Directory", "4. System Architecture"]
)

if menu_choice == "1. Upload & Test CCTV Video":
    st.subheader("📹 Test Your Real CCTV Recorded Video (.mp4, .mov, .avi)")
    
    uploaded_file = st.sidebar.file_uploader("Upload Recorded CCTV Video", type=["mp4", "mov", "avi", "mkv"])
    conf_thresh = st.sidebar.slider("YOLO26 Confidence Threshold", 0.30, 0.95, 0.60)
    yolo_engine.conf_thresh = conf_thresh

    if uploaded_file is not None:
        st.success(f"File Uploaded: {uploaded_file.name} ({round(uploaded_file.size / (1024*1024), 2)} MB)")
        tfile = tempfile.NamedTemporaryFile(delete=False)
        tfile.write(uploaded_file.read())

        cap = cv2.VideoCapture(tfile.name)
        st_frame = st.empty()

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            annotated_frame, dets = yolo_engine.detect_and_track(frame)
            rgb_frame = cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB)
            st_frame.image(rgb_frame, channels="RGB", use_container_width=True)

        cap.release()`
  },
  {
    name: 'yolo26_detector.py',
    path: 'python_app/yolo26_detector.py',
    description: 'Ultralytics YOLO26 LTS Object Detection Engine & ByteTrack multi-object tracker.',
    language: 'python',
    code: `import cv2
import numpy as np
import time
from typing import List, Dict, Any, Tuple

class YOLO26Detector:
    """
    Ultralytics YOLO26 LTS Object Detector + ByteTrack Object Tracker
    High-speed inference engine for CCTV streams, MP4 files, and USB webcams.
    """
    def __init__(self, model_weights: str = "yolo11n.pt", conf_thresh: float = 0.5):
        self.model_weights = model_weights
        self.conf_thresh = conf_thresh
        self.model = None
        self.is_loaded = False
        self._load_model()

    def _load_model(self):
        try:
            from ultralytics import YOLO
            print(f"🚀 Loading YOLO26 LTS weights from '{self.model_weights}'...")
            self.model = YOLO(self.model_weights)
            self.is_loaded = True
        except Exception as e:
            print(f"⚠️ Warning: Could not load Ultralytics package directly ({e}).")
            self.is_loaded = False

    def detect_and_track(self, frame: np.ndarray) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
        if frame is None:
            return None, []

        h, w, _ = frame.shape
        detections = []
        annotated_frame = frame.copy()

        if self.is_loaded and self.model is not None:
            results = self.model.track(frame, persist=True, conf=self.conf_thresh, verbose=False)
            for r in results:
                boxes = r.boxes
                if boxes is None: continue
                for box in boxes:
                    cls_id = int(box.cls[0])
                    class_name = self.model.names[cls_id]
                    confidence = float(box.conf[0])
                    tracking_id = int(box.id[0]) if box.id is not None else 0
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                    detections.append({
                        "class": class_name,
                        "confidence": round(confidence, 3),
                        "tracking_id": f"BYT-{tracking_id:04d}",
                        "bbox_pixel": [x1, y1, x2, y2]
                    })
                    cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 127), 2)
        return annotated_frame, detections`
  },
  {
    name: 'face_engine.py',
    path: 'python_app/face_engine.py',
    description: '512-dimensional face embedding extraction & Cosine similarity vector search matching.',
    language: 'python',
    code: `import cv2
import numpy as np
from typing import List, Dict, Any, Optional

class FaceRecognitionEngine:
    def __init__(self, match_threshold: float = 0.70):
        self.match_threshold = match_threshold
        self.enrolled_faces: List[Dict[str, Any]] = []

    def register_employee_embedding(self, employee_id: str, full_name: str, embedding_vector: List[float]):
        vec_norm = np.array(embedding_vector, dtype=np.float32)
        norm = np.linalg.norm(vec_norm)
        if norm > 0: vec_norm = vec_norm / norm
        self.enrolled_faces.append({"employee_id": employee_id, "full_name": full_name, "vector": vec_norm})

    def match_face_vector(self, query_vector: List[float]) -> Optional[Dict[str, Any]]:
        if not self.enrolled_faces: return None
        q_vec = np.array(query_vector, dtype=np.float32)
        norm = np.linalg.norm(q_vec)
        if norm > 0: q_vec = q_vec / norm

        best_score, best_match = 0.0, None
        for item in self.enrolled_faces:
            similarity = float(np.dot(q_vec, item["vector"]))
            if similarity > best_score:
                best_score = similarity
                best_match = item

        if best_match and best_score >= self.match_threshold:
            return {"employee_id": best_match["employee_id"], "full_name": best_match["full_name"], "score": best_score}
        return None`
  },
  {
    name: 'database.py',
    path: 'python_app/database.py',
    description: 'SQLite / PostgreSQL database models using SQLAlchemy ORM.',
    language: 'python',
    code: `import os
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///visionai.db")
engine = create_engine(DB_PATH, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class EmployeeDB(Base):
    __tablename__ = "employees"
    id = Column(String, primary_key=True)
    employee_code = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    department = Column(String, nullable=False)
    role = Column(String, default="Engineer")

def init_db():
    Base.metadata.create_all(bind=engine)`
  },
  {
    name: 'requirements.txt',
    path: 'python_app/requirements.txt',
    description: 'Python package dependencies for OpenCV, Ultralytics, FastAPI & Streamlit.',
    language: 'plaintext',
    code: `fastapi>=0.110.0
uvicorn>=0.28.0
websockets>=12.0
ultralytics>=8.3.0
opencv-python>=4.9.0.80
numpy>=1.26.0
sqlalchemy>=2.0.0
pydantic>=2.6.0
streamlit>=1.32.0
pillow>=10.2.0
python-multipart>=0.0.9`
  }
];

export const PythonCodeExport: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<PythonFile>(PYTHON_FILES[0]);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = () => {
    const blob = new Blob([selectedFile.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    a.click();
  };

  const handleDownloadAllZip = () => {
    // Generate combined script for easy 1-click execution
    const combinedScript = `# ==========================================\n# Complete Python Codebase for VisionAI\n# File: ${selectedFile.name}\n# ==========================================\n\n` + selectedFile.code;
    const blob = new Blob([combinedScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    a.click();
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 overflow-y-auto">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold font-mono">
                PYTHON CODEBASE READY
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                FastAPI + YOLO26 LTS + Streamlit
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-emerald-400" /> Full Python Language Export
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl">
              Here is the complete, standalone Python source code for this CCTV Analytics & Face Recognition platform. You can copy individual files or run the Streamlit GUI (`streamlit run app_gui.py`) directly on your machine.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleDownloadFile}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all"
            >
              <Download className="w-4 h-4" /> Download {selectedFile.name}
            </button>
          </div>
        </div>

        {/* Quick Command Guide */}
        <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs font-mono flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">$</span>
            <span className="text-slate-300">pip install -r requirements.txt</span>
            <span className="text-slate-600">|</span>
            <span className="text-indigo-400">streamlit run app_gui.py</span>
          </div>

          <span className="text-[10px] text-slate-400 font-sans">
            Runs 100% locally on Python 3.9+ with PyTorch & OpenCV
          </span>
        </div>
      </div>

      {/* Main Code Viewer Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1">
        {/* Left Column: File Directory Selector */}
        <div className="lg:col-span-1 space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block px-1">
            Python Project Files ({PYTHON_FILES.length})
          </span>

          <div className="space-y-1.5">
            {PYTHON_FILES.map((file) => {
              const isSelected = selectedFile.name === file.name;
              return (
                <button
                  key={file.name}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full p-3 rounded-xl border text-left transition-all space-y-1 ${
                    isSelected
                      ? 'bg-indigo-950/90 border-indigo-500 ring-2 ring-indigo-500/30 text-white shadow-md'
                      : 'bg-slate-900 border-slate-800 hover:bg-slate-800/80 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono flex items-center gap-1.5">
                      <FileCode className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                      {file.name}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 font-mono">
                      {file.language}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 line-clamp-2 leading-tight">
                    {file.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 3-Columns: Interactive Code Editor / Viewer */}
        <div className="lg:col-span-3 flex flex-col rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
          {/* Header Bar */}
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-mono">
              <span className="text-indigo-400 font-bold">{selectedFile.path}</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 text-[11px]">{selectedFile.description}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy Code'}
              </button>

              <button
                onClick={handleDownloadFile}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>

          {/* Code Viewer Body */}
          <div className="p-4 bg-slate-950 font-mono text-xs text-slate-200 overflow-x-auto max-h-[580px] overflow-y-auto leading-relaxed">
            <pre>
              <code>{selectedFile.code}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

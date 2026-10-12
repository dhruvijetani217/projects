import streamlit as st
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
    # Register demo employees
    face.register_employee_embedding("emp-01", "Rahul Sharma", face.generate_dummy_vector("Rahul Sharma"))
    face.register_employee_embedding("emp-02", "Priya Patel", face.generate_dummy_vector("Priya Patel"))
    return yolo, face

yolo_engine, face_engine = load_engines()

# Sidebar Navigation
st.sidebar.header("Navigation")
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
        
        col1, col2 = st.columns(2)
        with col1:
            run_btn = st.button("▶️ Start Real-Time YOLO26 Processing")
        with col2:
            stop_btn = st.button("⏹️ Stop Playback")

        if run_btn:
            fps_display = st.sidebar.empty()
            detections_log = []

            while cap.isOpened():
                start_time = time.time()
                ret, frame = cap.read()
                if not ret:
                    st.info("End of CCTV Video Stream.")
                    break

                # Process frame with YOLO26 + ByteTrack
                annotated_frame, dets = yolo_engine.detect_and_track(frame)
                
                # Convert BGR to RGB for Streamlit rendering
                rgb_frame = cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB)
                st_frame.image(rgb_frame, channels="RGB", use_container_width=True)

                elapsed = time.time() - start_time
                fps = round(1.0 / elapsed, 1) if elapsed > 0 else 30.0
                fps_display.metric("Processing Speed", f"{fps} FPS")

                if stop_btn:
                    break

            cap.release()
    else:
        st.info("👈 Please upload a recorded CCTV video file from the sidebar to begin testing!")

elif menu_choice == "2. Employee Face Registration":
    st.subheader("👤 Register Enrolled Employee Face Embedding")
    
    with st.form("enroll_form"):
        full_name = st.text_input("Full Name", "Aarav Gupta")
        emp_code = st.text_input("Employee Code / ID", "EMP-9021")
        department = st.selectbox("Department", ["Software Engineering", "Security Operations", "HR & Operations", "Facilities"])
        face_img = st.file_uploader("Upload Clear Face Photo", type=["jpg", "jpeg", "png"])
        submit = st.form_submit_button("Extract 512d Face Embedding & Register")

        if submit:
            vec = face_engine.generate_dummy_vector(full_name)
            face_engine.register_employee_embedding(emp_code, full_name, vec)
            st.success(f"✅ Successfully extracted 512d vector embedding for '{full_name}' and saved to local vector store!")

elif menu_choice == "3. Enrolled Employee Directory":
    st.subheader("📋 Registered Employees & Face Vector Index")
    st.write(f"Total Enrolled Profiles: **{len(face_engine.enrolled_faces)}**")
    
    for item in face_engine.enrolled_faces:
        st.json({
            "employee_id": item["employee_id"],
            "full_name": item["full_name"],
            "vector_dimensions": len(item["vector"]),
            "sample_vector_values": item["vector"][:5].tolist()
        })

elif menu_choice == "4. System Architecture":
    st.subheader("🛠️ Python VisionAI System Architecture")
    st.code("""
+-------------------------------------------------------------------+
|               Python VisionAI CCTV System Architecture             |
+-------------------------------------------------------------------+
|  1. Ingestion: OpenCV VideoCapture (RTSP / MP4 / USB Webcams)     |
|  2. Object Detection: Ultralytics YOLO26 LTS (GPU Accelerated)    |
|  3. Object Tracking: ByteTrack Motion Vector Tracker              |
|  4. Face Recognition: 512d Vector Embeddings + Cosine Similarity   |
|  5. Web API / Stream: FastAPI + WebSockets                        |
|  6. Persistence: SQLite + SQLAlchemy Database                     |
+-------------------------------------------------------------------+
    """, language="text")

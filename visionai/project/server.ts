import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { mockCameras, mockEmployees, mockAttendance, mockAlerts, mockSnapshots, mockVideoFrames } from './src/data/mockData.js';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Initialize Gemini Client server-side
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// In-memory runtime database for live interactive modifications
let cameras = [...mockCameras];
let employees = [...mockEmployees];
let attendanceRecords = [...mockAttendance];
let alerts = [...mockAlerts];
let snapshots = [...mockSnapshots];

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'VisionAI Enterprise Video Intelligence Platform',
    version: '2.4.0-enterprise',
    gpuAcceleration: 'NVIDIA TensorRT 10.2 Enabled',
    activeCamerasCount: cameras.length,
    registeredFaceVectorsCount: employees.reduce((acc, e) => acc + e.faceEmbeddings.length, 0),
    timestamp: new Date().toISOString(),
  });
});

// AI Natural Language Video Search route using Gemini
app.post('/api/ai/natural-search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query string is required' });
    }

    console.log(`[VisionAI AI-Search] Processing query: "${query}"`);

    let parsedEntities: {
      targetPerson?: string;
      targetObject?: string;
      targetLocation?: string;
      hasViolation?: boolean;
      timeRange?: string;
      confidenceExplanation?: string;
    } = {};

    // Call Gemini API if available
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: `You are an enterprise AI video search assistant for VisionAI. Parse the user's natural language video search query into structured search criteria.

User Query: "${query}"

Respond strictly with a JSON object matching this schema:
{
  "targetPerson": "Name or classification if specified (e.g. Rahul, unknown person, visitor), or null",
  "targetObject": "Vehicle, laptop, helmet, bag, phone, fire, smoke, etc, or null",
  "targetLocation": "Gate 1, Lobby, Factory, Parking, Server Corridor, or null",
  "hasViolation": true/false/null,
  "timeRange": "yesterday, morning, 9:30 AM, or null",
  "confidenceExplanation": "Brief 1-sentence reasoning for matched results"
}`,
          config: {
            responseMimeType: 'application/json',
          },
        });

        if (response.text) {
          parsedEntities = JSON.parse(response.text.trim());
        }
      } catch (geminiError) {
        console.warn('[VisionAI AI-Search] Gemini API call fallback:', geminiError);
      }
    }

    // Perform query matching over snapshots and video frames
    const qLower = query.toLowerCase();
    const results = snapshots.map((snap) => {
      let score = 0.5; // Base relevance
      const snapText = `${snap.cameraName} ${snap.eventType} ${snap.recognizedName || ''} ${snap.tags.join(' ')}`.toLowerCase();

      if (qLower.includes('rahul') && (snap.recognizedName?.toLowerCase().includes('rahul') || snapText.includes('rahul'))) score += 0.45;
      if (qLower.includes('unknown') && snapText.includes('unknown')) score += 0.45;
      if ((qLower.includes('helmet') || qLower.includes('violation')) && (snap.eventType === 'HELMET_VIOLATION' || snapText.includes('helmet'))) score += 0.45;
      if ((qLower.includes('white') || qLower.includes('car') || qLower.includes('vehicle')) && (snap.eventType === 'VEHICLE_DETECTED' || snapText.includes('white') || snapText.includes('car'))) score += 0.45;
      if ((qLower.includes('restricted') || qLower.includes('server')) && (snap.eventType === 'RESTRICTED_AREA' || snapText.includes('server'))) score += 0.45;
      if (parsedEntities.targetPerson && snapText.includes(parsedEntities.targetPerson.toLowerCase())) score += 0.3;

      score = Math.min(score, 0.99);

      return {
        id: `res-${snap.id}`,
        snapshotId: snap.id,
        cameraId: snap.cameraId,
        cameraName: snap.cameraName,
        timestamp: snap.timestamp,
        confidence: parseFloat(score.toFixed(2)),
        thumbnailUrl: snap.imageUrl,
        clipUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        detectedName: snap.recognizedName || snap.eventType.replace('_', ' '),
        trackingId: snap.trackingId,
        matchReason: parsedEntities.confidenceExplanation || `Matched semantic parameters for "${query}" with ByteTrack ID ${snap.trackingId}`,
      };
    }).sort((a, b) => b.confidence - a.confidence);

    res.json({
      query,
      parsedEntities,
      totalMatches: results.length,
      results,
    });
  } catch (err: any) {
    console.error('Error handling AI search:', err);
    res.status(500).json({ error: err.message || 'Internal AI Search Error' });
  }
});

// Camera endpoints
app.get('/api/cameras', (req, res) => {
  res.json(cameras);
});

app.post('/api/cameras', (req, res) => {
  const newCam = {
    id: `cam-${Date.now()}`,
    lastPingTime: 'Just now',
    fps: 30,
    status: 'ONLINE',
    storageUsedGb: 12,
    latencyMs: 15,
    bitrateKbps: 4096,
    resolution: '1920x1080 (FHD)',
    ...req.body,
  };
  cameras.unshift(newCam);
  res.status(201).json(newCam);
});

// Employee endpoints
app.get('/api/employees', (req, res) => {
  res.json(employees);
});

app.post('/api/employees', (req, res) => {
  const newEmp = {
    id: `emp-${Date.now()}`,
    createdAt: new Date().toISOString().split('T')[0],
    status: 'ACTIVE',
    faceEmbeddings: req.body.faceEmbeddings || [],
    ...req.body,
  };
  employees.unshift(newEmp);
  res.status(201).json(newEmp);
});

// Attendance endpoints
app.get('/api/attendance', (req, res) => {
  res.json(attendanceRecords);
});

app.post('/api/attendance/checkin', (req, res) => {
  const { employeeId, cameraName } = req.body;
  const emp = employees.find((e) => e.id === employeeId || e.employeeCode === employeeId);
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const newRecord = {
    id: `att-${Date.now()}`,
    employeeId: emp?.id || 'emp-unknown',
    employeeName: emp?.fullName || 'Registered User',
    employeeCode: emp?.employeeCode || 'EMP-LIVE',
    department: emp?.department || 'General Operations',
    date: now.toISOString().split('T')[0],
    checkInTime: timeStr,
    checkInCamera: cameraName || 'Main Entrance Gate 1',
    status: 'PRESENT' as const,
    workDurationHours: 0.1,
    overtimeHours: 0,
    breakDurationMinutes: 0,
    verificationMethod: 'FACE_RECOGNITION' as const,
  };

  attendanceRecords.unshift(newRecord);
  res.status(201).json(newRecord);
});

// Alerts endpoints
app.get('/api/alerts', (req, res) => {
  res.json(alerts);
});

app.post('/api/alerts/acknowledge', (req, res) => {
  const { alertId } = req.body;
  alerts = alerts.map((a) => (a.id === alertId ? { ...a, readStatus: true } : a));
  res.json({ success: true, alerts });
});

// Mount Vite middleware in development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VisionAI Enterprise Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

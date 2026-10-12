const express = require('express');
const multer  = require('multer');
const { v4: uuid } = require('uuid');
const minio   = require('../minioService');
const auth    = require('../authMiddleware');

const router = express.Router();

function getUpload(plan) {
  const { fileSize } = minio.getPlanLimits(plan);
  return multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize, files: 100 }, // allow up to 100 files (folder)
  });
}

// ── Single file upload ────────────────────────────────────────────────────────
router.post('/upload', auth, (req, res) => {
  const upload = getUpload(req.user.plan).single('file');
  upload(req, res, async err => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      const { fileSize } = minio.getPlanLimits(req.user.plan);
      return res.status(400).json({ error: `File too large. Your plan limit: ${fmtBytes(fileSize)}`, code: 'FILE_TOO_LARGE' });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    await doUpload(req, res, [{ buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size, folder: req.body.folder || '' }]);
  });
});

// ── Folder / multiple files upload ───────────────────────────────────────────
router.post('/upload-folder', auth, (req, res) => {
  const upload = getUpload(req.user.plan).array('files', 100);
  upload(req, res, async err => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'One or more files too large for your plan', code: 'FILE_TOO_LARGE' });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files?.length) return res.status(400).json({ error: 'No files' });

    // paths come as JSON array from frontend
    let paths = [];
    try { paths = JSON.parse(req.body.paths || '[]'); } catch {}

    const fileItems = req.files.map((f, i) => ({
      buffer: f.buffer, originalname: f.originalname,
      mimetype: f.mimetype, size: f.size,
      folder: paths[i] || req.body.folder || '',
    }));
    await doUpload(req, res, fileItems, true);
  });
});

async function doUpload(req, res, fileItems, isBatch = false) {
  try {
    const { id: uid, plan } = req.user;
    const { storage } = minio.getPlanLimits(plan);
    const storageUsed = await minio.getUserStorageUsed(uid);
    const totalNew    = fileItems.reduce((s, f) => s + f.size, 0);

    if (storageUsed + totalNew > storage) {
      return res.status(400).json({
        error: `Storage full! Used: ${fmtBytes(storageUsed)} / ${fmtBytes(storage)}. ${plan === 'free' ? 'Upgrade for more storage!' : ''}`,
        code: 'STORAGE_FULL',
      });
    }

    const uploaded = [];
    for (const f of fileItems) {
      const fileId = uuid();
      await minio.uploadFile(uid, fileId, f.buffer, f.mimetype);
      const meta = await minio.addFileMeta(uid, {
        id: fileId, name: f.originalname,
        size: f.size, mimetype: f.mimetype,
        folder: f.folder, uploadedAt: new Date().toISOString(),
      });
      uploaded.push(meta);
    }
    res.status(201).json(isBatch ? { files: uploaded, count: uploaded.length } : { file: uploaded[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Upload failed' }); }
}

// ── List files ────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { id: uid, plan } = req.user;
    const files        = await minio.getUserFiles(uid);
    const storageUsed  = await minio.getUserStorageUsed(uid);
    const limits       = minio.getPlanLimits(plan);
    res.json({ files, storageUsed, storageLimit: limits.storage, fileSizeLimit: limits.fileSize });
  } catch { res.status(500).json({ error: 'Could not list files' }); }
});

// ── Download ──────────────────────────────────────────────────────────────────
router.get('/download/:fid', auth, async (req, res) => {
  try {
    const file = await minio.getFileMeta(req.user.id, req.params.fid);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const url = await minio.getPresignedUrl(req.user.id, file.id);
    res.json({ url, name: file.name });
  } catch { res.status(500).json({ error: 'Could not generate link' }); }
});

// ── Rename ────────────────────────────────────────────────────────────────────
router.patch('/:fid/rename', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const file = await minio.renameFile(req.user.id, req.params.fid, name.trim());
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json({ file });
  } catch { res.status(500).json({ error: 'Rename failed' }); }
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete('/:fid', auth, async (req, res) => {
  try {
    const file = await minio.getFileMeta(req.user.id, req.params.fid);
    if (!file) return res.status(404).json({ error: 'File not found' });
    await minio.deleteFile(req.user.id, file.id);
    await minio.deleteFileMeta(req.user.id, file.id);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ error: 'Delete failed' }); }
});

// ── Delete multiple ───────────────────────────────────────────────────────────
router.post('/delete-bulk', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    // Sequential on purpose: metadata is a single JSON object per user, so
    // concurrent read-modify-write would lose deletions.
    let deleted = 0;
    for (const fid of ids) {
      const file = await minio.getFileMeta(req.user.id, fid);
      if (file) { await minio.deleteFile(req.user.id, fid); await minio.deleteFileMeta(req.user.id, fid); deleted++; }
    }
    res.json({ deleted });
  } catch { res.status(500).json({ error: 'Bulk delete failed' }); }
});

function fmtBytes(b) {
  if (b >= 1073741824) return (b/1073741824).toFixed(0)+'GB';
  if (b >= 1048576)    return (b/1048576).toFixed(0)+'MB';
  return (b/1024).toFixed(0)+'KB';
}

module.exports = router;

import React,{useCallback,useState,useRef} from 'react';
import {useDropzone} from 'react-dropzone';
import {Upload,CheckCircle,AlertCircle,X,FolderUp,FileUp} from 'lucide-react';
import {useIsMobile} from '../hooks/useMediaQuery';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {fmtBytes} from '../utils/format';

export default function UploadZone({onUploaded,onUploadedBatch,plan,onStorageFull,isFull}) {
  const isMobile = useIsMobile();
  const [queue, setQueue] = useState([]);
  const folderInputRef = useRef(null);

  // ── Single/multi file upload (drag & drop or file picker) ──────────────────
  const uploadFiles = async (files) => {
    const id = Math.random().toString(36).slice(2);
    const totalSize = files.reduce((s,f)=>s+f.size,0);
    setQueue(p=>[...p,{id,name:files.length>1?`${files.length} files`:files[0].name,size:totalSize,status:'uploading',progress:0}]);

    const fd = new FormData();
    const paths = [];
    // Send only the folder part of the path ("dir/sub" for "dir/sub/a.txt", "" for a loose file like "./a.txt")
    const folderOf = f => (f.webkitRelativePath || f.path || '').replace(/^\.?\//, '').split('/').slice(0, -1).join('/');
    files.forEach(f => { fd.append('files', f); paths.push(folderOf(f)); });
    fd.append('paths', JSON.stringify(paths));

    try {
      const res = await api.post('/files/upload-folder', fd, {
        headers:{'Content-Type':'multipart/form-data'},
        onUploadProgress:e=>{
          const pct=Math.round((e.loaded/e.total)*100);
          setQueue(p=>p.map(q=>q.id===id?{...q,progress:pct}:q));
        }
      });
      setQueue(p=>p.map(q=>q.id===id?{...q,status:'done'}:q));
      toast.success(`${res.data.count} file(s) uploaded!`);
      onUploadedBatch?.(res.data.files);
      setTimeout(()=>setQueue(p=>p.filter(q=>q.id!==id)),2500);
    } catch(err) {
      const msg = err.response?.data?.error || 'Upload failed';
      setQueue(p=>p.map(q=>q.id===id?{...q,status:'error',error:msg}:q));
      toast.error(msg);
      if (err.response?.data?.code === 'STORAGE_FULL') onStorageFull?.();
    }
  };

  const onDrop = useCallback(files => {
    if (!files.length) return;
    if (isFull) { toast.error('Storage full! Upgrade your plan to upload more.'); onStorageFull?.(); return; }
    uploadFiles(files);
  }, [plan, isFull]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, noClick: false, disabled: isFull });

  // ── Folder upload (separate hidden input with webkitdirectory) ─────────────
  const handleFolderSelect = (e) => {
    if (isFull) { toast.error('Storage full! Upgrade your plan to upload more.'); onStorageFull?.(); e.target.value=''; return; }
    const files = Array.from(e.target.files);
    if (files.length) uploadFiles(files);
    e.target.value = '';
  };

  const remove = id => setQueue(p=>p.filter(q=>q.id!==id));

  return (
    <div>
      <div {...getRootProps()} style={{
          ...s.zone,
          borderColor: isFull ? 'rgba(239,68,68,0.4)' : isDragActive ? '#6366f1' : '#1e293b',
          background:  isFull ? 'rgba(239,68,68,0.04)' : isDragActive ? 'rgba(99,102,241,0.06)' : 'rgba(15,23,42,0.4)',
          cursor: isFull ? 'not-allowed' : 'pointer',
          opacity: isFull ? 0.7 : 1,
        }}>
        <input {...getInputProps()} />
        <div style={{...s.uploadIconWrap,background:isFull?'rgba(239,68,68,0.1)':isDragActive?'rgba(99,102,241,0.15)':'rgba(15,23,42,0.8)'}}>
          <Upload size={isMobile?22:24} color={isFull?'#ef4444':isDragActive?'#818cf8':'#475569'}/>
        </div>
        <p style={s.zoneTitle}>{isFull ? '🚫 Storage full' : isDragActive ? 'Drop files here!' : isMobile ? 'Tap to select files' : 'Drag & drop files'}</p>
        <p style={s.zoneSub}>{isFull ? 'Upgrade your plan to upload more' : (!isMobile && 'or click to browse · ') + (plan==='free'?'Max 100MB/file':plan==='pro'?'Max 5GB/file':'Max 20GB/file')}</p>
      </div>

      {/* Folder upload button — separate from dropzone */}
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory="true"
        directory="true"
        multiple
        style={{display:'none'}}
        onChange={handleFolderSelect}
        disabled={isFull}
      />
      <button style={{...s.folderBtn, opacity: isFull?0.5:1, cursor: isFull?'not-allowed':'pointer'}} onClick={()=>!isFull && folderInputRef.current?.click()}>
        <FolderUp size={15} color={isFull?'#475569':'#818cf8'}/>
        <span>{isFull ? 'Storage full' : 'Upload Folder'}</span>
      </button>

      {queue.length>0 && (
        <div style={s.queue} className="fade-in">
          {queue.map(item=>(
            <div key={item.id} style={{...s.qItem,borderColor:item.status==='done'?'rgba(52,211,153,0.3)':item.status==='error'?'rgba(239,68,68,0.3)':'#1e293b'}}>
              <div style={s.qLeft}>
                <span style={s.qName} title={item.name}>{item.name}</span>
                <span style={s.qSize}>{fmtBytes(item.size)}</span>
              </div>
              <div style={s.qRight}>
                {item.status==='uploading' && (
                  <div style={s.progWrap}>
                    <div style={s.progTrack}><div style={{...s.progFill,width:`${item.progress}%`}}/></div>
                    <span style={s.progPct}>{item.progress}%</span>
                  </div>
                )}
                {item.status==='done'  && <CheckCircle size={16} color="#34d399"/>}
                {item.status==='error' && <span style={{fontSize:11,color:'#ef4444',maxWidth:160,display:'flex',alignItems:'center',gap:4}}><AlertCircle size={12}/> {item.error}</span>}
                <button style={s.removeBtn} onClick={()=>remove(item.id)}><X size={12} color="#475569"/></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  zone:         {border:'2px dashed',borderRadius:14,padding:'30px 20px',textAlign:'center',cursor:'pointer',transition:'all 0.2s',marginBottom:10},
  uploadIconWrap:{width:48,height:48,borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px',transition:'all 0.2s'},
  zoneTitle:    {fontSize:14,fontWeight:600,color:'#94a3b8',marginBottom:5},
  zoneSub:      {fontSize:11,color:'#475569'},
  folderBtn:    {display:'flex',alignItems:'center',justifyContent:'center',gap:7,width:'100%',padding:'11px',background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:10,color:'#a5b4fc',fontSize:13,fontWeight:600,cursor:'pointer',marginBottom:16},
  queue:        {display:'flex',flexDirection:'column',gap:8},
  qItem:        {background:'rgba(15,23,42,0.6)',border:'1px solid',borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,transition:'border-color 0.3s'},
  qLeft:        {flex:1,minWidth:0},
  qName:        {display:'block',fontSize:13,color:'#e2e8f0',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  qSize:        {fontSize:11,color:'#475569'},
  qRight:       {display:'flex',alignItems:'center',gap:8,flexShrink:0},
  progWrap:     {display:'flex',alignItems:'center',gap:8},
  progTrack:    {width:80,height:4,background:'rgba(6,11,24,0.8)',borderRadius:99,overflow:'hidden'},
  progFill:     {height:'100%',background:'linear-gradient(90deg,#6366f1,#8b5cf6)',borderRadius:99,transition:'width 0.2s'},
  progPct:      {fontSize:11,color:'#818cf8',width:30,textAlign:'right'},
  removeBtn:    {background:'none',border:'none',cursor:'pointer',padding:2,display:'flex',opacity:0.6},
};

import React,{useState} from 'react';
import {Download,Trash2,File,Image,Film,Music,FileText,Archive,Loader,Folder,Edit2,Check,X} from 'lucide-react';
import {useIsMobile} from '../hooks/useMediaQuery';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {fmtBytes,fmtDate} from '../utils/format';

function FileIcon({mime,size=16}) {
  const p = mime||'';
  if(p.startsWith('image/'))  return <Image   size={size} color="#34d399"/>;
  if(p.startsWith('video/'))  return <Film    size={size} color="#f59e0b"/>;
  if(p.startsWith('audio/'))  return <Music   size={size} color="#ec4899"/>;
  if(p.includes('pdf')||p.includes('text')) return <FileText size={size} color="#60a5fa"/>;
  if(p.includes('zip')||p.includes('tar')) return <Archive  size={size} color="#a78bfa"/>;
  return <File size={size} color="#818cf8"/>;
}

export default function FileList({files,onDeleted}) {
  const isMobile = useIsMobile();
  const [deleting,    setDeleting]    = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [renaming,    setRenaming]    = useState(null);
  const [renameVal,   setRenameVal]   = useState('');

  const download = async file => {
    setDownloading(file.id);
    try { const r=await api.get(`/files/download/${file.id}`); window.open(r.data.url,'_blank'); }
    catch { toast.error('Download failed'); }
    finally { setDownloading(null); }
  };

  const del = async file => {
    if(!window.confirm(`Delete "${file.name}"?`)) return;
    setDeleting(file.id);
    try { await api.delete(`/files/${file.id}`); toast.success('File deleted'); onDeleted(file.id); }
    catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  const startRename = f => { setRenaming(f.id); setRenameVal(f.name); };
  const saveRename = async (f) => {
    if (!renameVal.trim() || renameVal === f.name) { setRenaming(null); return; }
    try {
      await api.patch(`/files/${f.id}/rename`, { name: renameVal.trim() });
      f.name = renameVal.trim();
      toast.success('Renamed');
    } catch { toast.error('Rename failed'); }
    setRenaming(null);
  };

  if(!files.length) return (
    <div style={s.empty}>
      <div style={s.emptyIcon}><File size={28} color="#1e293b"/></div>
      <p style={s.emptyTitle}>No files yet</p>
      <p style={s.emptySub}>Upload files using the zone above</p>
    </div>
  );

  // ── Mobile card view ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={s.mobileList}>
        {files.map(f=>(
          <div key={f.id} style={s.mobileCard}>
            <div style={s.mobileTop}>
              <div style={s.fileIconM}><FileIcon mime={f.mimetype} size={18}/></div>
              <div style={{flex:1,minWidth:0}}>
                {renaming===f.id ? (
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <input style={s.renameInput} value={renameVal} onChange={e=>setRenameVal(e.target.value)} autoFocus/>
                    <button onClick={()=>saveRename(f)} style={s.renameBtn}><Check size={13} color="#34d399"/></button>
                    <button onClick={()=>setRenaming(null)} style={s.renameBtn}><X size={13} color="#ef4444"/></button>
                  </div>
                ) : (
                  <p style={s.mobileFname}>{f.name}</p>
                )}
                <p style={s.mobileMeta}>{fmtBytes(f.size)} · {fmtDate(f.uploadedAt)}{f.folder?` · 📁 ${f.folder.split('/')[0]}`:''}</p>
              </div>
            </div>
            <div style={s.mobileActions}>
              <button style={s.mActionBtn} onClick={()=>download(f)} disabled={downloading===f.id}>
                {downloading===f.id?<Loader size={14} className="spin" color="#818cf8"/>:<Download size={14} color="#818cf8"/>} Download
              </button>
              <button style={s.mActionBtn} onClick={()=>startRename(f)}><Edit2 size={14} color="#94a3b8"/> Rename</button>
              <button style={{...s.mActionBtn,color:'#ef4444'}} onClick={()=>del(f)} disabled={deleting===f.id}>
                {deleting===f.id?<Loader size={14} className="spin" color="#ef4444"/>:<Trash2 size={14} color="#ef4444"/>} Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Desktop table view ───────────────────────────────────────────────────────
  return (
    <div>
      <div style={s.hdr}>
        <span style={{...s.hCell,flex:3}}>File</span>
        <span style={s.hCell}>Size</span>
        <span style={s.hCell}>Uploaded</span>
        <span style={s.hCell}>Actions</span>
      </div>
      {files.map(f=>(
        <div key={f.id} style={s.row}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,0.04)'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}
        >
          <div style={{...s.cell,flex:3,display:'flex',alignItems:'center',gap:10}}>
            <div style={s.fileIcon}><FileIcon mime={f.mimetype}/></div>
            {renaming===f.id ? (
              <div style={{display:'flex',gap:6,alignItems:'center',flex:1}}>
                <input style={s.renameInputDesktop} value={renameVal} onChange={e=>setRenameVal(e.target.value)} autoFocus onKeyDown={e=>e.key==='Enter'&&saveRename(f)}/>
                <button onClick={()=>saveRename(f)} style={s.renameBtn}><Check size={14} color="#34d399"/></button>
                <button onClick={()=>setRenaming(null)} style={s.renameBtn}><X size={14} color="#ef4444"/></button>
              </div>
            ) : (
              <span style={s.fname} title={f.name}>{f.folder?`📁 ${f.folder} / `:''}{f.name}</span>
            )}
          </div>
          <span style={s.cell}>{fmtBytes(f.size)}</span>
          <span style={s.cell}>{fmtDate(f.uploadedAt)}</span>
          <div style={{...s.cell,display:'flex',gap:6}}>
            <button style={s.iconBtn} onClick={()=>download(f)} disabled={downloading===f.id} title="Download">
              {downloading===f.id ? <Loader size={13} color="#818cf8" className="spin"/> : <Download size={13} color="#818cf8"/>}
            </button>
            <button style={s.iconBtn} onClick={()=>startRename(f)} title="Rename"><Edit2 size={13} color="#94a3b8"/></button>
            <button style={s.delBtn} onClick={()=>del(f)} disabled={deleting===f.id} title="Delete">
              {deleting===f.id ? <Loader size={13} color="#ef4444" className="spin"/> : <Trash2 size={13} color="#ef4444"/>}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const s = {
  hdr:       {display:'flex',padding:'8px 12px',borderBottom:'1px solid #0f172a',marginBottom:4},
  hCell:     {flex:1,fontSize:10,fontWeight:700,color:'#334155',textTransform:'uppercase',letterSpacing:0.8},
  row:       {display:'flex',alignItems:'center',padding:'10px 12px',borderRadius:8,transition:'background 0.15s'},
  cell:      {flex:1,fontSize:12,color:'#64748b'},
  fileIcon:  {width:30,height:30,borderRadius:8,background:'rgba(15,23,42,0.8)',border:'1px solid #1e293b',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0},
  fname:     {fontSize:13,color:'#e2e8f0',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:280},
  iconBtn:   {background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:7,padding:'6px 8px',cursor:'pointer',display:'flex',alignItems:'center'},
  delBtn:    {background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:7,padding:'6px 8px',cursor:'pointer',display:'flex',alignItems:'center'},
  renameInputDesktop:{flex:1,padding:'4px 8px',background:'#060b18',border:'1px solid #6366f1',borderRadius:6,color:'#f1f5f9',fontSize:13},
  renameBtn: {background:'none',border:'none',cursor:'pointer',display:'flex',padding:2},
  empty:     {padding:'48px 20px',textAlign:'center'},
  emptyIcon: {width:56,height:56,borderRadius:16,background:'rgba(15,23,42,0.6)',border:'1px solid #1e293b',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'},
  emptyTitle:{fontSize:15,fontWeight:600,color:'#334155',marginBottom:4},
  emptySub:  {fontSize:13,color:'#1e293b'},
  // Mobile
  mobileList:{display:'flex',flexDirection:'column',gap:10},
  mobileCard:{background:'rgba(15,23,42,0.5)',border:'1px solid #1e293b',borderRadius:14,padding:14},
  mobileTop: {display:'flex',gap:10,alignItems:'flex-start',marginBottom:12},
  fileIconM: {width:36,height:36,borderRadius:10,background:'rgba(6,11,24,0.8)',border:'1px solid #1e293b',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0},
  mobileFname:{fontSize:14,fontWeight:600,color:'#e2e8f0',margin:0,wordBreak:'break-word'},
  mobileMeta:{fontSize:11,color:'#475569',margin:'3px 0 0'},
  mobileActions:{display:'flex',gap:8},
  mActionBtn:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:'9px 6px',background:'rgba(6,11,24,0.6)',border:'1px solid #1e293b',borderRadius:9,color:'#94a3b8',fontSize:11,fontWeight:600,cursor:'pointer'},
  renameInput:{flex:1,padding:'6px 9px',background:'#060b18',border:'1px solid #6366f1',borderRadius:7,color:'#f1f5f9',fontSize:13},
};

import React,{useEffect,useState,useCallback} from 'react';
import {useAuth} from '../context/AuthContext';
import {useIsMobile} from '../hooks/useMediaQuery';
import StorageBar   from '../components/StorageBar';
import UploadZone   from '../components/UploadZone';
import FileList     from '../components/FileList';
import PricingPage  from './PricingPage';
import api from '../utils/api';
import {LogOut,Cloud,RefreshCw,Crown,Settings,Search} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const {user,logout,refreshUser} = useAuth();
  const isMobile = useIsMobile();
  const [files,        setFiles]        = useState([]);
  const [storageUsed,  setStorageUsed]  = useState(0);
  const [storageLimit, setStorageLimit] = useState(1073741824);
  const [loading,      setLoading]      = useState(true);
  const [showPricing,  setShowPricing]  = useState(false);
  const [search,       setSearch]       = useState('');

  const fetchFiles = useCallback(async()=>{
    setLoading(true);
    try { const r=await api.get('/files'); setFiles(r.data.files); setStorageUsed(r.data.storageUsed); setStorageLimit(r.data.storageLimit); }
    catch { toast.error('Could not load files'); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ fetchFiles(); },[fetchFiles]);

  const handleUploaded      = f  => { setFiles(p=>[f,...p]); setStorageUsed(p=>p+f.size); };
  const handleUploadedBatch = fs => { setFiles(p=>[...fs,...p]); setStorageUsed(p=>p+fs.reduce((s,f)=>s+f.size,0)); };
  const handleDeleted       = id => { const f=files.find(x=>x.id===id); setFiles(p=>p.filter(x=>x.id!==id)); if(f) setStorageUsed(p=>p-f.size); };

  const handlePricingClose = async()=>{ setShowPricing(false); await refreshUser(); await fetchFiles(); };

  const filteredFiles = files.filter(f=>f.name.toLowerCase().includes(search.toLowerCase()));

  if (showPricing) return <PricingPage onClose={handlePricingClose} onUpgraded={handlePricingClose}/>;

  return (
    <div style={s.bg}>
      {/* Nav */}
      <nav style={s.nav}>
        <div style={{...s.navInner, padding: isMobile?'0 14px':'0 20px'}}>
          <div style={s.brand}>
            <div style={s.brandIcon}><Cloud size={isMobile?16:18} color="#fff"/></div>
            {!isMobile && <span style={s.brandName}>CloudVault</span>}
          </div>
          <div style={s.navRight}>
            {user?.plan!=='free' && (
              <span style={s.proBadge}><Crown size={11}/> {!isMobile && (user.plan==='business'?'Business':'Pro')}</span>
            )}
            {!isMobile && <span style={s.userName}>{user?.name}</span>}
            {user?.role==='admin' && !isMobile && (
              <a href="/admin" style={s.adminLink}><Settings size={13}/> Admin</a>
            )}
            <button style={s.iconBtn} onClick={fetchFiles} title="Refresh"><RefreshCw size={14} color="#475569"/></button>
            {user?.plan==='free' && (
              <button style={s.upgradeNavBtn} onClick={()=>setShowPricing(true)}>
                <Crown size={12}/> {!isMobile && 'Upgrade'}
              </button>
            )}
            <button style={s.logoutBtn} onClick={logout}><LogOut size={13}/></button>
          </div>
        </div>
      </nav>

      <div style={{...s.page, padding: isMobile?'16px 12px 90px':'24px 16px'}}>
        <div style={s.container}>
          <StorageBar
            used={storageUsed} limit={storageLimit} plan={user?.plan||'free'}
            subscriptionEnd={user?.subscriptionEnd}
            onUpgrade={()=>setShowPricing(true)}
          />

          <div style={{...s.card, padding: isMobile?16:20}}>
            <h3 style={s.cardTitle}>Upload</h3>
            <UploadZone
              onUploaded={handleUploaded} onUploadedBatch={handleUploadedBatch}
              plan={user?.plan} onStorageFull={()=>setShowPricing(true)}
              isFull={storageUsed >= storageLimit}
            />
          </div>

          <div style={{...s.card, padding: isMobile?16:20}}>
            <div style={s.cardHead}>
              <h3 style={s.cardTitle}>My Files {!loading&&`(${files.length})`}</h3>
            </div>
            {files.length > 3 && (
              <div style={s.searchWrap}>
                <Search size={14} color="#475569" style={{position:'absolute',left:12,top:11}}/>
                <input style={s.searchInput} placeholder="Search files…" value={search} onChange={e=>setSearch(e.target.value)}/>
              </div>
            )}
            {loading
              ? <div style={s.skeleton}><div style={s.skLine}/><div style={{...s.skLine,width:'70%'}}/><div style={{...s.skLine,width:'85%'}}/></div>
              : <FileList files={filteredFiles} onDeleted={handleDeleted}/>
            }
          </div>
        </div>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && (
        <div style={s.bottomNav}>
          <div style={s.bottomNavItem}><Cloud size={18} color="#818cf8"/><span style={s.bnLabel}>Files</span></div>
          <button style={s.bottomNavItem} onClick={()=>setShowPricing(true)}>
            <Crown size={18} color={user?.plan==='free'?'#f59e0b':'#475569'}/>
            <span style={s.bnLabel}>Plans</span>
          </button>
          {user?.role==='admin' && (
            <a href="/admin" style={{...s.bottomNavItem,textDecoration:'none'}}>
              <Settings size={18} color="#475569"/><span style={s.bnLabel}>Admin</span>
            </a>
          )}
          <button style={s.bottomNavItem} onClick={logout}>
            <LogOut size={18} color="#475569"/><span style={s.bnLabel}>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
}

const s = {
  bg:          {minHeight:'100vh',background:'#060b18'},
  nav:         {background:'rgba(10,18,35,0.95)',borderBottom:'1px solid #0f172a',backdropFilter:'blur(12px)',position:'sticky',top:0,zIndex:100},
  navInner:    {maxWidth:1000,margin:'0 auto',height:54,display:'flex',alignItems:'center',justifyContent:'space-between'},
  brand:       {display:'flex',alignItems:'center',gap:9},
  brandIcon:   {width:30,height:30,borderRadius:9,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center'},
  brandName:   {fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:700,color:'#f1f5f9'},
  navRight:    {display:'flex',alignItems:'center',gap:8},
  proBadge:    {display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:700,color:'#fbbf24',background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:20,padding:'3px 9px'},
  userName:    {fontSize:13,color:'#475569'},
  adminLink:   {display:'flex',alignItems:'center',gap:4,fontSize:12,color:'#818cf8',textDecoration:'none',background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:7,padding:'4px 10px'},
  iconBtn:     {background:'rgba(15,23,42,0.6)',border:'1px solid #1e293b',borderRadius:8,padding:7,cursor:'pointer',display:'flex'},
  upgradeNavBtn:{display:'flex',alignItems:'center',gap:4,background:'linear-gradient(135deg,#f59e0b,#ef4444)',color:'#fff',border:'none',borderRadius:8,padding:'6px 11px',fontSize:12,fontWeight:700,cursor:'pointer'},
  logoutBtn:   {background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:8,padding:'7px 9px',cursor:'pointer',display:'flex',alignItems:'center',color:'#f87171'},
  page:        {},
  container:   {maxWidth:1000,margin:'0 auto'},
  card:        {background:'rgba(10,18,35,0.8)',border:'1px solid #0f172a',borderRadius:16,marginBottom:16,backdropFilter:'blur(8px)'},
  cardHead:    {display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12},
  cardTitle:   {fontFamily:"'Space Grotesk',sans-serif",fontSize:15,fontWeight:700,color:'#f1f5f9',margin:'0 0 12px'},
  searchWrap:  {position:'relative',marginBottom:14},
  searchInput: {width:'100%',padding:'9px 12px 9px 34px',background:'rgba(6,11,24,0.7)',border:'1px solid #1e293b',borderRadius:9,color:'#f1f5f9',fontSize:13,boxSizing:'border-box'},
  skeleton:    {display:'flex',flexDirection:'column',gap:10,padding:'10px 0'},
  skLine:      {height:14,background:'linear-gradient(90deg,#0f172a,#1e293b,#0f172a)',backgroundSize:'200% 100%',borderRadius:8,animation:'shimmer 1.5s infinite'},
  // Mobile bottom nav
  bottomNav:   {position:'fixed',bottom:0,left:0,right:0,background:'rgba(10,18,35,0.97)',borderTop:'1px solid #0f172a',backdropFilter:'blur(16px)',display:'flex',justifyContent:'space-around',padding:'8px 4px',paddingBottom:'max(8px, env(safe-area-inset-bottom))',zIndex:100},
  bottomNavItem:{display:'flex',flexDirection:'column',alignItems:'center',gap:3,background:'none',border:'none',cursor:'pointer',padding:'4px 12px',color:'#475569'},
  bnLabel:     {fontSize:10,fontWeight:600},
};

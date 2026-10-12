import React,{useState,useEffect} from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {Users,HardDrive,Crown,Cloud,LogOut,RefreshCw,Trash2,BarChart2,Shield,Mail,Building2} from 'lucide-react';
import {useIsMobile} from '../hooks/useMediaQuery';
import {fmtBytes} from '../utils/format';

function StatCard({icon:Icon,label,value,color='#818cf8',sub}) {
  return (
    <div style={ad.statCard}>
      <div style={{...ad.statIcon,background:`${color}15`,border:`1px solid ${color}25`}}><Icon size={18} color={color}/></div>
      <div><p style={ad.statVal}>{value}</p><p style={ad.statLbl}>{label}</p>{sub && <p style={ad.statSub}>{sub}</p>}</div>
    </div>
  );
}

export default function AdminPage() {
  const isMobile = useIsMobile();
  const [token,   setToken]   = useState(localStorage.getItem('cv_token'));
  const [isAdmin, setIsAdmin] = useState(!!localStorage.getItem('cv_admin'));
  const [loginForm, setLoginForm] = useState({email:'',password:''});
  const [stats,   setStats]   = useState(null);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState('');
  const [planFilter, setPlanFilter] = useState('all');

  const handleAdminLogin = async e => {
    e.preventDefault(); setLoading(true);
    try {
      const r = await api.post('/admin/login', loginForm);
      localStorage.setItem('cv_token', r.data.token);
      localStorage.setItem('cv_admin', '1');
      setToken(r.data.token); setIsAdmin(true);
      toast.success('Admin logged in!');
    } catch(err) { toast.error(err.response?.data?.error||'Login failed'); }
    finally { setLoading(false); }
  };

  const logout = () => { localStorage.removeItem('cv_token'); localStorage.removeItem('cv_admin'); setToken(null); setIsAdmin(false); };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [sr, ur] = await Promise.all([api.get('/admin/stats'), api.get('/admin/users')]);
      setStats(sr.data); setUsers(ur.data);
    } catch { toast.error('Could not load data'); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ if(isAdmin && token) fetchAll(); },[isAdmin,token]);

  const changePlan = async (userId, plan) => {
    try { await api.patch(`/admin/users/${userId}/plan`, {plan}); toast.success(`Plan changed to ${plan}`); setUsers(p=>p.map(u=>u.id===userId?{...u,plan}:u)); }
    catch { toast.error('Failed to change plan'); }
  };

  const deleteUser = async (userId, name) => {
    if(!window.confirm(`Delete user "${name}"? This removes all their files!`)) return;
    try { await api.delete(`/admin/users/${userId}`); toast.success('User deleted'); setUsers(p=>p.filter(u=>u.id!==userId)); }
    catch { toast.error('Delete failed'); }
  };

  const filtered = users.filter(u=>{
    const q = search.toLowerCase();
    const matchSearch = u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    const matchPlan   = planFilter==='all' || u.plan===planFilter;
    return matchSearch && matchPlan;
  });

  if (!isAdmin) return (
    <div style={ad.loginBg}>
      <div style={ad.loginCard}>
        <div style={ad.loginHead}>
          <div style={ad.loginIcon}><Shield size={24} color="#fff"/></div>
          <h2 style={ad.loginTitle}>Admin Panel</h2>
          <p style={ad.loginSub}>CloudVault Administration</p>
        </div>
        <form onSubmit={handleAdminLogin} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={ad.field}>
            <label style={ad.lbl}>Admin Email</label>
            <div style={ad.iw}>
              <Mail size={14} color="#475569" style={{position:'absolute',left:12}}/>
              <input style={ad.inp} type="email" placeholder="admin@cloudvault.com" value={loginForm.email} onChange={e=>setLoginForm(p=>({...p,email:e.target.value}))} required/>
            </div>
          </div>
          <div style={ad.field}>
            <label style={ad.lbl}>Password</label>
            <div style={ad.iw}>
              <Shield size={14} color="#475569" style={{position:'absolute',left:12}}/>
              <input style={ad.inp} type="password" placeholder="••••••••" value={loginForm.password} onChange={e=>setLoginForm(p=>({...p,password:e.target.value}))} required/>
            </div>
          </div>
          <button style={ad.loginBtn} disabled={loading}>{loading?'Logging in…':'Sign In as Admin'}</button>
        </form>
        <p style={{textAlign:'center',marginTop:16,fontSize:12,color:'#334155'}}>Default: admin@cloudvault.com / Admin@123</p>
        <p style={{textAlign:'center',marginTop:8,fontSize:12}}><a href="/" style={{color:'#818cf8',textDecoration:'none'}}>← Back to App</a></p>
      </div>
    </div>
  );

  return (
    <div style={ad.bg}>
      <nav style={ad.nav}>
        <div style={ad.navInner}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={ad.navIcon}><Cloud size={16} color="#fff"/></div>
            {!isMobile && <span style={ad.navTitle}>CloudVault</span>}
            <span style={ad.navBadge}>Admin</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <a href="/" style={ad.navLink}>{isMobile?'App':'← User App'}</a>
            <button style={ad.refreshBtn} onClick={fetchAll} disabled={loading}><RefreshCw size={14} color="#475569" className={loading?'spin':''}/></button>
            <button style={ad.logoutBtn} onClick={logout}><LogOut size={13}/> {!isMobile&&'Logout'}</button>
          </div>
        </div>
      </nav>

      <div style={{...ad.page, padding: isMobile?'16px 12px':'24px 16px'}}>
        <div style={ad.container}>
          <h1 style={ad.pageTitle}>Dashboard</h1>

          {stats && (
            <div style={{...ad.statsGrid, gridTemplateColumns: isMobile?'1fr 1fr':'repeat(auto-fit,minmax(200px,1fr))'}}>
              <StatCard icon={Users}     label="Total Users" value={stats.totalUsers} color="#818cf8" sub={`${stats.planCounts?.free||0} free`}/>
              <StatCard icon={Crown}     label="Pro Users"   value={stats.planCounts?.pro||0} color="#34d399"/>
              <StatCard icon={Building2} label="Business"    value={stats.planCounts?.business||0} color="#f59e0b"/>
              <StatCard icon={HardDrive} label="Total Files" value={stats.totalFiles} color="#60a5fa" sub={fmtBytes(stats.totalSize)}/>
            </div>
          )}

          <div style={ad.tableCard}>
            <div style={ad.tableHead}>
              <h2 style={ad.tableTitle}>All Users ({filtered.length})</h2>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',width: isMobile?'100%':'auto'}}>
                <input style={{...ad.search, flex: isMobile?1:undefined}} placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
                <select style={ad.select} value={planFilter} onChange={e=>setPlanFilter(e.target.value)}>
                  <option value="all">All</option><option value="free">Free</option><option value="pro">Pro</option><option value="business">Business</option>
                </select>
              </div>
            </div>

            {isMobile ? (
              <div style={{padding:'4px 12px 12px'}}>
                {filtered.map(u=>(
                  <div key={u.id} style={ad.mobileUserCard}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                      <div><p style={{fontSize:13,fontWeight:600,color:'#e2e8f0',margin:0}}>{u.name}</p><p style={{fontSize:11,color:'#475569',margin:0}}>{u.email}</p></div>
                      {u.role!=='admin' && <button style={ad.delBtn} onClick={()=>deleteUser(u.id,u.name)}><Trash2 size={13} color="#ef4444"/></button>}
                    </div>
                    <div style={{display:'flex',gap:10,fontSize:11,color:'#64748b',marginBottom:8}}>
                      <span>{fmtBytes(u.storageUsed||0)}</span><span>·</span><span>{u.fileCount||0} files</span>
                    </div>
                    <select style={{...ad.planSelect,width:'100%'}} value={u.plan} onChange={e=>changePlan(u.id,e.target.value)} disabled={u.role==='admin'}>
                      <option value="free">Free</option><option value="pro">Pro</option><option value="business">Business</option>
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={ad.table}>
                  <thead><tr style={ad.thr}>
                    <th style={ad.th}>User</th><th style={ad.th}>Plan</th><th style={ad.th}>Storage</th><th style={ad.th}>Files</th><th style={ad.th}>Joined</th><th style={ad.th}>Actions</th>
                  </tr></thead>
                  <tbody>
                    {loading && !users.length ? (
                      <tr><td colSpan={6} style={{textAlign:'center',padding:40,color:'#334155'}}>Loading…</td></tr>
                    ) : filtered.map(u=>(
                      <tr key={u.id} style={ad.tr} onMouseEnter={e=>e.currentTarget.style.background='rgba(99,102,241,0.04)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={ad.td}><p style={{fontSize:13,fontWeight:600,color:'#e2e8f0',margin:0}}>{u.name}</p><p style={{fontSize:11,color:'#475569',margin:0}}>{u.email}</p></td>
                        <td style={ad.td}>
                          <select style={{...ad.planSelect, background:u.plan==='business'?'rgba(245,158,11,0.1)':u.plan==='pro'?'rgba(16,185,129,0.1)':'rgba(99,102,241,0.1)', color:u.plan==='business'?'#f59e0b':u.plan==='pro'?'#34d399':'#818cf8'}} value={u.plan} onChange={e=>changePlan(u.id,e.target.value)} disabled={u.role==='admin'}>
                            <option value="free">Free</option><option value="pro">Pro</option><option value="business">Business</option>
                          </select>
                        </td>
                        <td style={ad.td}><span style={{fontSize:12,color:'#94a3b8'}}>{fmtBytes(u.storageUsed||0)}</span></td>
                        <td style={ad.td}><span style={{fontSize:12,color:'#94a3b8'}}>{u.fileCount||0}</span></td>
                        <td style={ad.td}><span style={{fontSize:11,color:'#475569'}}>{u.createdAt?new Date(u.createdAt).toLocaleDateString('en-IN'):'-'}</span></td>
                        <td style={ad.td}>{u.role!=='admin' ? <button style={ad.delBtn} onClick={()=>deleteUser(u.id,u.name)}><Trash2 size={13} color="#ef4444"/></button> : <span style={{fontSize:11,color:'#334155'}}>Admin</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const ad = {
  loginBg:{minHeight:'100vh',background:'#060b18',display:'flex',alignItems:'center',justifyContent:'center',padding:16},
  loginCard:{background:'rgba(10,18,35,0.9)',border:'1px solid #1e293b',borderRadius:20,padding:'36px 32px',width:'100%',maxWidth:380,boxShadow:'0 25px 60px rgba(0,0,0,0.6)'},
  loginHead:{textAlign:'center',marginBottom:28},
  loginIcon:{width:50,height:50,borderRadius:14,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'},
  loginTitle:{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:700,color:'#f1f5f9',margin:'0 0 4px'},
  loginSub:{fontSize:13,color:'#475569'},
  field:{display:'flex',flexDirection:'column',gap:6},
  lbl:{fontSize:12,fontWeight:600,color:'#64748b'},
  iw:{position:'relative',display:'flex',alignItems:'center'},
  inp:{width:'100%',padding:'11px 13px 11px 36px',background:'rgba(6,11,24,0.8)',border:'1px solid #1e293b',borderRadius:10,color:'#f1f5f9',fontSize:14,boxSizing:'border-box'},
  loginBtn:{padding:'12px',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:700,cursor:'pointer',marginTop:4},
  bg:{minHeight:'100vh',background:'#060b18',fontFamily:"'Inter',sans-serif"},
  nav:{background:'rgba(6,11,24,0.95)',borderBottom:'1px solid #0f172a',backdropFilter:'blur(12px)',position:'sticky',top:0,zIndex:100},
  navInner:{maxWidth:1100,margin:'0 auto',padding:'0 16px',height:54,display:'flex',alignItems:'center',justifyContent:'space-between'},
  navIcon:{width:30,height:30,borderRadius:8,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center'},
  navTitle:{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:700,color:'#f1f5f9'},
  navBadge:{fontSize:10,fontWeight:700,color:'#818cf8',background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:20,padding:'2px 8px'},
  navLink:{fontSize:12,color:'#475569',textDecoration:'none'},
  refreshBtn:{background:'rgba(15,23,42,0.6)',border:'1px solid #1e293b',borderRadius:7,padding:6,cursor:'pointer',display:'flex'},
  logoutBtn:{display:'flex',alignItems:'center',gap:5,background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.15)',color:'#f87171',borderRadius:7,padding:'5px 10px',fontSize:12,cursor:'pointer'},
  page:{},
  container:{maxWidth:1100,margin:'0 auto'},
  pageTitle:{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:700,color:'#f1f5f9',marginBottom:18},
  statsGrid:{display:'grid',gap:12,marginBottom:22},
  statCard:{background:'rgba(10,18,35,0.8)',border:'1px solid #0f172a',borderRadius:14,padding:'14px 16px',display:'flex',alignItems:'center',gap:12},
  statIcon:{width:40,height:40,borderRadius:11,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0},
  statVal:{fontFamily:"'Space Grotesk',sans-serif",fontSize:19,fontWeight:700,color:'#f1f5f9',margin:0},
  statLbl:{fontSize:11,color:'#475569',margin:'2px 0 0'},
  statSub:{fontSize:10,color:'#334155',margin:'2px 0 0'},
  tableCard:{background:'rgba(10,18,35,0.8)',border:'1px solid #0f172a',borderRadius:16,overflow:'hidden'},
  tableHead:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',borderBottom:'1px solid #0f172a',flexWrap:'wrap',gap:10},
  tableTitle:{fontFamily:"'Space Grotesk',sans-serif",fontSize:14,fontWeight:700,color:'#f1f5f9',margin:0},
  search:{padding:'7px 11px',background:'rgba(6,11,24,0.8)',border:'1px solid #1e293b',borderRadius:8,color:'#f1f5f9',fontSize:12,minWidth:120},
  select:{padding:'7px 10px',background:'rgba(6,11,24,0.8)',border:'1px solid #1e293b',borderRadius:8,color:'#94a3b8',fontSize:12},
  table:{width:'100%',borderCollapse:'collapse'},
  thr:{background:'rgba(6,11,24,0.5)'},
  th:{padding:'9px 14px',fontSize:10,fontWeight:700,color:'#334155',textTransform:'uppercase',letterSpacing:0.7,textAlign:'left'},
  tr:{borderBottom:'1px solid #0a1120',transition:'background 0.15s'},
  td:{padding:'11px 14px',verticalAlign:'middle'},
  planSelect:{padding:'4px 8px',borderRadius:20,fontSize:11,fontWeight:700,cursor:'pointer',border:'1px solid rgba(99,102,241,0.3)'},
  delBtn:{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:7,padding:'6px 8px',cursor:'pointer',display:'flex',alignItems:'center'},
  mobileUserCard:{background:'rgba(6,11,24,0.5)',border:'1px solid #0f172a',borderRadius:12,padding:12,marginBottom:8},
};

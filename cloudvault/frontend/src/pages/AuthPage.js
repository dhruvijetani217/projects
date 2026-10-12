import React,{useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {useIsMobile} from '../hooks/useMediaQuery';
import toast from 'react-hot-toast';
import {Cloud,Lock,Mail,User,Eye,EyeOff,HardDrive,Zap,Shield} from 'lucide-react';

export default function AuthPage() {
  const isMobile = useIsMobile();
  const [isLogin,  setIsLogin]  = useState(true);
  const [form,     setForm]     = useState({name:'',email:'',password:''});
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const {login, register} = useAuth();

  const set = k => e => setForm(p=>({...p,[k]:e.target.value}));

  const submit = async e => {
    e.preventDefault(); setLoading(true);
    try {
      if(isLogin){ await login(form.email,form.password); toast.success('Welcome back!'); }
      else       { await register(form.name,form.email,form.password); toast.success('Account created! 1GB free storage ready 🎉'); }
    } catch(err) { toast.error(err.response?.data?.error||'Something went wrong'); }
    finally { setLoading(false); }
  };

  return (
    <div style={s.bg}>
      <div style={{...s.blob, top:'-15%', left:'-10%', width: isMobile?300:600, height: isMobile?300:600}}/>
      <div style={{...s.blob2, bottom:'-15%', right:'-10%', width: isMobile?250:500, height: isMobile?250:500}}/>

      <div style={{...s.wrap, flexDirection: isMobile?'column':'row'}}>
        {!isMobile && (
          <div style={s.leftPanel}>
            <div style={s.brand}>
              <div style={s.brandIcon}><Cloud size={28} color="#fff"/></div>
              <span style={s.brandName}>CloudVault</span>
            </div>
            <h1 style={s.hero}>Your files,<br/>always safe.</h1>
            <p style={s.heroSub}>Secure cloud storage powered by MinIO. Start free, scale as you grow — on any device.</p>
            <div style={s.features}>
              {[[HardDrive,'1GB free storage','No credit card needed'],[Zap,'Folder & file uploads','Drag & drop, mobile too'],[Shield,'Secure & private','Your data, your control']].map(([Icon,title,sub])=>(
                <div key={title} style={s.feat}>
                  <div style={s.featIcon}><Icon size={18} color="#818cf8"/></div>
                  <div><p style={s.featTitle}>{title}</p><p style={s.featSub}>{sub}</p></div>
                </div>
              ))}
            </div>
            <div style={s.statsRow}>
              {[['1GB','Free'],['100GB','Pro'],['1TB','Business']].map(([v,l])=>(
                <div key={l} style={s.stat}><span style={s.statVal}>{v}</span><span style={s.statLbl}>{l}</span></div>
              ))}
            </div>
          </div>
        )}

        <div style={{...s.card, maxWidth: isMobile?'100%':420, borderRadius: isMobile?20:24, padding: isMobile?'28px 22px':'36px 32px'}}>
          {isMobile && (
            <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:24,justifyContent:'center'}}>
              <div style={{...s.brandIcon,width:36,height:36}}><Cloud size={20} color="#fff"/></div>
              <span style={{...s.brandName,fontSize:19}}>CloudVault</span>
            </div>
          )}

          <h2 style={s.title}>{isLogin ? 'Sign in' : 'Get started'}</h2>
          <p style={s.sub}>{isLogin ? 'Welcome back to CloudVault' : 'Create your free account today'}</p>

          <form onSubmit={submit} style={s.form}>
            {!isLogin && (
              <div style={s.field}>
                <label style={s.label}>Full name</label>
                <div style={s.inputWrap}>
                  <User size={15} color="#475569" style={s.inputIcon}/>
                  <input style={s.input} placeholder="John Doe" value={form.name} onChange={set('name')} required autoComplete="name"/>
                </div>
              </div>
            )}
            <div style={s.field}>
              <label style={s.label}>Email address</label>
              <div style={s.inputWrap}>
                <Mail size={15} color="#475569" style={s.inputIcon}/>
                <input style={s.input} type="email" inputMode="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required autoComplete="email"/>
              </div>
            </div>
            <div style={s.field}>
              <label style={s.label}>Password</label>
              <div style={s.inputWrap}>
                <Lock size={15} color="#475569" style={s.inputIcon}/>
                <input style={{...s.input,paddingRight:44}} type={showPass?'text':'password'} placeholder="••••••••" value={form.password} onChange={set('password')} required autoComplete={isLogin?'current-password':'new-password'}/>
                <button type="button" onClick={()=>setShowPass(!showPass)} style={s.eyeBtn}>
                  {showPass?<EyeOff size={15} color="#475569"/>:<Eye size={15} color="#475569"/>}
                </button>
              </div>
            </div>

            <button style={{...s.btn, opacity:loading?0.7:1}} disabled={loading}>
              {loading ? 'Please wait…' : (isLogin ? 'Sign In →' : 'Create Free Account →')}
            </button>
          </form>

          <p style={s.toggle}>
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button style={s.link} onClick={()=>setIsLogin(!isLogin)}>
              {isLogin ? 'Sign up free' : 'Sign in'}
            </button>
          </p>

          {!isLogin && (
            <div style={s.freeBadge}>✨ Free: 1GB · 100MB per file · No card needed</div>
          )}

          <p style={s.adminHint}>
            Admin? <a href="/admin" style={{color:'#818cf8',textDecoration:'none'}}>Admin Panel →</a>
          </p>
        </div>
      </div>
    </div>
  );
}

const s = {
  bg:       {minHeight:'100vh',background:'#060b18',display:'flex',alignItems:'center',justifyContent:'center',padding:16,position:'relative',overflow:'hidden'},
  blob:     {position:'absolute',borderRadius:'50%',pointerEvents:'none',background:'radial-gradient(circle,rgba(99,102,241,0.15),transparent 70%)'},
  blob2:    {position:'absolute',borderRadius:'50%',pointerEvents:'none',background:'radial-gradient(circle,rgba(139,92,246,0.12),transparent 70%)'},
  wrap:     {display:'flex',gap:40,alignItems:'center',maxWidth:960,width:'100%',position:'relative',zIndex:1},
  leftPanel:{flex:1,padding:'20px 0'},
  brand:    {display:'flex',alignItems:'center',gap:10,marginBottom:40},
  brandIcon:{width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center'},
  brandName:{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:700,color:'#f1f5f9'},
  hero:     {fontFamily:"'Space Grotesk',sans-serif",fontSize:40,fontWeight:700,color:'#f1f5f9',lineHeight:1.2,marginBottom:16},
  heroSub:  {fontSize:15,color:'#64748b',marginBottom:32,lineHeight:1.6,maxWidth:380},
  features: {display:'flex',flexDirection:'column',gap:18,marginBottom:32},
  feat:     {display:'flex',alignItems:'flex-start',gap:14},
  featIcon: {width:36,height:36,borderRadius:10,background:'rgba(99,102,241,0.12)',border:'1px solid rgba(99,102,241,0.2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0},
  featTitle:{fontSize:14,fontWeight:600,color:'#e2e8f0',marginBottom:2},
  featSub:  {fontSize:12,color:'#475569'},
  statsRow: {display:'flex',gap:24},
  stat:     {display:'flex',flexDirection:'column'},
  statVal:  {fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:700,color:'#818cf8'},
  statLbl:  {fontSize:11,color:'#475569',marginTop:2},
  card:     {background:'rgba(15,23,42,0.85)',backdropFilter:'blur(20px)',border:'1px solid rgba(51,65,85,0.6)',width:'100%',boxShadow:'0 25px 60px rgba(0,0,0,0.5)'},
  title:    {fontFamily:"'Space Grotesk',sans-serif",fontSize:24,fontWeight:700,color:'#f1f5f9',margin:'0 0 6px'},
  sub:      {fontSize:13,color:'#64748b',margin:'0 0 24px'},
  form:     {display:'flex',flexDirection:'column',gap:15},
  field:    {display:'flex',flexDirection:'column',gap:6},
  label:    {fontSize:12,fontWeight:600,color:'#94a3b8'},
  inputWrap:{position:'relative',display:'flex',alignItems:'center'},
  inputIcon:{position:'absolute',left:13,pointerEvents:'none'},
  input:    {width:'100%',padding:'13px 13px 13px 38px',background:'rgba(6,11,24,0.9)',border:'1px solid #1e293b',borderRadius:10,color:'#f1f5f9',fontSize:15,boxSizing:'border-box'},
  eyeBtn:   {position:'absolute',right:11,background:'none',border:'none',cursor:'pointer',padding:4,display:'flex'},
  btn:      {padding:'14px',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:600,cursor:'pointer',marginTop:4},
  toggle:   {textAlign:'center',color:'#64748b',fontSize:13,marginTop:20},
  link:     {background:'none',border:'none',color:'#818cf8',cursor:'pointer',fontSize:13,fontWeight:600},
  freeBadge:{marginTop:16,padding:'10px 14px',background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:10,fontSize:12,color:'#a5b4fc',textAlign:'center'},
  adminHint:{textAlign:'center',marginTop:16,fontSize:12,color:'#334155'},
};

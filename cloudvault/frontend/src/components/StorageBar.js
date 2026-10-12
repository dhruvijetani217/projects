import React from 'react';
import {HardDrive,Crown,Building2,Zap} from 'lucide-react';
import {fmtBytes,daysLeft} from '../utils/format';

const PLAN_META = {
  free:     { label: 'Free',     color: '#818cf8', bg:'rgba(99,102,241,0.12)',  border:'rgba(99,102,241,0.3)',  icon: null },
  pro:      { label: 'Pro',      color: '#34d399', bg:'rgba(16,185,129,0.12)',  border:'rgba(16,185,129,0.3)',  icon: Zap },
  business: { label: 'Business', color: '#f59e0b', bg:'rgba(245,158,11,0.12)', border:'rgba(245,158,11,0.3)',  icon: Building2 },
};

export default function StorageBar({used,limit,plan,subscriptionEnd,onUpgrade}) {
  const pct      = Math.min((used/limit)*100,100);
  const nearFull = pct > 80;
  const meta     = PLAN_META[plan] || PLAN_META.free;
  const Icon     = meta.icon;
  const left     = daysLeft(subscriptionEnd);

  const barColor = nearFull
    ? 'linear-gradient(90deg,#f59e0b,#ef4444)'
    : plan==='business' ? 'linear-gradient(90deg,#f59e0b,#fb923c)'
    : plan==='pro'       ? 'linear-gradient(90deg,#10b981,#06b6d4)'
    : 'linear-gradient(90deg,#6366f1,#8b5cf6)';

  return (
    <div style={s.wrap}>
      <div style={s.top}>
        <div style={s.left}>
          <HardDrive size={15} color={nearFull?'#f59e0b':meta.color}/>
          <span style={s.lbl}>Storage</span>
          <span style={{...s.badge, background:meta.bg, color:meta.color, border:`1px solid ${meta.border}`}}>
            {Icon && <Icon size={10}/>} {meta.label}
          </span>
          {left!==null && plan!=='free' && (
            <span style={s.expiry}>{left}d left</span>
          )}
        </div>
        <span style={s.size}>{fmtBytes(used)} <span style={{color:'#334155'}}>/ {fmtBytes(limit)}</span></span>
      </div>

      <div style={s.track}>
        <div style={{...s.fill,width:`${pct}%`,background:barColor}}/>
      </div>

      <div style={s.bottom}>
        <span style={{fontSize:11,color:nearFull?'#f59e0b':'#334155'}}>{pct.toFixed(1)}% used</span>
        {plan!=='business' && (
          <button onClick={onUpgrade} style={s.upgradeBtn}>
            <Crown size={11}/> {plan==='free'?'Upgrade Plan':'Go Business'}
          </button>
        )}
      </div>
    </div>
  );
}

const s = {
  wrap:       {background:'rgba(15,23,42,0.6)',border:'1px solid #1e293b',borderRadius:14,padding:'14px 16px',marginBottom:18},
  top:        {display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,flexWrap:'wrap',gap:6},
  left:       {display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'},
  lbl:        {fontSize:13,fontWeight:600,color:'#cbd5e1'},
  badge:      {fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:20,display:'flex',alignItems:'center',gap:3},
  expiry:     {fontSize:10,color:'#475569',background:'rgba(15,23,42,0.6)',padding:'2px 7px',borderRadius:20},
  size:       {fontSize:12,color:'#94a3b8',fontVariantNumeric:'tabular-nums'},
  track:      {height:6,background:'rgba(6,11,24,0.8)',borderRadius:99,overflow:'hidden'},
  fill:       {height:'100%',borderRadius:99,transition:'width 0.6s cubic-bezier(0.4,0,0.2,1)'},
  bottom:     {display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:8},
  upgradeBtn: {display:'flex',alignItems:'center',gap:4,background:'linear-gradient(135deg,#f59e0b,#ef4444)',color:'#fff',border:'none',borderRadius:20,padding:'4px 12px',fontSize:11,fontWeight:700,cursor:'pointer'},
};

import React,{useState} from 'react';
import {Check,Zap,Crown,Building2,ArrowLeft,CreditCard} from 'lucide-react';
import {useIsMobile} from '../hooks/useMediaQuery';
import {useAuth} from '../context/AuthContext';
import api from '../utils/api';
import toast from 'react-hot-toast';

const PLANS = [
  {
    id: 'free', name: 'Free', icon: null,
    priceInr: 0, priceUsd: 0,
    storage: '1 GB', fileSize: '100 MB',
    features: ['1GB cloud storage','100MB max file size','Basic file management','Email support'],
    cta: 'Current Plan', highlight: false,
  },
  {
    id: 'pro', name: 'Pro', icon: Zap,
    priceInr: { monthly: 299, yearly: 2399 }, priceUsd: { monthly: 4.99, yearly: 39.99 },
    storage: '100 GB', fileSize: '5 GB',
    features: ['100GB cloud storage','5GB max file size','Folder uploads','Priority support','Faster transfer speeds'],
    cta: 'Upgrade to Pro', highlight: true,
  },
  {
    id: 'business', name: 'Business', icon: Building2,
    priceInr: { monthly: 799, yearly: 6399 }, priceUsd: { monthly: 12.99, yearly: 99.99 },
    storage: '1 TB', fileSize: '20 GB',
    features: ['1TB cloud storage','20GB max file size','Unlimited folder uploads','24/7 priority support','Team sharing (soon)','API access (soon)'],
    cta: 'Upgrade to Business', highlight: false,
  },
];

export default function PricingPage({onClose, onUpgraded}) {
  const isMobile = useIsMobile();
  const {refreshUser} = useAuth();
  const [billing,  setBilling]  = useState('monthly');
  const [currency, setCurrency] = useState('inr'); // inr | usd
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [method, setMethod] = useState(null); // which plan is asking for payment method

  const [demoConfirm, setDemoConfirm] = useState(null); // {plan, provider} pending confirmation

  const startPayment = async (plan, provider) => {
    setLoadingPlan(plan.id);
    try {
      if (provider === 'razorpay') {
        const res = await api.post('/auth/razorpay/create-order', { plan: plan.id, billing });
        if (res.data.demoMode) {
          // Keys not configured — do NOT silently upgrade. Ask for explicit confirmation.
          setLoadingPlan(null);
          setDemoConfirm({ plan, provider });
          return;
        }
        const { orderId, amount, currency: cur, keyId } = res.data;
        if (!window.Razorpay) {
          await new Promise((res2,rej)=>{
            const sc=document.createElement('script');
            sc.src='https://checkout.razorpay.com/v1/checkout.js';
            sc.onload=res2; sc.onerror=rej;
            document.body.appendChild(sc);
          });
        }
        // Opens REAL Razorpay checkout — UPI/Card/NetBanking scanner shows here.
        // Plan upgrades ONLY inside handler(), which fires ONLY after successful payment.
        const rzp = new window.Razorpay({
          key: keyId, amount, currency: cur,
          name: 'CloudVault', description: `${plan.name} Plan — ${billing}`,
          order_id: orderId,
          theme: { color: '#6366f1' },
          handler: async (response) => {
            try {
              await api.post('/auth/razorpay/verify', {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan: plan.id, billing,
              });
              await refreshUser();
              toast.success(`🎉 Payment successful! ${plan.name} activated!`);
              onUpgraded?.();
            } catch { toast.error('Payment received but verification failed. Contact support with your payment ID.'); }
            finally { setLoadingPlan(null); }
          },
          modal: {
            ondismiss: () => { setLoadingPlan(null); toast('Payment cancelled — plan not changed.', { icon: 'ℹ️' }); },
          },
        });
        rzp.on('payment.failed', () => {
          setLoadingPlan(null);
          toast.error('Payment failed. Plan not changed — please try again.');
        });
        rzp.open();
        return; // don't fall through to finally below; loading is cleared by handler/dismiss/failed
      } else {
        // Stripe
        const res = await api.post('/auth/stripe/create-session', { plan: plan.id, billing });
        if (res.data.demoMode) {
          setLoadingPlan(null);
          setDemoConfirm({ plan, provider });
          return;
        }
        // Redirects to REAL Stripe Checkout page (hosted by Stripe).
        // Plan upgrades only after success_url is hit + /stripe/verify confirms payment_status === 'paid'.
        window.location.href = res.data.url;
        return;
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Payment failed');
      setLoadingPlan(null);
    }
  };

  const confirmDemoUpgrade = async () => {
    if (!demoConfirm) return;
    const { plan, provider } = demoConfirm;
    setLoadingPlan(plan.id);
    try {
      const endpoint = provider === 'razorpay' ? '/auth/razorpay/verify' : '/auth/stripe/verify';
      await api.post(endpoint, { demoMode: true, plan: plan.id, billing });
      await refreshUser();
      toast.success(`🎉 ${plan.name} activated in DEMO mode (no real payment was made).`);
      onUpgraded?.();
    } catch { toast.error('Demo activation failed'); }
    finally { setLoadingPlan(null); setDemoConfirm(null); }
  };

  const sym = currency === 'inr' ? '₹' : '$';
  const getPrice = (plan) => {
    if (plan.id === 'free') return 0;
    const obj = currency === 'inr' ? plan.priceInr : plan.priceUsd;
    return obj[billing];
  };

  return (
    <div style={s.overlay}>
      <div style={s.page}>
        {/* Header */}
        <div style={s.header}>
          <button style={s.backBtn} onClick={onClose}><ArrowLeft size={18}/></button>
          <h1 style={s.headerTitle}>Choose your plan</h1>
          <div style={{width:36}}/>
        </div>

        <div style={s.container}>
          <p style={s.subtitle}>Upgrade anytime. Cancel anytime. No hidden fees.</p>

          {/* Billing toggle */}
          <div style={s.toggleRow}>
            <div style={s.billingToggle}>
              <button style={{...s.toggleBtn,...(billing==='monthly'?s.toggleActive:{})}} onClick={()=>setBilling('monthly')}>Monthly</button>
              <button style={{...s.toggleBtn,...(billing==='yearly'?s.toggleActive:{})}} onClick={()=>setBilling('yearly')}>
                Yearly <span style={s.saveBadge}>Save 33%</span>
              </button>
            </div>
            <div style={s.currencyToggle}>
              <button style={{...s.curBtn,...(currency==='inr'?s.curActive:{})}} onClick={()=>setCurrency('inr')}>₹ INR</button>
              <button style={{...s.curBtn,...(currency==='usd'?s.curActive:{})}} onClick={()=>setCurrency('usd')}>$ USD</button>
            </div>
          </div>

          {/* Plan cards */}
          <div style={{...s.grid, gridTemplateColumns: isMobile?'1fr':'repeat(3,1fr)'}}>
            {PLANS.map(plan=>{
              const Icon = plan.icon;
              const price = getPrice(plan);
              return (
                <div key={plan.id} style={{...s.planCard,...(plan.highlight?s.planCardHighlight:{})}}>
                  {plan.highlight && <div style={s.popularBadge}>MOST POPULAR</div>}
                  <div style={s.planHead}>
                    {Icon && <div style={{...s.planIcon, background: plan.id==='pro'?'rgba(99,102,241,0.15)':'rgba(245,158,11,0.15)'}}><Icon size={20} color={plan.id==='pro'?'#818cf8':'#f59e0b'}/></div>}
                    <span style={s.planName}>{plan.name}</span>
                  </div>

                  <div style={s.priceRow}>
                    <span style={s.priceVal}>{plan.id==='free' ? 'Free' : `${sym}${price}`}</span>
                    {plan.id!=='free' && <span style={s.pricePer}>/{billing==='monthly'?'mo':'yr'}</span>}
                  </div>
                  <p style={s.storageText}>{plan.storage} storage · {plan.fileSize} per file</p>

                  <div style={s.featList}>
                    {plan.features.map(f=>(
                      <div key={f} style={s.featRow}>
                        <Check size={14} color={plan.highlight?'#818cf8':'#34d399'} style={{flexShrink:0,marginTop:2}}/>
                        <span style={s.featText}>{f}</span>
                      </div>
                    ))}
                  </div>

                  {plan.id === 'free' ? (
                    <button style={s.currentBtn} disabled>Current Plan</button>
                  ) : method === plan.id ? (
                    <div style={s.methodRow}>
                      <button style={s.methodBtn} onClick={()=>startPayment(plan,'razorpay')} disabled={loadingPlan===plan.id}>
                        🇮🇳 UPI / Card / NetBanking
                      </button>
                      <button style={s.methodBtn} onClick={()=>startPayment(plan,'stripe')} disabled={loadingPlan===plan.id}>
                        🌍 Stripe (Intl. Cards)
                      </button>
                      <button style={s.methodCancel} onClick={()=>setMethod(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      style={{...s.ctaBtn,...(plan.highlight?s.ctaHighlight:{}),opacity:loadingPlan===plan.id?0.7:1}}
                      onClick={()=>setMethod(plan.id)}
                      disabled={loadingPlan===plan.id}
                    >
                      <CreditCard size={14}/> {loadingPlan===plan.id?'Processing…':plan.cta}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p style={s.footer}>
            🔒 Payments secured by Razorpay & Stripe · Cancel anytime from your dashboard
          </p>
        </div>
      </div>

      {/* Demo mode confirmation — only shown when NO real keys are configured */}
      {demoConfirm && (
        <div style={s.demoOverlay} onClick={()=>setDemoConfirm(null)}>
          <div style={s.demoModal} onClick={e=>e.stopPropagation()}>
            <div style={s.demoIconWrap}>⚠️</div>
            <h3 style={s.demoTitle}>No payment gateway configured</h3>
            <p style={s.demoText}>
              {demoConfirm.provider === 'razorpay' ? 'Razorpay' : 'Stripe'} API keys are not set up on this server,
              so a real checkout/scanner cannot open.
            </p>
            <p style={s.demoText}>
              You can activate <b>{demoConfirm.plan.name}</b> in <b>demo mode</b> for testing —
              <b> no real money will be charged</b>, and this is only meant for development.
            </p>
            <div style={s.demoActions}>
              <button style={s.demoCancelBtn} onClick={()=>setDemoConfirm(null)}>Cancel</button>
              <button style={s.demoConfirmBtn} onClick={confirmDemoUpgrade} disabled={loadingPlan===demoConfirm.plan.id}>
                {loadingPlan===demoConfirm.plan.id ? 'Activating…' : 'Activate Demo Anyway'}
              </button>
            </div>
            <p style={s.demoHint}>To enable real payments, add your keys in <code style={s.code}>backend/.env</code> (see STEPS.md)</p>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  overlay:    {position:'fixed',inset:0,background:'#060b18',zIndex:1000,overflowY:'auto'},
  page:       {minHeight:'100vh'},
  header:     {display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',position:'sticky',top:0,background:'rgba(6,11,24,0.9)',backdropFilter:'blur(12px)',borderBottom:'1px solid #0f172a',zIndex:10},
  backBtn:    {background:'rgba(15,23,42,0.8)',border:'1px solid #1e293b',borderRadius:9,padding:8,cursor:'pointer',display:'flex',color:'#94a3b8'},
  headerTitle:{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:700,color:'#f1f5f9'},
  container:  {maxWidth:1000,margin:'0 auto',padding:'24px 16px 60px'},
  subtitle:   {textAlign:'center',color:'#64748b',fontSize:14,marginBottom:24},
  toggleRow:  {display:'flex',flexDirection:'column',alignItems:'center',gap:14,marginBottom:32},
  billingToggle:{display:'flex',background:'rgba(15,23,42,0.6)',border:'1px solid #1e293b',borderRadius:12,padding:4},
  toggleBtn:  {padding:'8px 18px',background:'none',border:'none',borderRadius:9,fontSize:13,fontWeight:600,color:'#64748b',cursor:'pointer',display:'flex',alignItems:'center',gap:6},
  toggleActive:{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#fff'},
  saveBadge:  {background:'rgba(52,211,153,0.2)',color:'#34d399',fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:20},
  currencyToggle:{display:'flex',background:'rgba(15,23,42,0.6)',border:'1px solid #1e293b',borderRadius:10,padding:3},
  curBtn:     {padding:'5px 14px',background:'none',border:'none',borderRadius:8,fontSize:12,fontWeight:600,color:'#475569',cursor:'pointer'},
  curActive:  {background:'rgba(99,102,241,0.2)',color:'#a5b4fc'},
  grid:       {display:'grid',gap:18},
  planCard:   {background:'rgba(10,18,35,0.7)',border:'1px solid #0f172a',borderRadius:18,padding:24,position:'relative',display:'flex',flexDirection:'column'},
  planCardHighlight:{border:'1px solid rgba(99,102,241,0.4)',background:'linear-gradient(160deg,rgba(99,102,241,0.08),rgba(139,92,246,0.04))'},
  popularBadge:{position:'absolute',top:-11,left:'50%',transform:'translateX(-50%)',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#fff',fontSize:10,fontWeight:700,padding:'4px 14px',borderRadius:20,letterSpacing:0.6,whiteSpace:'nowrap'},
  planHead:   {display:'flex',alignItems:'center',gap:10,marginBottom:16},
  planIcon:   {width:38,height:38,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center'},
  planName:   {fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:700,color:'#f1f5f9'},
  priceRow:   {display:'flex',alignItems:'baseline',gap:4,marginBottom:4},
  priceVal:   {fontFamily:"'Space Grotesk',sans-serif",fontSize:32,fontWeight:700,color:'#f1f5f9'},
  pricePer:   {fontSize:14,color:'#64748b'},
  storageText:{fontSize:12,color:'#475569',marginBottom:20},
  featList:   {display:'flex',flexDirection:'column',gap:10,marginBottom:22,flex:1},
  featRow:    {display:'flex',alignItems:'flex-start',gap:8},
  featText:   {fontSize:13,color:'#94a3b8',lineHeight:1.4},
  currentBtn: {padding:'12px',background:'rgba(15,23,42,0.6)',border:'1px solid #1e293b',borderRadius:10,color:'#475569',fontSize:13,fontWeight:600,cursor:'not-allowed'},
  ctaBtn:     {padding:'12px',background:'rgba(15,23,42,0.8)',border:'1px solid #1e293b',color:'#cbd5e1',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6},
  ctaHighlight:{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',border:'none',color:'#fff'},
  methodRow:  {display:'flex',flexDirection:'column',gap:8},
  methodBtn:  {padding:'11px',background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.25)',borderRadius:9,color:'#cbd5e1',fontSize:12,fontWeight:600,cursor:'pointer'},
  methodCancel:{padding:'8px',background:'none',border:'none',color:'#475569',fontSize:11,cursor:'pointer'},
  footer:     {textAlign:'center',color:'#334155',fontSize:12,marginTop:30},
  demoOverlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:16,backdropFilter:'blur(4px)'},
  demoModal:  {background:'#0c1526',border:'1px solid rgba(245,158,11,0.3)',borderRadius:18,padding:28,maxWidth:420,width:'100%',textAlign:'center',boxShadow:'0 30px 70px rgba(0,0,0,0.6)'},
  demoIconWrap:{fontSize:32,marginBottom:14},
  demoTitle:  {fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:700,color:'#f1f5f9',marginBottom:12},
  demoText:   {fontSize:13,color:'#94a3b8',lineHeight:1.6,marginBottom:12,textAlign:'left'},
  demoActions:{display:'flex',gap:10,marginTop:16},
  demoCancelBtn:{flex:1,padding:'11px',background:'rgba(15,23,42,0.8)',border:'1px solid #1e293b',borderRadius:9,color:'#cbd5e1',fontSize:13,fontWeight:600,cursor:'pointer'},
  demoConfirmBtn:{flex:1,padding:'11px',background:'linear-gradient(135deg,#f59e0b,#ef4444)',border:'none',borderRadius:9,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'},
  demoHint:   {fontSize:11,color:'#475569',marginTop:14,lineHeight:1.5},
  code:       {background:'rgba(15,23,42,0.8)',border:'1px solid #1e293b',borderRadius:4,padding:'1px 5px',fontSize:11,color:'#a5b4fc'},
};

import React from 'react';
import {AuthProvider,useAuth} from './context/AuthContext';
import AuthPage   from './pages/AuthPage';
import Dashboard  from './pages/Dashboard';
import AdminPage  from './pages/AdminPage';
import {Toaster}  from 'react-hot-toast';

function AppContent() {
  const {user,loading} = useAuth();
  const path = window.location.pathname;

  if(path==='/admin' || path==='/admin/') return <AdminPage/>;

  if(loading) return (
    <div style={{minHeight:'100vh',background:'#060b18',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:32,height:32,border:'2px solid #1e293b',borderTopColor:'#6366f1',borderRadius:'50%',margin:'0 auto 12px',animation:'spin 0.8s linear infinite'}}/>
        <span style={{color:'#334155',fontSize:13}}>Loading CloudVault…</span>
      </div>
    </div>
  );

  return user ? <Dashboard/> : <AuthPage/>;
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" toastOptions={{
        style:{background:'#0c1526',color:'#f1f5f9',border:'1px solid #1e293b',fontFamily:'Inter,sans-serif',fontSize:13},
        success:{iconTheme:{primary:'#34d399',secondary:'#0c1526'}},
        error:  {iconTheme:{primary:'#ef4444',secondary:'#0c1526'}},
      }}/>
      <AppContent/>
    </AuthProvider>
  );
}

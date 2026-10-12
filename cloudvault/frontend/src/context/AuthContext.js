import React,{createContext,useContext,useState,useEffect} from 'react';
import api from '../utils/api';

const Ctx = createContext(null);

export function AuthProvider({children}) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    const token = localStorage.getItem('cv_token');
    if(token){
      api.get('/auth/me')
        .then(r=>setUser(r.data))
        .catch(()=>localStorage.removeItem('cv_token'))
        .finally(()=>setLoading(false));
    } else setLoading(false);
  },[]);

  const login = async(email,password)=>{
    const r = await api.post('/auth/login',{email,password});
    localStorage.setItem('cv_token', r.data.token);
    setUser(r.data.user);
    return r.data.user;
  };
  const register = async(name,email,password)=>{
    const r = await api.post('/auth/register',{name,email,password});
    localStorage.setItem('cv_token', r.data.token);
    setUser(r.data.user);
    return r.data.user;
  };
  const logout = ()=>{ localStorage.removeItem('cv_token'); setUser(null); };
  const refreshUser = async()=>{ const r=await api.get('/auth/me'); setUser(r.data); return r.data; };

  return <Ctx.Provider value={{user,loading,login,register,logout,refreshUser,setUser}}>{children}</Ctx.Provider>;
}

export const useAuth = ()=>useContext(Ctx);

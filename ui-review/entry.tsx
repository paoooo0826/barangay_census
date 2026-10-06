import React, {useState, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import '../src/index.css';
import {AuthProvider} from '../src/context/AuthContext';
import UserTypeSelection from '../src/pages/UserTypeSelection';
import ResidentAuth from '../src/pages/ResidentAuth';
import AdminAuth from '../src/pages/AdminAuth';
import ResidentDashboard from '../src/pages/ResidentDashboard';
import AdminDashboard from '../src/pages/AdminDashboard';
import CensusForm from '../src/pages/CensusForm';
import ResidentRegistration from '../src/pages/ResidentRegistration';
import AdminReview from '../src/pages/AdminReview';
function Review(){
 const [screen,setScreen]=useState(new URLSearchParams(location.search).get('screen')||'landing');
 const [tab,setTab]=useState(new URLSearchParams(location.hash.split('?')[1]||'').get('tab')||'dashboard');
 useEffect(()=>{const handler=()=>{setTab(new URLSearchParams(location.hash.split('?')[1]||'').get('tab')||'dashboard')};window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler)},[]);
 const noop=()=>{};const back=()=>setScreen('landing');
 return screen==='landing'?<UserTypeSelection onResident={()=>setScreen('resident-login')} onAdmin={()=>setScreen('admin-login')}/>:
 screen==='resident-login'?<ResidentAuth onBack={back} onLoginSuccess={()=>setScreen('resident')} onRegisterClick={()=>setScreen('registration')}/>:
 screen==='admin-login'?<AdminAuth onBack={back} onLoginSuccess={()=>setScreen('admin')}/>:
 screen==='resident'?<ResidentDashboard onLogout={back} onEdit={()=>setScreen('census')}/>:
 screen==='census'?<CensusForm onDashboard={()=>setScreen('resident')}/>:
 screen==='registration'?<ResidentRegistration email="resident0@example.invalid" onDashboard={()=>setScreen('census')} onBack={()=>setScreen('resident')}/>:
 screen==='review'?<AdminReview residentId="r0" onBack={()=>setScreen('admin')} onDecisionComplete={()=>setScreen('admin')}/>:
 <AdminDashboard tab={tab} onLogout={back} onReview={()=>setScreen('review')}/>;
}
createRoot(document.getElementById('root')!).render(<AuthProvider><Review/></AuthProvider>);

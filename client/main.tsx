import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
function App() {
  const [status, setStatus] = React.useState('Проверяем связь…');
  React.useEffect(() => { fetch('/api/health').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(() => setStatus('Сервер на связи')).catch(() => setStatus('Сервер недоступен')); }, []);
  return <main><p>ПРОТОКОЛ ВЫЖИВАНИЯ / 01</p><h1>BUNKER<span>LAST SHELTER</span></h1><p>Когда снаружи ничего не осталось — мы строим жизнь внутри.</p><p>{status}</p></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

import React from 'react';
import { createRoot } from 'react-dom/client';
import { useGame } from './network';
import { Menu, Lobby } from './Menu';
import './style.css';
function App() {
  const game = useGame();
  return <>{!game.state ? <Menu game={game}/> : game.state.phase === 'lobby' ? <Lobby game={game}/> : <div className="padded"><h1>Убежище {game.state.code}</h1><p>Герметизация завершена. Карта готовится.</p><button onClick={() => void game.leave()}>Выйти</button></div>}
    {game.error && <div className="toast error" role="alert">{game.error}<button onClick={() => game.setError('')} aria-label="Закрыть ошибку">✕</button></div>}{game.notice && <div className="toast" role="status">{game.notice}</div>}
    {game.state && !game.connected && <div className="connection-lost">Связь потеряна. Переподключаемся автоматически…</div>}</>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

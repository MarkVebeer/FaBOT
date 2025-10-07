import React, { useEffect, useState } from 'react';

function App() {
  const [user, setUser] = useState(null);
  const [guilds, setGuilds] = useState([]);
  const [clientId, setClientId] = useState('');
  const [botPermissions, setBotPermissions] = useState('8');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(data => {
        setUser(data.user);
        setGuilds(data.guilds);
        setClientId(data.client_id);
        setBotPermissions(data.bot_permissions);
      });
  }, []);

  const handleLogin = () => {
    window.location.href = '/login';
  };

  const handleLogout = () => {
    window.location.href = '/logout';
  };

  const handleRefresh = async () => {
    if (isRefreshing) return; // Prevent spam clicking
    
    setIsRefreshing(true);
    setRefreshError('');
    
    try {
      const res = await fetch('/api/refresh-guilds', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setGuilds(data.guilds);
      } else {
        setRefreshError('Hiba a frissítés során. Próbáld újra pár másodperc múlva.');
      }
    } catch (err) {
      setRefreshError('Hálózati hiba. Próbáld újra.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div style={{ padding: 32 }}>
      {!user ? (
        <button onClick={handleLogin}>Discord Login</button>
      ) : (
        <>
          <h1>Üdv, {user.username}!</h1>
          <button onClick={handleLogout}>Kijelentkezés</button>
          <button 
            style={{ 
              marginLeft: 12, 
              opacity: isRefreshing ? 0.6 : 1,
              cursor: isRefreshing ? 'not-allowed' : 'pointer'
            }} 
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Frissítés...' : 'Frissítés'}
          </button>
          {refreshError && (
            <div style={{ color: 'red', marginTop: 10, fontSize: 14 }}>
              {refreshError}
            </div>
          )}
          <div style={{ margin: '20px 0' }}>
            <a
              href={`https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot&permissions=${botPermissions}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <button>Bot hozzáadása szerverhez</button>
            </a>
          </div>
          <h2>Szerverek, ahol a bot bent van:</h2>
          <ul>
            {guilds.map(guild => (
              <li key={guild.id}>
                {guild.icon && (
                  <img
                    src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                    width={32}
                    height={32}
                    alt="icon"
                    style={{ verticalAlign: 'middle', marginRight: 8 }}
                  />
                )}
                {guild.name}
                <a href={`/dashboard/${guild.id}`} style={{ marginLeft: 12 }}>
                  <button>Megnyitás</button>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default App;

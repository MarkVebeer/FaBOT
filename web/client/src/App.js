import React, { useEffect, useState } from 'react';

function App() {
  const [user, setUser] = useState(null);
  const [guilds, setGuilds] = useState([]);
  const [clientId, setClientId] = useState('');
  const [botPermissions, setBotPermissions] = useState('8');

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

  return (
    <div style={{ padding: 32 }}>
      {!user ? (
        <button onClick={handleLogin}>Discord Login</button>
      ) : (
        <>
          <h1>Üdv, {user.username}!</h1>
          <button onClick={handleLogout}>Kijelentkezés</button>
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
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default App;

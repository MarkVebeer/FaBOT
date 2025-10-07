import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function GuildDashboard() {
  const { guildId } = useParams();
  const navigate = useNavigate();
  const [hasPermission, setHasPermission] = useState(null);
  const [guild, setGuild] = useState(null);
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [message, setMessage] = useState('');
  const [sendStatus, setSendStatus] = useState('');


  // Minden mount/guildId váltáskor ellenőrizzük a jogosultságokat
  useEffect(() => {
    // Permission check valós időben - ha nincs jogosultság, visszairányít
    fetch(`/api/guild/${guildId}/check-permission`)
      .then(res => {
        if (res.status === 403 || res.status === 401) {
          // Nincs jogosultság - visszairányítás a dashboard-ra
          alert('Nincs jogosultságod ehhez a szerverhez, vagy a jogosultságaid megváltoztak!');
          navigate('/dashboard');
          return;
        }
        return res.json();
      })
      .then(data => {
        if (data) {
          setHasPermission(data.hasManageServer);
        }
      })
      .catch(err => {
        console.error('Permission check error:', err);
        setHasPermission(false);
      });

    // Guild adatok lekérése
    fetch('/api/dashboard')
      .then(res => {
        if (res.status === 403 || res.status === 401) {
          navigate('/dashboard');
          return;
        }
        return res.json();
      })
      .then(data => {
        if (data) {
          const found = data.guilds.find(g => g.id === guildId);
          setGuild(found);
          if (!found) {
            // Guild nem található a listában - nincs jogosultság
            alert('Ez a szerver már nem érhető el a jogosultságaiddal!');
            navigate('/dashboard');
          }
        }
      })
      .catch(err => {
        console.error('Dashboard fetch error:', err);
      });
  }, [guildId, navigate]);

  useEffect(() => {
    if (hasPermission) {
      fetch(`/api/guild/${guildId}/channels`)
        .then(res => {
          if (res.status === 403 || res.status === 401) {
            alert('Nincs jogosultságod ehhez a szerverhez!');
            navigate('/dashboard');
            return;
          }
          return res.json();
        })
        .then(data => {
          if (data && Array.isArray(data)) {
            setChannels(data);
            if (data.length > 0) setSelectedChannel(data[0].id);
          } else {
            console.error('Channels response is not an array:', data);
            setChannels([]);
          }
        })
        .catch(err => {
          console.error('Error fetching channels:', err);
          setChannels([]);
        });
    }
  }, [hasPermission, guildId, navigate]);

  const handleSend = async () => {
    setSendStatus('');
    if (!selectedChannel || !message) {
      setSendStatus('Válassz csatornát és írj üzenetet!');
      return;
    }
    
    try {
      const res = await fetch(`/api/guild/${guildId}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: selectedChannel, message })
      });
      
      if (res.status === 403 || res.status === 401) {
        alert('Nincs jogosultságod ehhez a szerverhez! Jogosultságaid megváltoztak.');
        navigate('/dashboard');
        return;
      }
      
      if (res.ok) {
        setSendStatus('Üzenet elküldve!');
        setMessage('');
      } else {
        const errorData = await res.json();
        setSendStatus(`Hiba: ${errorData.error || 'Ismeretlen hiba történt'}`);
      }
    } catch (err) {
      console.error('Send message error:', err);
      setSendStatus('Hálózati hiba történt.');
    }
  };

  if (hasPermission === null) return <div>Jogosultság ellenőrzése...</div>;
  if (!hasPermission) return <div>Nincs jogosultságod ehhez a szerverhez! <button onClick={() => navigate('/')}>Vissza</button></div>;
  if (!guild) return <div>Szerver betöltése...</div>;

  return (
    <div style={{ padding: 32 }}>
      <h2>{guild.name} szerver dashboard</h2>
      <p>Szerver ID: {guild.id}</p>
      <div style={{ margin: '20px 0' }}>
        <label>Csatorna:
          <select value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)} style={{ marginLeft: 8 }}>
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ margin: '20px 0' }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={3}
          cols={40}
          placeholder="Írd be az üzenetet..."
        />
      </div>
      <button onClick={handleSend}>Küldés</button>
      {sendStatus && <div style={{ marginTop: 12 }}>{sendStatus}</div>}
      <hr style={{ margin: '24px 0' }} />
      <button onClick={() => navigate('/')}>Vissza a főoldalra</button>
    </div>
  );
}

export default GuildDashboard;

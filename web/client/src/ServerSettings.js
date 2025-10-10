import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ServerSettings = ({ serverId }) => {
  const [settings, setSettings] = useState({});
  const [channelId, setChannelId] = useState('');
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [farewellEnabled, setFarewellEnabled] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [farewellMessage, setFarewellMessage] = useState('');

  useEffect(() => {
    // Fetch server settings
    axios.get(`/api/server-settings/${serverId}`)
      .then(response => {
        const data = response.data;
        setSettings(data);
        setChannelId(data.channel_id || '');
        setWelcomeEnabled(data.welcome_enabled || false);
        setFarewellEnabled(data.farewell_enabled || false);
        setWelcomeMessage(data.welcome_message || '');
        setFarewellMessage(data.farewell_message || '');
      })
      .catch(error => {
        console.error('Error fetching server settings:', error);
      });
  }, [serverId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    axios.post(`/api/server-settings/${serverId}`, {
      channelId,
      welcomeEnabled,
      farewellEnabled,
      welcomeMessage,
      farewellMessage
    })
      .then(() => {
        alert('Settings updated successfully!');
      })
      .catch(error => {
        console.error('Error updating settings:', error);
        alert('Failed to update settings.');
      });
  };

  return (
    <div>
      <h2>Server Settings</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Channel ID:</label>
          <input
            type="text"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          />
        </div>
        <div>
          <label>Enable Welcome Messages:</label>
          <input
            type="checkbox"
            checked={welcomeEnabled}
            onChange={(e) => setWelcomeEnabled(e.target.checked)}
          />
        </div>
        <div>
          <label>Welcome Message:</label>
          <textarea
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
          />
        </div>
        <div>
          <label>Enable Farewell Messages:</label>
          <input
            type="checkbox"
            checked={farewellEnabled}
            onChange={(e) => setFarewellEnabled(e.target.checked)}
          />
        </div>
        <div>
          <label>Farewell Message:</label>
          <textarea
            value={farewellMessage}
            onChange={(e) => setFarewellMessage(e.target.value)}
          />
        </div>
        <button type="submit">Save Settings</button>
      </form>
    </div>
  );
};

export default ServerSettings;
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { AnnouncerProvider } from '../components/Announcer';
import { applyTheme } from '../lib/hooks';
import { Popup } from './Popup';

applyTheme('system'); // until settings load, avoid a flash of the wrong theme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnnouncerProvider>
      <Popup />
    </AnnouncerProvider>
  </StrictMode>,
);

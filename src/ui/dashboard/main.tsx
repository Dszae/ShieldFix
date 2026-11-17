import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { AnnouncerProvider } from '../components/Announcer';
import { applyTheme } from '../lib/hooks';
import { Dashboard } from './Dashboard';

applyTheme('system');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnnouncerProvider>
      <Dashboard />
    </AnnouncerProvider>
  </StrictMode>,
);

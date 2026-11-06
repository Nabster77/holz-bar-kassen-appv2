import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { CloudLoginGate } from './components/CloudLoginGate.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CloudLoginGate>
      <App />
    </CloudLoginGate>
  </StrictMode>,
);

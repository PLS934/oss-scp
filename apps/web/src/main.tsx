import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthShell } from './auth-shell';
import './style.css';

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><AuthShell /></BrowserRouter></StrictMode>);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter, isExperiencePath } from './app/AppRouter';
import { installInteractionGuards } from './app/installInteractionGuards';
import './styles/global.css';
import './styles/story.css';
import './styles/not-found.css';
import './styles/restricted-action-toast.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root was not found.');
installInteractionGuards(document.body);
document.documentElement.classList.toggle('is-not-found', !isExperiencePath(window.location.pathname));
createRoot(root).render(<StrictMode><AppRouter /></StrictMode>);

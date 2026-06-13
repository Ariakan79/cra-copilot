import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const ziel = document.getElementById('app');
if (ziel === null) throw new Error('Mount-Punkt #app fehlt');
mount(App, { target: ziel });

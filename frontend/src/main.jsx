import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#1f2937',
          color: '#f3f4f6',
          border: '1px solid #374151',
        },
        success: {
          iconTheme: { primary: '#a855f7', secondary: '#f3f4f6' },
        },
        error: {
          iconTheme: { primary: '#ef4444', secondary: '#f3f4f6' },
        },
      }}
    />
  </StrictMode>,
)

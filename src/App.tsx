import '@storagehub/api-augment';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/Layout';
import { MintNFT } from './pages/MintNFT';
import { Gallery } from './pages/Gallery';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/mint" replace />} />
            <Route path="/mint" element={<MintNFT />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="*" element={<Navigate to="/mint" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;

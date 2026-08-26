import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { NetBanner, Toast } from './components/Feedback';
import { TabBar } from './components/TabBar';
import { Spinner } from './components/ui';
import { AddProduct } from './screens/Add';
import { DateScan } from './screens/DateScan';
import { Dates } from './screens/Dates';
import { ProductDetail } from './screens/Detail';
import { History } from './screens/History';
import { Login } from './screens/Login';
import { Home } from './screens/Home';
import { Manage } from './screens/Manage';
import { Scan } from './screens/Scan';
import { Security } from './screens/Security';
import { Settings } from './screens/Settings';
import { Shopping } from './screens/Shopping';
import { Stock } from './screens/Stock';
import { useStore } from './store';

// Les écrans plein cadre (caméra, formulaire) masquent la barre d'onglets.
const FULLSCREEN = ['/scanner', '/scanner-date', '/ajouter'];

export function App() {
  const { auth } = useStore();
  const { pathname } = useLocation();

  if (auth === 'unknown') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={28} />
      </div>
    );
  }

  if (auth === 'out') {
    return (
      <>
        <NetBanner />
        <Login />
      </>
    );
  }

  const showTabs = !FULLSCREEN.some((p) => pathname.startsWith(p));

  return (
    <>
      <NetBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/produit/:id" element={<ProductDetail />} />
        <Route path="/scanner" element={<Scan />} />
        <Route path="/scanner-date" element={<DateScan />} />
        <Route path="/ajouter" element={<AddProduct />} />
        <Route path="/dates" element={<Dates />} />
        <Route path="/gerer/:kind" element={<Manage />} />
        <Route path="/reglages" element={<Settings />} />
        <Route path="/securite" element={<Security />} />
        <Route path="/historique" element={<History />} />
        <Route path="/courses" element={<Shopping />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showTabs && <TabBar />}
      <Toast />
    </>
  );
}

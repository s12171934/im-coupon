import { Navigate, Route, Routes } from 'react-router-dom';

import { ConsumptionPage } from './pages/ConsumptionPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/consumption" replace />} />
      <Route path="/consumption" element={<ConsumptionPage />} />
      <Route path="*" element={<Navigate to="/consumption" replace />} />
    </Routes>
  );
}

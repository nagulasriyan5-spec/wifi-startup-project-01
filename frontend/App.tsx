import { Routes, Route } from "react-router";
import LandingPage from "./pages/LandingPage";
import MerchantDashboard from "./pages/MerchantDashboard";
import CustomerPortal from "./pages/CustomerPortal";
import PaymentPage from "./pages/PaymentPage";
import BlockchainExplorer from "./pages/BlockchainExplorer";
import HotspotGateway from "./pages/HotspotGateway";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import RoleChoice from "./pages/RoleChoice";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<MerchantDashboard />} />
      <Route path="/connect" element={<CustomerPortal />} />
      <Route path="/hotspot" element={<HotspotGateway />} />
      <Route path="/payment" element={<PaymentPage />} />
      <Route path="/blockchain" element={<BlockchainExplorer />} />
      <Route path="/login" element={<Login />} />
      <Route path="/choose-role" element={<RoleChoice />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

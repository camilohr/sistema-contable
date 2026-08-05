import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthProvider } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Cuentas from "./pages/Cuentas";
import Terceros from "./pages/Terceros";
import Periodos from "./pages/Periodos";
import Comprobantes from "./pages/Comprobantes";
import Reportes from "./pages/Reportes";
import Cartera from "./pages/Cartera";
import Productos from "./pages/Productos";
import ActivosFijos from "./pages/ActivosFijos";
import CierreAnual from "./pages/CierreAnual";
import ProvisionCartera from "./pages/ProvisionCartera";
import Indicadores from "./pages/Indicadores";
import Auditoria from "./pages/Auditoria";
import Usuarios from "./pages/Usuarios";
import CambiarPassword from "./pages/CambiarPassword";
import Empleados from "./pages/Empleados";
import Nomina from "./pages/Nomina";
import ParametrosNomina from "./pages/ParametrosNomina";
import Presupuesto from "./pages/Presupuesto";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/cuentas" element={<Cuentas />} />
            <Route path="/terceros" element={<Terceros />} />
            <Route path="/periodos" element={<Periodos />} />
            <Route path="/comprobantes" element={<Comprobantes />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/cxc" element={<Cartera tipo="cxc" />} />
            <Route path="/cxp" element={<Cartera tipo="cxp" />} />
            <Route path="/productos" element={<Productos />} />
            <Route path="/activos-fijos" element={<ActivosFijos />} />
            <Route path="/cierre-anual" element={<CierreAnual />} />
            <Route path="/provision-cartera" element={<ProvisionCartera />} />
            <Route path="/indicadores" element={<Indicadores />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/auditoria" element={<Auditoria />} />
            <Route path="/empleados" element={<Empleados />} />
            <Route path="/nomina" element={<Nomina />} />
            <Route path="/parametros-nomina" element={<ParametrosNomina />} />
            <Route path="/presupuesto" element={<Presupuesto />} />
            <Route path="/cambiar-password" element={<CambiarPassword />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

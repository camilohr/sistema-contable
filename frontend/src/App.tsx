import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthProvider } from "./context/AuthContext";
import { EmpresaProvider, useEmpresa } from "./context/EmpresaContext";
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

function Inicio() {
  const { empresaActiva, cargando } = useEmpresa();
  if (cargando) return <div className="cargando">Cargando...</div>;
  if (!empresaActiva) return <div className="cargando">No tiene empresas asignadas. Contacte al administrador.</div>;
  return <Navigate to={`/empresa/${empresaActiva.id}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <EmpresaProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/empresa/:empresaId" element={<Dashboard />} />
              <Route path="/empresa/:empresaId/cuentas" element={<Cuentas />} />
              <Route path="/empresa/:empresaId/terceros" element={<Terceros />} />
              <Route path="/empresa/:empresaId/periodos" element={<Periodos />} />
              <Route path="/empresa/:empresaId/comprobantes" element={<Comprobantes />} />
              <Route path="/empresa/:empresaId/reportes" element={<Reportes />} />
              <Route path="/empresa/:empresaId/cxc" element={<Cartera tipo="cxc" />} />
              <Route path="/empresa/:empresaId/cxp" element={<Cartera tipo="cxp" />} />
              <Route path="/empresa/:empresaId/productos" element={<Productos />} />
              <Route path="/empresa/:empresaId/activos-fijos" element={<ActivosFijos />} />
              <Route path="/empresa/:empresaId/cierre-anual" element={<CierreAnual />} />
              <Route path="/empresa/:empresaId/provision-cartera" element={<ProvisionCartera />} />
              <Route path="/empresa/:empresaId/indicadores" element={<Indicadores />} />
              <Route path="/empresa/:empresaId/usuarios" element={<Usuarios />} />
              <Route path="/empresa/:empresaId/auditoria" element={<Auditoria />} />
              <Route path="/empresa/:empresaId/empleados" element={<Empleados />} />
              <Route path="/empresa/:empresaId/nomina" element={<Nomina />} />
              <Route path="/empresa/:empresaId/parametros-nomina" element={<ParametrosNomina />} />
              <Route path="/empresa/:empresaId/presupuesto" element={<Presupuesto />} />
              <Route path="/cambiar-password" element={<CambiarPassword />} />
            </Route>
            <Route path="/" element={<Inicio />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </EmpresaProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

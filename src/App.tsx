import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "./theme";
import Layout from "./components/layout/Layout";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Assessment from "./pages/Assessment";
import Processes from "./pages/Processes";
import ImportExport from "./pages/ImportExport";
import Guide from "./pages/Guide";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter basename="/mita-3.0-ssa">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="assessment/:id" element={<Assessment />} />
            <Route path="processes" element={<Processes />} />
            <Route path="processes/:code" element={<Processes />} />
            <Route path="import-export" element={<ImportExport />} />
            <Route path="guide" element={<Guide />} />
            {/* Catch-all inside Layout so the header and nav stay available */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;

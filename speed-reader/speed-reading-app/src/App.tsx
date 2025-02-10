import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Home from "./pages/Home"; // Make sure this file exists with correct casing
import Reader from "./pages/Reader"; // Make sure this file exists with correct casing
import Settings from "./pages/Settings"; // Make sure this file exists with correct casing
import { SpeedProvider } from "./context/speedcontext"; // Check case and path
import "./styles/global.css";


const App = () => {
  return (
    <SpeedProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/reader" element={<Reader />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Router>
    </SpeedProvider>
  );
};

export default App;

import { Routes, Route } from "react-router-dom";
import { Guest } from "./routes/Guest";
import { Admin } from "./routes/Admin";
import "./App.css";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Guest />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Guest />} />
    </Routes>
  );
}

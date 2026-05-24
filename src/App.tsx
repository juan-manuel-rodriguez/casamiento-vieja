import { Routes, Route } from "react-router-dom";
import { GuestPage } from "./routes/Guest";
import { AdminPage } from "./routes/Admin";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GuestPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<GuestPage />} />
    </Routes>
  );
}

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installUuidNullTrace } from "./lib/debug/uuidNullTrace";

installUuidNullTrace();

createRoot(document.getElementById("root")!).render(<App />);

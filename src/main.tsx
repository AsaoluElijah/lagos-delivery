import { createRoot } from "react-dom/client";

import App from "./App";
import { useGameStore } from "./store/gameStore";
import "./styles/index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

// Handy for poking at gameplay state from the browser console during dev.
if (import.meta.env.DEV) {
  (window as unknown as { lagosStore?: typeof useGameStore }).lagosStore = useGameStore;
}

// Deliberately not wrapped in <StrictMode>: its development-only double mount
// would build and tear down a second WebGL context and Babylon scene on every
// reload. GameCanvas still disposes correctly on real unmount.
createRoot(container).render(<App />);

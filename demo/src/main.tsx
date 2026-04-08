import { createRoot } from "react-dom/client";

import "realtime-voice-component/styles.css";

import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

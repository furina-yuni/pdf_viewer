import ReactDOM from "react-dom/client";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./styles.css";
import App from "./App";

// EmbedPDF owns a long-lived PDFium worker. React's development-only StrictMode
// effect replay destroys the first worker while its WASM module is still
// initialising, so mount the application once just as Electron production does.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

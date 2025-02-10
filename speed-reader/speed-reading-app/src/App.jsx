import { useState } from "react";
import PDFViewer from "./components/PDFViewer";

function App() {
  const [pdfUrl, setPdfUrl] = useState("/sample.pdf"); // Ensure a valid path

  return (
    <div className="h-screen bg-gray-800 text-white flex flex-col items-center justify-center">
      <h1 className="text-2xl mb-4">PDF Viewer</h1>

      <PDFViewer pdfUrl={pdfUrl} />

      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            const fileURL = URL.createObjectURL(e.target.files[0]);
            setPdfUrl(fileURL);
          }
        }}
        className="mt-4 p-2 bg-gray-700 text-white rounded"
      />
    </div>
  );
}

export default App;
